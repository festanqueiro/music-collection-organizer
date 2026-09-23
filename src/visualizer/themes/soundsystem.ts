import * as THREE from 'three'
import { SpectrumBars, disposeScene } from '../shared'
import { hasTagWord } from '../tagMatch'
import type { AudioFrame, ThemeInstance, VisualizerTheme } from '../types'

// A Jamaican-style sound system stack, modelled on a classic outdoor set —
// cabinets stacked on pallets in daylight, in front of a corrugated-metal
// wall with graffiti — but painted in the app's own palette
// (src/theme.css): slate cabinets with accent-teal and secondary-purple
// baffles, as worn paint over plywood (grain showing through, brush
// strokes, chips). Every row of boxes answers to its own slice of the
// spectrum:
//
//   top horn + tweeter bars   → tops      (domes shimmer, horn throats glow)
//   row 3 (2×10" boxes)       → low-mids (centre) / mids (sides)
//   row 2 (grille + horn cells) → bass    (cones pump, pressure rings)
//   row 1 (four scoops)       → sub       (big spring-driven excursion,
//                                           box recoil, pressure rings and
//                                           dust puffed out of the horn
//                                           mouths on hard pushes)
//
// Everything is procedural (geometry + canvas textures) — no assets.

// App palette — mirrors the CSS custom properties in src/theme.css.
const APP_SURFACE_RAISED = '#232833' // --color-surface-raised
const APP_BORDER = '#2b3140' // --color-border
const APP_TEXT_DIM = 0x9aa3b2 // --color-text-dim
const APP_ACCENT = 0x2dd4bf // --color-accent
const APP_ACCENT_STRONG = 0x14b8a6 // --color-accent-strong
const APP_SECONDARY = 0xa78bfa // --color-secondary
const BLACK = 0x0a0c10
const BARE_WOOD = '#b98a5a'

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

// Band indices into the 5 log-spaced SpectrumBars (30Hz..16kHz):
// ~30-106Hz, ~106-374Hz, ~374Hz-1.3k, ~1.3-4.7k, ~4.7-16k.
const SUB = 0
const BASS = 1
const LOW_MID = 2
const MID = 3
const TOP = 4

const DUST_COUNT = 900

// Bass cone spring (see update): stiffness sets how quickly a cone chases
// the level, damping just under critical gives a soft overshoot per kick.
const SPRING_STIFFNESS = 140
const SPRING_DAMPING = 2 * 0.6 * Math.sqrt(SPRING_STIFFNESS)

// A pressure ring fires when its driver's spring is past this excursion
// (in level units, ~0..1.2) and still moving outward faster than this —
// see update. The interval stops one push from firing twice.
const RING_MIN_EXCURSION = 0.5
const RING_MIN_VELOCITY = 1.5
const RING_MIN_INTERVAL = 0.3

// Deterministic PRNG so textures look the same every time the theme opens.
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  repeat?: [number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  return texture
}

function plywoodTexture(base: string, seed: number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const random = mulberry32(seed)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 70; i++) {
      const y = random() * h
      const amplitude = 2 + random() * 6
      const phase = random() * Math.PI * 2
      ctx.strokeStyle = random() < 0.5 ? `rgba(0,0,0,${0.1 + random() * 0.2})` : `rgba(200,215,235,${0.03 + random() * 0.05})`
      ctx.lineWidth = 0.5 + random() * 2.5
      ctx.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x / 40 + phase) * amplitude
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
  })
}

// Greyscale plywood grain (mid-grey = flat). It's the bump map under the
// paint, and is overlaid into the colour so the grain reads through.
function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number): void {
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 140; i++) {
    const y = random() * h
    const amplitude = 3 + random() * 10
    const phase = random() * Math.PI * 2
    const shade = random() < 0.6 ? 70 + random() * 40 : 150 + random() * 40
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.25 + random() * 0.45})`
    ctx.lineWidth = 0.8 + random() * 3
    ctx.beginPath()
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x / 70 + phase) * amplitude + Math.sin(x / 13 + phase * 2) * 0.8
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
}

// Worn paint over plywood: a solid coat with brush strokes, the grain
// telegraphing through it, and chips/scratches back to bare wood. Returns
// the colour map plus the grain as a bump map, so the sun picks out the
// relief.
function paintedWood(paint: string, seed: number): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512
  const grainCanvas = document.createElement('canvas')
  grainCanvas.width = grainCanvas.height = size
  drawGrain(grainCanvas.getContext('2d')!, size, size, mulberry32(seed))

  const map = canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const random = mulberry32(seed + 101)
      ctx.fillStyle = paint
      ctx.fillRect(0, 0, w, h)
      // Brush strokes: long, mostly horizontal drags a shade lighter or
      // darker than the coat.
      for (let i = 0; i < 260; i++) {
        const light = random() < 0.5
        ctx.strokeStyle = light ? `rgba(255,255,255,${0.03 + random() * 0.06})` : `rgba(0,0,0,${0.04 + random() * 0.08})`
        ctx.lineWidth = 2 + random() * 9
        ctx.lineCap = 'round'
        const x = random() * w
        const y = random() * h
        const length = 60 + random() * 320
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + length / 2, y + (random() - 0.5) * 10, x + length, y + (random() - 0.5) * 6)
        ctx.stroke()
      }
      // Grain showing through the paint.
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = 0.4
      ctx.drawImage(grainCanvas, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      // Chips back to bare wood, each with a darker, grimy rim.
      for (let i = 0; i < 26; i++) {
        const cx = random() * w
        const cy = random() * h
        const radius = 2 + random() * 9
        ctx.beginPath()
        for (let k = 0; k < 9; k++) {
          const angle = (k / 9) * Math.PI * 2
          const r = radius * (0.5 + random() * 0.8)
          const px = cx + Math.cos(angle) * r * 1.6
          const py = cy + Math.sin(angle) * r
          if (k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fillStyle = BARE_WOOD
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,25,10,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // Scratches.
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = `rgba(185,138,90,${0.25 + random() * 0.4})`
        ctx.lineWidth = 0.6 + random() * 1.2
        const x = random() * w
        const y = random() * h
        const angle = (random() - 0.5) * 1.2
        const length = 8 + random() * 40
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
        ctx.stroke()
      }
    },
    [1, 1],
  )
  const bumpMap = new THREE.CanvasTexture(grainCanvas)
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping
  return { map, bumpMap }
}

function paintedWoodMaterial(paint: string, seed: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...paintedWood(paint, seed), bumpScale: 1.5, roughness: 0.62 })
}

// Graffiti tags in the accent colours, sprayed on the wall.
function drawGraffiti(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const random = mulberry32(17)
  ctx.save()
  ctx.translate(w * 0.62, h * 0.52)
  ctx.rotate(-0.08)
  ctx.font = 'bold 300px "Marker Felt", "Chalkboard SE", Impact, sans-serif'
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 26
  ctx.strokeStyle = '#2dd4bf'
  ctx.strokeText('DUB', 0, 0)
  ctx.restore()
  ctx.save()
  ctx.translate(w * 0.22, h * 0.35)
  ctx.rotate(0.05)
  ctx.font = 'bold 150px "Marker Felt", "Chalkboard SE", Impact, sans-serif'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  ctx.strokeStyle = '#a78bfa'
  ctx.strokeText('MCO', 0, 0)
  ctx.restore()
  ctx.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(45,212,191,0.55)' : 'rgba(167,139,250,0.55)'
    ctx.lineWidth = 6 + random() * 10
    ctx.beginPath()
    let x = w * (0.1 + random() * 0.8)
    let y = h * (0.2 + random() * 0.6)
    ctx.moveTo(x, y)
    for (let s = 0; s < 5; s++) {
      x += (random() - 0.5) * 220
      y += (random() - 0.5) * 160
      ctx.quadraticCurveTo(x + (random() - 0.5) * 120, y + (random() - 0.5) * 120, x, y)
    }
    ctx.stroke()
  }
}

// Corrugated sheet colour (weathered grey + rust streaks) with graffiti.
function wallTexture(): THREE.CanvasTexture {
  return canvasTexture(2048, 768, (ctx, w, h) => {
    const random = mulberry32(7)
    ctx.fillStyle = '#b3aea3'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) {
      const x = random() * w
      const gradient = ctx.createLinearGradient(0, 0, 0, h)
      gradient.addColorStop(0, `rgba(130,80,40,${0.05 + random() * 0.15})`)
      gradient.addColorStop(1, 'rgba(130,80,40,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(x, 0, 6 + random() * 30, h * (0.3 + random() * 0.7))
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(${150 + random() * 40},${150 + random() * 40},${140 + random() * 30},0.35)`
      ctx.fillRect(random() * w, 0, 60 + random() * 200, h)
    }
    drawGraffiti(ctx, w, h)
  })
}

function stoneTexture(): THREE.CanvasTexture {
  return canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const random = mulberry32(3)
      ctx.fillStyle = '#6f6a60'
      ctx.fillRect(0, 0, w, h)
      let y = 0
      while (y < h) {
        const rowHeight = 22 + random() * 26
        let x = -random() * 40
        while (x < w) {
          const stoneWidth = 30 + random() * 60
          const shade = 120 + random() * 60
          ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`
          ctx.beginPath()
          ctx.roundRect(x + 2, y + 2, stoneWidth - 4, rowHeight - 4, 6)
          ctx.fill()
          x += stoneWidth
        }
        y += rowHeight
      }
    },
    [4, 1.2],
  )
}

function groundTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const random = mulberry32(11)
      ctx.fillStyle = '#8f877a'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 2500; i++) {
        const shade = 110 + random() * 70
        ctx.fillStyle = `rgba(${shade},${shade - 8},${shade - 18},0.5)`
        ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 3)
      }
    },
    [10, 10],
  )
}

// Perforated black grille (alpha-tested holes) for the row-2 drivers.
function grilleTexture(): THREE.CanvasTexture {
  return canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'destination-out'
      for (let y = 4; y < h; y += 8) {
        for (let x = 4 + ((y / 8) % 2) * 4; x < w; x += 8) {
          ctx.beginPath()
          ctx.arc(x, y, 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    },
    [10, 10],
  )
}

interface Materials {
  cabinet: THREE.MeshStandardMaterial
  cabinetLight: THREE.MeshStandardMaterial
  teal: THREE.MeshStandardMaterial
  purple: THREE.MeshStandardMaterial
  black: THREE.MeshStandardMaterial
  cone: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  grille: THREE.MeshStandardMaterial
}

interface Driver {
  group: THREE.Group
  cone: THREE.Group
  surround: THREE.Mesh
  dome?: THREE.Mesh
  radius: number
}

// A cone driver facing +z: basket rim, rubber surround, concave paper
// cone and dust cap. `cone` (cone + cap) is what moves.
function makeDriver(radius: number, materials: Materials, options: { grille?: boolean; tweeter?: boolean } = {}): Driver {
  const group = new THREE.Group()
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.08, 48), materials.metal)
  rim.position.z = 0.004
  group.add(rim)
  const surround = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, radius * 0.07, 10, 48), materials.rubber)
  surround.scale.z = 0.6
  group.add(surround)

  const cone = new THREE.Group()
  const depth = radius * (options.tweeter ? 0.15 : 0.45)
  const profile: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const f = i / 10
    profile.push(new THREE.Vector2(radius * (0.28 + 0.54 * f), -depth * (1 - Math.pow(f, 0.7))))
  }
  const coneGeometry = new THREE.LatheGeometry(profile, 48)
  coneGeometry.rotateX(Math.PI / 2)
  cone.add(new THREE.Mesh(coneGeometry, materials.cone))

  const capGeometry = new THREE.SphereGeometry(radius * 0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  capGeometry.rotateX(Math.PI / 2)
  const dome = new THREE.Mesh(capGeometry, options.tweeter ? materials.metal.clone() : materials.cone)
  dome.position.z = -depth
  dome.scale.z = options.tweeter ? 0.9 : 0.5
  cone.add(dome)
  group.add(cone)
  const backing = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.1, 40), materials.rubber)
  backing.position.z = -depth - 0.03
  group.add(backing)

  if (options.grille) {
    const grille = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.02, 48), materials.grille)
    grille.position.z = radius * 0.45
    group.add(grille)
  }
  group.traverse((object) => {
    object.castShadow = true
    object.receiveShadow = true
  })
  return { group, cone, surround, dome: options.tweeter ? dome : undefined, radius }
}

// Five-sided plywood shell (open front) so recessed horn cells can sit
// inside it; the caller adds the front baffles/cells.
function makeShell(w: number, h: number, d: number, material: THREE.Material): THREE.Group {
  const t = 0.04
  const shell = new THREE.Group()
  const parts: Array<[number, number, number, number, number, number]> = [
    [w, t, d, 0, h / 2 - t / 2, 0],
    [w, t, d, 0, -h / 2 + t / 2, 0],
    [t, h, d, -w / 2 + t / 2, 0, 0],
    [t, h, d, w / 2 - t / 2, 0, 0],
    [w, h, t, 0, 0, -d / 2 + t / 2],
  ]
  for (const [pw, ph, pd, x, y, z] of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    shell.add(mesh)
  }
  return shell
}

// A front baffle covering part of the cabinet front, inset slightly so the
// plywood edge frames it like in the photo, with real cut-outs for the
// drivers — a solid panel would hide their recessed cones.
function makeBaffle(
  w: number,
  h: number,
  material: THREE.Material,
  holes: Array<{ x: number; y: number; r: number } | { x: number; y: number; w: number; h: number }> = [],
): THREE.Mesh {
  const thickness = 0.03
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, -h / 2)
  shape.lineTo(w / 2, -h / 2)
  shape.lineTo(w / 2, h / 2)
  shape.lineTo(-w / 2, h / 2)
  shape.lineTo(-w / 2, -h / 2)
  for (const hole of holes) {
    const path = new THREE.Path()
    if ('r' in hole) {
      path.absarc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true)
    } else {
      // Clockwise, opposite the outer contour, so it cuts rather than fills.
      path.moveTo(hole.x - hole.w / 2, hole.y - hole.h / 2)
      path.lineTo(hole.x - hole.w / 2, hole.y + hole.h / 2)
      path.lineTo(hole.x + hole.w / 2, hole.y + hole.h / 2)
      path.lineTo(hole.x + hole.w / 2, hole.y - hole.h / 2)
      path.lineTo(hole.x - hole.w / 2, hole.y - hole.h / 2)
    }
    shape.holes.push(path)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 32 })
  geometry.translate(0, 0, -thickness / 2)
  // ExtrudeGeometry UVs are in shape units; scale down so the plywood
  // grain isn't stretched across the whole panel.
  const uv = geometry.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.8, uv.getY(i) * 0.8)
  const baffle = new THREE.Mesh(geometry, material)
  baffle.castShadow = true
  baffle.receiveShadow = true
  return baffle
}

// A grid of recessed horn mouths: a back panel `depth` deep plus
// dividers, with plywood strips on the dividers' front edges.
function makeCells(
  w: number,
  h: number,
  depth: number,
  cols: number,
  rows: number,
  inner: THREE.Material,
  edge: THREE.Material,
): { group: THREE.Group; mouths: THREE.Vector3[] } {
  const group = new THREE.Group()
  const t = 0.035
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), inner)
  back.position.z = -depth
  back.receiveShadow = true
  group.add(back)
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  for (let c = 0; c <= cols; c++) {
    const x = -w / 2 + (c / cols) * w
    const divider = new THREE.Mesh(new THREE.BoxGeometry(t, h, depth), inner)
    divider.position.set(x, 0, -depth / 2)
    add(divider)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(t + 0.01, h, 0.02), edge)
    strip.position.set(x, 0, 0)
    add(strip)
  }
  for (let r = 0; r <= rows; r++) {
    const y = -h / 2 + (r / rows) * h
    const divider = new THREE.Mesh(new THREE.BoxGeometry(w, t, depth), inner)
    divider.position.set(0, y, -depth / 2)
    add(divider)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, t + 0.01, 0.02), edge)
    strip.position.set(0, y, 0)
    add(strip)
  }
  const mouths: THREE.Vector3[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      mouths.push(new THREE.Vector3(-w / 2 + ((c + 0.5) / cols) * w, -h / 2 + ((r + 0.5) / rows) * h, 0))
    }
  }
  return { group, mouths }
}

// A rectangular horn flare (open frustum) facing +z, mouth at z=0.
function makeHorn(mouthW: number, mouthH: number, throatScale: number, depth: number, material: THREE.Material) {
  const geometry = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * throatScale, depth, 4, 1, true)
  geometry.rotateY(Math.PI / 4)
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, 0, -depth / 2)
  const horn = new THREE.Mesh(geometry, material)
  horn.scale.set(mouthW, mouthH, 1)
  horn.receiveShadow = true
  return horn
}

// Points with per-particle alpha/size — PointsMaterial only does
// per-material opacity, and the dust needs to fade individually.
const DUST_VERTEX_SHADER = /* glsl */ `
attribute float alpha;
attribute float size;
varying float vAlpha;
void main() {
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const DUST_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.0, d));
}
`

function create(): ThemeInstance {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xcfdde6)
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)

  const materials: Materials = {
    cabinet: paintedWoodMaterial(APP_SURFACE_RAISED, 1),
    cabinetLight: paintedWoodMaterial(APP_BORDER, 2),
    teal: paintedWoodMaterial(hex(APP_ACCENT_STRONG), 3),
    purple: paintedWoodMaterial(hex(APP_SECONDARY), 4),
    black: new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.9, side: THREE.DoubleSide }),
    cone: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: APP_TEXT_DIM, roughness: 0.3, metalness: 0.8 }),
    grille: new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.6,
      metalness: 0.4,
      alphaMap: grilleTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
  }

  // --- Environment -------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xe6eef5, 0x8a7a66, 1.1))
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6)
  sun.position.set(5, 9, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 8
  sun.shadow.camera.bottom = -2
  sun.shadow.camera.far = 30
  sun.shadow.bias = -0.0005
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const WALL_Z = -1.3
  const STONE_HEIGHT = 2.3
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(18, STONE_HEIGHT, 0.4),
    new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 }),
  )
  stone.position.set(0, STONE_HEIGHT / 2, WALL_Z - 0.2)
  stone.receiveShadow = true
  scene.add(stone)
  // Real corrugation (displaced vertices), so the sun rakes across ridges.
  const sheetGeometry = new THREE.PlaneGeometry(18, 6, 600, 1)
  const sheetPositions = sheetGeometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < sheetPositions.count; i++) {
    sheetPositions.setZ(i, Math.sin((sheetPositions.getX(i) / 0.16) * Math.PI * 2) * 0.035)
  }
  sheetGeometry.computeVertexNormals()
  const sheet = new THREE.Mesh(sheetGeometry, new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.6, metalness: 0.35 }))
  sheet.position.set(0, STONE_HEIGHT + 3, WALL_Z - 0.35)
  sheet.receiveShadow = true
  scene.add(sheet)

  // Pallets under the stack.
  const PALLET_HEIGHT = 0.14
  const palletMaterial = new THREE.MeshStandardMaterial({ map: plywoodTexture('#b89a72', 5), roughness: 0.9 })
  for (const px of [-1.6, 0, 1.6]) {
    for (let s = 0; s < 7; s++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.14), palletMaterial)
      slat.position.set(px, PALLET_HEIGHT - 0.015, -0.55 + s * 0.19)
      slat.castShadow = true
      slat.receiveShadow = true
      scene.add(slat)
    }
    for (const bz of [-0.55, 0, 0.55]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.5, PALLET_HEIGHT - 0.03, 0.1), palletMaterial)
      block.position.set(px, (PALLET_HEIGHT - 0.03) / 2, bz)
      block.castShadow = true
      scene.add(block)
    }
  }

  // --- The stack -----------------------------------------------------------
  interface Box {
    group: THREE.Group
    base: THREE.Vector3
    band: number
    shake: number
  }
  const boxes: Box[] = []
  // `position`/`velocity` are the bass drivers' spring state (see update).
  interface DriverEntry {
    driver: Driver
    band: number
    throw: number
    flutter: number
    position: number
    velocity: number
  }
  const drivers: DriverEntry[] = []
  const pressureRings: Array<{ mesh: THREE.Mesh; age: number; radius: number; origin: THREE.Vector3; source: DriverEntry }> = []
  const dustEmitters: THREE.Vector3[] = []
  const hornGlows: Array<{ material: THREE.MeshStandardMaterial }> = []
  const tweeterDomes: THREE.Mesh[] = []

  const ringGeometry = new THREE.RingGeometry(0.92, 1, 64)
  function addPressureRing(worldCenter: THREE.Vector3, radius: number, source: DriverEntry) {
    const mesh = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: APP_ACCENT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    )
    mesh.position.copy(worldCenter)
    scene.add(mesh)
    pressureRings.push({ mesh, age: Infinity, radius, origin: worldCenter.clone(), source })
  }

  function addBox(group: THREE.Group, position: THREE.Vector3, band: number, shake: number) {
    group.position.copy(position)
    scene.add(group)
    boxes.push({ group, base: position.clone(), band, shake })
  }

  function addDriver(parent: THREE.Group, x: number, y: number, z: number, radius: number, band: number, throwAmount: number, flutter: number, options: { grille?: boolean; tweeter?: boolean } = {}) {
    const driver = makeDriver(radius, materials, options)
    driver.group.position.set(x, y, z)
    parent.add(driver.group)
    const entry: DriverEntry = { driver, band, throw: throwAmount, flutter, position: 0, velocity: 0 }
    drivers.push(entry)
    if (driver.dome) tweeterDomes.push(driver.dome)
    return entry
  }

  // Row 1: four scoops — teal top baffle with an 18", black horn cells below.
  const ROW1_W = 1.15
  const ROW1_H = 2.0
  const ROW1_D = 1.2
  const row1Y = PALLET_HEIGHT + ROW1_H / 2
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * (ROW1_W + 0.02)
    const group = makeShell(ROW1_W, ROW1_H, ROW1_D, materials.cabinet)
    const baffleH = 0.9
    const baffle = makeBaffle(ROW1_W - 0.06, baffleH - 0.04, materials.teal, [{ x: 0, y: 0, r: 0.4 }])
    baffle.position.set(0, ROW1_H / 2 - baffleH / 2, ROW1_D / 2 - 0.03)
    group.add(baffle)
    const scoopDriver = addDriver(group, 0, ROW1_H / 2 - baffleH / 2, ROW1_D / 2 - 0.005, 0.4, SUB, 0.34, 0)
    const cells = makeCells(ROW1_W - 0.06, ROW1_H - baffleH - 0.04, 0.9, 2, 2, materials.black, materials.teal)
    cells.group.position.set(0, -ROW1_H / 2 + (ROW1_H - baffleH) / 2, ROW1_D / 2 - 0.01)
    group.add(cells.group)
    const position = new THREE.Vector3(x, row1Y, 0)
    addBox(group, position, SUB, 0.012)
    for (const mouth of cells.mouths) {
      dustEmitters.push(mouth.clone().add(cells.group.position).add(position))
    }
    addPressureRing(new THREE.Vector3(x, row1Y + ROW1_H / 2 - baffleH / 2, ROW1_D / 2 + 0.05), 0.4, scoopDriver)
  }

  // Row 2: two wide boxes — grilled driver on the inner half, orange horn
  // cells on the outer half.
  const ROW2_W = 2.3
  const ROW2_H = 1.0
  const ROW2_D = 1.05
  const row2Y = PALLET_HEIGHT + ROW1_H + ROW2_H / 2
  for (const side of [-1, 1]) {
    const x = side * (ROW2_W / 2 + 0.01)
    const group = makeShell(ROW2_W, ROW2_H, ROW2_D, materials.cabinet)
    const half = ROW2_W / 2
    const driverX = -side * half / 2
    const baffle = makeBaffle(half - 0.04, ROW2_H - 0.06, materials.purple, [{ x: 0, y: 0, r: 0.4 }])
    baffle.position.set(driverX, 0, ROW2_D / 2 - 0.02)
    group.add(baffle)
    const bassDriver = addDriver(group, driverX, 0, ROW2_D / 2 - 0.002, 0.4, BASS, 0.14, 0, { grille: true })
    const cells = makeCells(half - 0.04, ROW2_H - 0.06, 0.8, 2, 2, materials.cabinet, materials.purple)
    cells.group.position.set(side * half / 2, 0, ROW2_D / 2 - 0.01)
    group.add(cells.group)
    addBox(group, new THREE.Vector3(x, row2Y, 0), BASS, 0.006)
    addPressureRing(new THREE.Vector3(x + driverX, row2Y, ROW2_D / 2 + 0.2), 0.4, bassDriver)
  }

  // Row 3: three boxes with two 10"s each — teal sides (mids), orange
  // centre (low-mids).
  const ROW3_W = 1.3
  const ROW3_H = 0.62
  const ROW3_D = 0.8
  const row3Y = PALLET_HEIGHT + ROW1_H + ROW2_H + ROW3_H / 2
  for (const slot of [-1, 0, 1]) {
    const band = slot === 0 ? LOW_MID : MID
    const group = makeShell(ROW3_W, ROW3_H, ROW3_D, materials.cabinet)
    const holeRadius = slot === 0 ? 0.27 : 0.21
    const baffle = makeBaffle(ROW3_W - 0.06, ROW3_H - 0.06, slot === 0 ? materials.purple : materials.teal, [
      { x: -0.3, y: 0, r: holeRadius },
      { x: 0.3, y: 0, r: holeRadius },
    ])
    baffle.position.set(0, 0, ROW3_D / 2 - 0.02)
    group.add(baffle)
    for (const dx of [-0.3, 0.3]) {
      if (slot === 0) {
        // The centre box's wider cut-outs show a black recess around each driver.
        const recess = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40), materials.black)
        recess.position.set(dx, 0, ROW3_D / 2 - 0.13)
        group.add(recess)
      }
      addDriver(group, dx, 0, ROW3_D / 2, 0.21, band, 0.035, 0.008)
    }
    addBox(group, new THREE.Vector3(slot * (ROW3_W + 0.12), row3Y, 0.05), band, 0.003)
  }

  // Row 4: tweeter bars on the sides, teal horn box in the middle.
  const row4Base = PALLET_HEIGHT + ROW1_H + ROW2_H + ROW3_H
  for (const side of [-1, 1]) {
    const w = 1.05
    const h = 0.34
    const d = 0.6
    const group = makeShell(w, h, d, materials.cabinetLight)
    const tweeterXs = [-0.33, -0.11, 0.11, 0.33]
    const baffle = makeBaffle(
      w - 0.05,
      h - 0.05,
      materials.cabinetLight,
      tweeterXs.map((x) => ({ x, y: 0, r: 0.085 })),
    )
    baffle.position.set(0, 0, d / 2 - 0.02)
    group.add(baffle)
    for (const dx of tweeterXs) addDriver(group, dx, 0, d / 2, 0.075, TOP, 0.006, 0.004, { tweeter: true })
    addBox(group, new THREE.Vector3(side * 1.4, row4Base + h / 2, 0.1), TOP, 0.0015)
  }
  {
    const w = 1.2
    const h = 0.55
    const d = 0.7
    const group = makeShell(w, h, d, materials.cabinet)
    const tweeterSpots = [-0.47, 0.47].flatMap((x) => [-0.12, 0.12].map((y) => ({ x, y })))
    const baffle = makeBaffle(w - 0.05, h - 0.05, materials.teal, [
      { x: 0, y: 0.02, w: 0.62, h: 0.4 },
      ...tweeterSpots.map(({ x, y }) => ({ x, y, r: 0.068 })),
    ])
    baffle.position.set(0, 0, d / 2 - 0.02)
    group.add(baffle)
    const horn = makeHorn(0.62, 0.4, 0.25, 0.45, materials.black)
    horn.position.set(0, 0.02, d / 2 - 0.004)
    group.add(horn)
    const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: APP_ACCENT, emissiveIntensity: 0 })
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * 0.25 * 0.9, 0.4 * 0.25 * 0.9), glowMaterial)
    throat.position.set(0, 0.02, d / 2 - 0.45)
    group.add(throat)
    hornGlows.push({ material: glowMaterial })
    for (const { x, y } of tweeterSpots) addDriver(group, x, y, d / 2, 0.06, TOP, 0.005, 0.004, { tweeter: true })
    addBox(group, new THREE.Vector3(0, row4Base + h / 2, 0.08), TOP, 0.0015)

    // The big square horn on top.
    const topW = 0.95
    const topH = 0.62
    const topD = 0.8
    const top = makeShell(topW, topH, topD, materials.cabinet)
    const topHorn = makeHorn(topW - 0.08, topH - 0.08, 0.2, 0.6, materials.black)
    topHorn.position.set(0, 0, topD / 2)
    top.add(topHorn)
    const topGlowMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: APP_ACCENT, emissiveIntensity: 0 })
    const topThroat = new THREE.Mesh(new THREE.PlaneGeometry((topW - 0.08) * 0.2 * 0.9, (topH - 0.08) * 0.2 * 0.9), topGlowMaterial)
    topThroat.position.set(0, 0, topD / 2 - 0.6)
    top.add(topThroat)
    hornGlows.push({ material: topGlowMaterial })
    addBox(top, new THREE.Vector3(0, row4Base + h + topH / 2, 0.05), TOP, 0.002)
  }

  // --- Dust puffed out of the scoops' horn mouths -------------------------
  const dustPositions = new Float32Array(DUST_COUNT * 3)
  const dustAlpha = new Float32Array(DUST_COUNT)
  const dustSize = new Float32Array(DUST_COUNT)
  const dustVelocity = new Float32Array(DUST_COUNT * 3)
  const dustLife = new Float32Array(DUST_COUNT)
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  dustGeometry.setAttribute('alpha', new THREE.BufferAttribute(dustAlpha, 1))
  dustGeometry.setAttribute('size', new THREE.BufferAttribute(dustSize, 1))
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xd8ccb4) } },
      vertexShader: DUST_VERTEX_SHADER,
      fragmentShader: DUST_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    }),
  )
  dust.frustumCulled = false
  scene.add(dust)
  let nextDust = 0
  function emitDust(count: number, strength: number) {
    for (let n = 0; n < count; n++) {
      const i = nextDust
      nextDust = (nextDust + 1) % DUST_COUNT
      const emitter = dustEmitters[Math.floor(Math.random() * dustEmitters.length)]
      dustPositions[i * 3] = emitter.x + (Math.random() - 0.5) * 0.4
      dustPositions[i * 3 + 1] = emitter.y + (Math.random() - 0.5) * 0.35
      dustPositions[i * 3 + 2] = emitter.z + 0.05
      dustVelocity[i * 3] = (Math.random() - 0.5) * 0.8
      dustVelocity[i * 3 + 1] = (Math.random() - 0.3) * 0.5
      dustVelocity[i * 3 + 2] = (1.5 + Math.random() * 2.5) * strength
      dustLife[i] = 1
      dustSize[i] = 0.05 + Math.random() * 0.12
    }
  }

  const spectrum = new SpectrumBars(5, 30, 16000)
  let dustAccumulator = 0

  function update(frame: AudioFrame): number {
    const { t, dt, flash } = frame
    // Fast attack so cones visibly punch on kicks.
    const levels = spectrum.update(frame, 0.75, 0.25)
    const sub = levels[SUB]
    const bass = levels[BASS]
    const top = levels[TOP]
    // The beat detector's flash, scaled by how loud the sub actually is —
    // it fires on bass rising above its recent average, which happens as
    // readily in a quiet passage as in a heavy one; weighting by level
    // keeps the kick effects (lights, camera, cone punch) to loud kicks.
    const kick = flash * sub

    // Bass cones ride a slightly under-damped spring toward their level:
    // smooth, big excursion that pushes the cone right out past the baffle
    // on heavy sub, with a little overshoot on each kick — rather than
    // tracking the (jittery) level directly. The surround follows at half
    // travel, so it reads as stretching rather than the cone detaching.
    // Mids/tops stay direct, with a fast flutter that reads as vibration.
    let subExcursion = 0
    let subCount = 0
    for (const entry of drivers) {
      const { driver, band, throw: throwAmount, flutter } = entry
      const level = levels[band]
      if (band <= BASS) {
        const target = Math.pow(level, 1.3) + kick * 0.2
        const steps = 2
        const h = dt / steps
        for (let step = 0; step < steps; step++) {
          entry.velocity += ((target - entry.position) * SPRING_STIFFNESS - entry.velocity * SPRING_DAMPING) * h
          entry.position += entry.velocity * h
        }
        const excursion = Math.max(-0.1, entry.position) * throwAmount
        driver.cone.position.z = excursion
        driver.surround.position.z = excursion * 0.5
        // Head-on, forward travel alone barely reads — a slight swell
        // sells the cone coming out at the viewer.
        driver.cone.scale.setScalar(1 + excursion * 0.45)
        driver.surround.scale.set(1 + excursion * 0.2, 1 + excursion * 0.2, 0.6)
        if (band === SUB) {
          subExcursion += excursion
          subCount++
        }
      } else {
        const vibration = Math.sin(t * 70 + driver.radius * 50) * flutter * level
        driver.cone.position.z = Math.pow(level, 1.6) * throwAmount + vibration
      }
    }
    subExcursion /= Math.max(1, subCount)

    // Tweeter domes shimmer with the tops.
    for (const dome of tweeterDomes) {
      const material = dome.material as THREE.MeshStandardMaterial
      material.emissive.setHex(APP_ACCENT)
      material.emissiveIntensity = Math.pow(top, 1.5) * 1.6
      dome.scale.setScalar(1 + top * 0.25)
      dome.scale.z = 0.9 + top * 0.3
    }
    for (const { material } of hornGlows) material.emissiveIntensity = Math.pow(top, 1.3) * 4 + kick * 0.4

    // The scoops recoil smoothly against their cones' push; the smaller
    // boxes rattle with their band.
    for (const box of boxes) {
      if (box.band === SUB) {
        box.group.position.set(box.base.x, box.base.y, box.base.z - subExcursion * 0.06)
        continue
      }
      const level = levels[box.band]
      const amount = box.shake * level * level
      box.group.position.set(
        box.base.x + (Math.random() - 0.5) * amount,
        box.base.y + (Math.random() - 0.5) * amount,
        box.base.z + (Math.random() - 0.5) * amount * 0.5,
      )
    }

    // Pressure rings fire off the cones themselves: only when a cone is
    // already well out AND still being thrown forward fast — i.e. a real,
    // loud push. (Keying them off the beat detector instead fired mostly
    // in quiet passages: it looks for bass jumping above its own recent
    // average, which a sustained heavy bassline rarely does, while any
    // bass returning after a breakdown does.)
    let subPush = false
    for (const ring of pressureRings) {
      const { position, velocity } = ring.source
      if (position > RING_MIN_EXCURSION && velocity > RING_MIN_VELOCITY && ring.age > RING_MIN_INTERVAL) {
        ring.age = 0
        if (ring.source.band === SUB) subPush = true
      }
      ring.age += dt
      const material = ring.mesh.material as THREE.MeshBasicMaterial
      const life = 1 - ring.age / 0.55
      if (life <= 0) {
        material.opacity = 0
        continue
      }
      const strength = ring.source.band === SUB ? sub : bass
      ring.mesh.scale.setScalar(ring.radius * (1 + ring.age * 4))
      ring.mesh.position.set(ring.origin.x, ring.origin.y, ring.origin.z + ring.age * 1.8)
      material.opacity = life * life * 0.35 * (0.4 + strength)
    }

    // Dust: a steady trickle with the sub, a burst on every kick.
    dustAccumulator += dt * sub * sub * 120
    const steady = Math.floor(dustAccumulator)
    dustAccumulator -= steady
    emitDust(steady + (subPush ? 35 : 0), 0.5 + sub)
    for (let i = 0; i < DUST_COUNT; i++) {
      if (dustLife[i] <= 0) {
        dustAlpha[i] = 0
        continue
      }
      dustLife[i] -= dt * 0.45
      dustVelocity[i * 3] *= 0.97
      dustVelocity[i * 3 + 1] = dustVelocity[i * 3 + 1] * 0.97 + dt * 0.12
      dustVelocity[i * 3 + 2] *= 0.95
      dustPositions[i * 3] += dustVelocity[i * 3] * dt
      dustPositions[i * 3 + 1] += dustVelocity[i * 3 + 1] * dt
      dustPositions[i * 3 + 2] += dustVelocity[i * 3 + 2] * dt
      dustAlpha[i] = Math.max(0, dustLife[i]) * 0.45
      dustSize[i] += dt * 0.08
    }
    dustGeometry.attributes.position.needsUpdate = true
    dustGeometry.attributes.alpha.needsUpdate = true
    dustGeometry.attributes.size.needsUpdate = true

    // Slow, low, admiring camera — plus a thump on the kick.
    const jolt = kick * 0.03
    camera.position.set(
      Math.sin(t * 0.11) * 1.3 + (Math.random() - 0.5) * jolt,
      1.9 + Math.sin(t * 0.07) * 0.25 + (Math.random() - 0.5) * jolt,
      9.2 - Math.sin(t * 0.05) * 0.9,
    )
    camera.lookAt(0, 2.5, 0)

    return 0.15 + top * 0.35 + kick * 0.15
  }

  return {
    scene,
    camera,
    update,
    shadows: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    dispose: () => {
      ringGeometry.dispose()
      disposeScene(scene)
    },
  }
}

export const soundSystemTheme: VisualizerTheme = {
  id: 'soundsystem',
  name: 'Sound System',
  create,
  isAvailable: (tagNames) => hasTagWord(tagNames, 'dub'),
}
