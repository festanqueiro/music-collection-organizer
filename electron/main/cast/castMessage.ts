// Wire format for the Google Cast v2 protocol: every message on the TLS
// socket is a 4-byte big-endian length followed by a protobuf-encoded
// CastMessage. The schema is tiny and fixed, so it's hand-encoded here
// rather than pulling in a protobuf runtime:
//
//   message CastMessage {
//     required ProtocolVersion protocol_version = 1;  // always 0 (CASTV2_1_0)
//     required string source_id = 2;
//     required string destination_id = 3;
//     required string namespace = 4;
//     required PayloadType payload_type = 5;          // 0 = STRING, 1 = BINARY
//     optional string payload_utf8 = 6;
//     optional bytes payload_binary = 7;
//   }
//
// Only STRING (JSON) payloads are used by the channels this app talks to.

export interface CastMessage {
  sourceId: string
  destinationId: string
  namespace: string
  payload: string
}

const WIRE_VARINT = 0
const WIRE_LENGTH_DELIMITED = 2

function encodeVarint(value: number): number[] {
  const bytes: number[] = []
  let v = value >>> 0
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)
  return bytes
}

function encodeStringField(field: number, value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([
    Buffer.from([(field << 3) | WIRE_LENGTH_DELIMITED, ...encodeVarint(data.length)]),
    data,
  ])
}

function encodeVarintField(field: number, value: number): Buffer {
  return Buffer.from([(field << 3) | WIRE_VARINT, ...encodeVarint(value)])
}

export function encodeCastMessage(message: CastMessage): Buffer {
  const body = Buffer.concat([
    encodeVarintField(1, 0),
    encodeStringField(2, message.sourceId),
    encodeStringField(3, message.destinationId),
    encodeStringField(4, message.namespace),
    encodeVarintField(5, 0),
    encodeStringField(6, message.payload),
  ])
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length, 0)
  return Buffer.concat([header, body])
}

function readVarint(buf: Buffer, offset: number): [value: number, next: number] {
  let value = 0
  let shift = 0
  let pos = offset
  for (;;) {
    if (pos >= buf.length) throw new Error('truncated varint')
    const byte = buf[pos++]
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return [value, pos]
    shift += 7
    if (shift > 49) throw new Error('varint too long')
  }
}

// Decodes one CastMessage body (without the length prefix). Unknown
// fields are skipped; a binary payload decodes as an empty string.
export function decodeCastMessage(body: Buffer): CastMessage {
  const message: CastMessage = { sourceId: '', destinationId: '', namespace: '', payload: '' }
  let pos = 0
  while (pos < body.length) {
    const [tag, afterTag] = readVarint(body, pos)
    const field = Math.floor(tag / 8)
    const wireType = tag & 7
    pos = afterTag
    if (wireType === WIRE_VARINT) {
      pos = readVarint(body, pos)[1]
    } else if (wireType === WIRE_LENGTH_DELIMITED) {
      const [length, start] = readVarint(body, pos)
      const end = start + length
      if (end > body.length) throw new Error('truncated field')
      const value = body.subarray(start, end).toString('utf8')
      if (field === 2) message.sourceId = value
      else if (field === 3) message.destinationId = value
      else if (field === 4) message.namespace = value
      else if (field === 6) message.payload = value
      pos = end
    } else {
      throw new Error(`unsupported wire type ${wireType}`)
    }
  }
  return message
}

// Accumulates socket data and yields every complete frame — TCP delivers
// arbitrary slices, so a frame can arrive split across chunks or several
// frames can arrive in one.
export class CastFrameReader {
  private buffered: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): CastMessage[] {
    this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk])
    const messages: CastMessage[] = []
    while (this.buffered.length >= 4) {
      const length = this.buffered.readUInt32BE(0)
      if (this.buffered.length < 4 + length) break
      messages.push(decodeCastMessage(this.buffered.subarray(4, 4 + length)))
      this.buffered = this.buffered.subarray(4 + length)
    }
    return messages
  }
}
