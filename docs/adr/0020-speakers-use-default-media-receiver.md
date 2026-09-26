---
status: accepted
date: 2026-09-26
---
# 0020. Audio-only Cast devices go straight to Google's Default Media Receiver

## Context
Casting to a Nest Mini sat on "connecting" for 15 s. Probing it showed that it never answers a
LAUNCH of MCO's app (E056A69A) — no reply, not even `LAUNCH_ERROR` — so MCO waited for its request
timeout before falling back; the Default Media Receiver launches in ~2 s
([research](../research/cast-devices.md#nest-mini-and-mcos-app)).

## Decision
Devices whose mDNS capability bits (`ca`) have no video output are treated as audio-only and launch
the Default Media Receiver directly (`electron/main/cast/castSession.ts`).

## Consequences
- Speakers connect in a couple of seconds and play the tracks; MCO's effects and siren aren't heard
  there (they'd need MCO's receiver, which speakers won't run).
