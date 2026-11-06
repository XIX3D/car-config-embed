/*
 * The studio's own animated pieces, copied as they are from the render.xix3D app
 * (src/components/render/RenderGlassBadge.tsx): the liquid-metal Render button and the upload orb
 * (a real WebGL fragment shader, an SVG-refraction rim, a turning flare ring). Not lookalikes: the CD
 * rejected those ("that is not the render button we designed"). Only the style injection differs,
 * because here they live both in a brand's own page and inside the window's shadow root.
 */
import { onMount, onCleanup, createEffect, createMemo, createSignal, createUniqueId, Show, type JSX } from "solid-js"

/**
 * RenderGlassBadge — a faithful SolidJS port of zeno-web's "liquid glass" Chromatic
 * Metal badge (GlassOrbShell + ChromaticMetalShader + LiquidGlassBackground +
 * GradientStrokeButton), baked to the CD's latest preset (selected="metal",
 * twoCircle=true). NOT a CSS fake: the metal is a real WebGL1 fragment shader (two
 * live contexts, border + inner disc), the rim is real SVG feDisplacementMap
 * refraction, and the flare is a real rotating conic-gradient ring.
 *
 * Everything except `size`, `class` and `onClick` is baked in. All absolute-px
 * bezel/refraction math scales by size / REFERENCE_SIZE (120), exactly like the
 * source GlassOrbShell.
 *
 * KNOWN PLATFORM CAVEAT (carried over verbatim from the source, brain/Design-System
 * §3.5): backdrop-filter cannot reliably read a live WebGL canvas on a real GPU, so
 * the SVG refraction bends the badge's own DOM glass layers at the rim but may look
 * flatter directly over the shader canvas depending on GPU/browser. This is a
 * platform limitation, not a bug.
 */

/* ------------------------------------------------------------------ *
 *  Baked preset (the CD's latest)                                     *
 * ------------------------------------------------------------------ */

const REFERENCE_SIZE = 120
const INNER_SCALE = 0.82
const ROUNDING = 50
const VEIL = 12
const BORDER_THICKNESS = 13.5
const RIM_REFLECTIVITY = 70
// rimClarity = 0 -> rimBodyDim = 1; borderRefraction = 0 -> the br>0 layer is omitted.
const SPIN = 14

// How much faster the metal churns while a render CTA is pointed at or focused.
// A judgement, not a measurement: fast enough that the surface is obviously
// answering, slow enough that it still reads as the same liquid metal moving
// rather than as a progress spinner, which would be the wrong message on a
// button nobody has pressed yet.
export const CTA_HOT_SPEED = 2.4

export interface ChromaticMetalSettings {
  rounding: number
  depth: number
  roughness: number
  rgbSplit: number
  scale: number
  stretch: number
  angle: number
  repeats: number
  offset: number
  phase: number
  evolution: number
  edgeRefract: number
  edgeWidth: number
  gradient: string[]
}

interface LiquidGlassSettings {
  light: number
  refraction: number
  depth: number
  dispersion: number
  frost: number
  ringThickness: number
  rimTone: number
}

export const METAL_GRADIENT = ["#f7e8ff", "#1c0630", "#d68bff", "#12041f", "#f7e8ff", "#190428"]

// The pill metal (the CD's "Concept A": the chromatic metal filling the whole
// New render button, not just the orb). More zoomed-out and chromatic than the
// orb's centre disc so the churn reads across a wide pill; edge refraction is
// off (edgeRefract 0, edgeWidth 1) because a pill has no circular lip to bend.
export const PILL_METAL: ChromaticMetalSettings = {
  rounding: 0,
  depth: 0,
  roughness: 0.15,
  rgbSplit: 0.35,
  scale: 0.07,
  stretch: 0.5,
  angle: 65,
  repeats: 2,
  offset: 0,
  phase: 0.1,
  evolution: 0.07,
  edgeRefract: 0,
  edgeWidth: 1,
  gradient: METAL_GRADIENT,
}

// The crisp centre disc's material. rounding forced to 0 (the outer shell owns the shape).
const METAL_SHADER: ChromaticMetalSettings = {
  rounding: 0,
  depth: 0,
  roughness: 0,
  rgbSplit: 0.45,
  scale: 0.02,
  stretch: 0.5,
  angle: 65,
  repeats: 1,
  offset: 0,
  phase: 0.08,
  evolution: 0.05,
  edgeRefract: 0.55,
  edgeWidth: 0.06,
  gradient: METAL_GRADIENT,
}

// The full-size border ring's own material. rounding forced to 0.
const METAL_BORDER_SHADER: ChromaticMetalSettings = {
  rounding: 0,
  depth: 0,
  roughness: 0.2,
  rgbSplit: 0,
  scale: 0.12,
  stretch: 0.5,
  angle: 65,
  repeats: 2,
  offset: 0,
  phase: 0.08,
  evolution: 0.05,
  edgeRefract: 0,
  edgeWidth: 0.25,
  gradient: METAL_GRADIENT,
}

const RIM_GLASS: LiquidGlassSettings = {
  light: 55,
  refraction: 35,
  depth: 55,
  dispersion: 45,
  frost: 100,
  ringThickness: 0,
  rimTone: 100,
}

/* The rotating flare ring's colours (GradientStrokeButton.tsx GLASS_FLARE_COLORS,
 * verbatim): mostly bright white/chrome with one tight spectral flare that sweeps
 * around as it rotates — light catching curved glass, not a rainbow sticker. */
export const GLASS_FLARE_COLORS = [
  "rgba(255,255,255,0.7) 0deg",
  "rgba(255,255,255,0.45) 40deg",
  "rgba(220,224,230,0.16) 80deg",
  "rgba(200,204,212,0.06) 100deg",
  "rgba(200,204,212,0.06) 130deg",
  "rgba(255,255,255,0.4) 150deg",
  "rgba(190,150,255,0.62) 162deg",
  "rgba(130,180,255,0.68) 170deg",
  "rgba(130,235,255,0.62) 178deg",
  "rgba(170,255,180,0.55) 184deg",
  "rgba(255,255,160,0.62) 190deg",
  "rgba(255,180,115,0.68) 198deg",
  "rgba(255,115,115,0.62) 206deg",
  "rgba(255,255,255,0.4) 224deg",
  "rgba(200,204,212,0.06) 260deg",
  "rgba(200,204,212,0.06) 290deg",
  "rgba(220,224,230,0.16) 320deg",
  "rgba(255,255,255,0.45) 340deg",
  "rgba(255,255,255,0.7) 360deg",
]

export const SPARKLE_PATH =
  "M12 1.5c1.1 5.6 4.9 9.4 10.5 10.5C16.9 13.1 13.1 16.9 12 22.5 10.9 16.9 7.1 13.1 1.5 12 7.1 10.9 10.9 7.1 12 1.5Z"

/* The flowing conic-gradient ring: the padding + XOR-mask trick carves only the
 * border band out of the box, and the colours turn inside it.
 *
 * TURNED BY A TRANSFORM, NOT BY AN ANIMATED ANGLE (audit, 13 October: "butter
 * smooth across all devices"). It used to animate an @property <angle> inside
 * the gradient, which the browser can only do by restyling and repainting the
 * ring on the main thread, every frame, for ever: measured on a 4x-slowed phone
 * profile, ~240 style recalcs a second and 62-71% of the main thread busy on a
 * page nobody was touching, with this the only thing moving. A square conic
 * layer rotated by `transform` is the same picture (a conic gradient's colour
 * depends only on the angle from the centre, so turning the layer IS shifting
 * its start) and the compositor runs it without the main thread. Same build as
 * .metal-ring-sweep in app.css: 150cqmax clears the diagonal of any shape, 200vmax
 * is the fallback where container units are missing. */
export const STROKE_CSS = `
@keyframes zeno-gs-turn {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
.rgb-gs-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: var(--zeno-gs-thickness, 1.5px);
  overflow: hidden;
  container-type: size;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
.rgb-gs-ring::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200vmax;
  height: 200vmax;
  width: 150cqmax;
  height: 150cqmax;
  background: conic-gradient(var(--zeno-gs-colors));
  animation: zeno-gs-turn var(--zeno-gs-speed, 6s) linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .rgb-gs-ring::before { animation: none; transform: translate(-50%, -50%); }
}
`

/* ------------------------------------------------------------------ *
 *  ChromaticMetalShader — raw WebGL1 (GLSL copied VERBATIM)           *
 * ------------------------------------------------------------------ */

const VERTEX_SRC = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SRC = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uStretch;
uniform float uAngle;
uniform float uRepeats;
uniform float uOffset;
uniform float uPhase;
uniform float uEvolution;
uniform float uRoughness;
uniform float uDepth;
uniform float uRGBSplit;
uniform float uEdgeRefract;
uniform float uEdgeStart;
uniform vec3 uColors[6];

// Hoskins-style hash — no sin(), so it stays clean at large coordinates (the classic
// sin-dot hash degrades to per-pixel static once the warped domain grows past ~1e3).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(3.7, 1.9);
    amp *= 0.45;
  }
  return v;
}

// Constant-index-only lookup: never index uColors[] with a variable — WebGL1 forbids it.
vec3 stopColor(int i) {
  if (i == 0) return uColors[0];
  if (i == 1) return uColors[1];
  if (i == 2) return uColors[2];
  if (i == 3) return uColors[3];
  if (i == 4) return uColors[4];
  return uColors[5];
}

// Sharp-transition ramp so bands read as chrome, not a soft gradient wash.
vec3 rampColor(float t) {
  float x = fract(t) * 6.0;
  float base = floor(x);
  int idx = int(base);
  float frac = x - base;
  float sharp = smoothstep(0.40, 0.60, frac);
  int nextIdx = idx + 1;
  if (nextIdx >= 6) nextIdx = 0;
  return mix(stopColor(idx), stopColor(nextIdx), sharp);
}

// The liquid-metal field: domain-warped fbm (warp depth = uDepth). Evolution moves the
// warp anchors around a circle (sin/cos of time) so the churn loops seamlessly.
float field(vec2 p) {
  float evo = uTime * uEvolution * 6.2831853;
  vec2 e = vec2(cos(evo), sin(evo)) * 0.6;
  float warp = 0.8 + uDepth * 2.5;
  vec2 q = vec2(fbm(p + e), fbm(p + vec2(5.2, 1.3) - e));
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2)), fbm(p + warp * q + vec2(8.3, 2.8)));
  return fbm(p + warp * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= uResolution.x / uResolution.y;

  // orient + squash + zoom the sampling domain (Angle / Stretch / Scale)
  float rad = radians(uAngle);
  vec2 dir = vec2(cos(rad), sin(rad));
  vec2 p = vec2(dot(centered, dir), dot(centered, vec2(-dir.y, dir.x)) * uStretch);
  p *= uScale * 2.5;
  p += uOffset;

  // EDGE REFRACTION (CD video 03, the "2 circles": crisp centre, the SAME material bent
  // through glass at the rim). This warps the material's OWN sampling domain as pixels near
  // the circle's edge — a genuine refraction of the pattern, not a CSS filter faked over a
  // canvas backdrop-filter can't read. rr is 0 at centre, ~1 at the visible circle edge;
  // edge ramps in only past uEdgeStart so the middle stays calm. The displacement bends
  // radially + swirls tangentially (fbm so it flows with the pattern), like light through
  // the thick curved lip of a lens; the chromatic split also widens toward the rim so the
  // dispersion fringes bloom exactly where the glass is "thickest".
  float rr = length(uv - 0.5) * 2.0;
  float edge = smoothstep(uEdgeStart, 1.0, rr);
  vec2 rdir = normalize(centered + vec2(1e-4));
  float wa = fbm(p * 1.7 + uTime * uPhase);
  float wb = fbm(p * 2.3 + 7.0);
  vec2 refr = rdir * (wa - 0.5) + vec2(-rdir.y, rdir.x) * (wb - 0.5);
  p += refr * edge * uEdgeRefract * 2.2;

  // one field lookup, turned into repeating contour bands flowing through the ramp
  float f = field(p);
  float band = f * uRepeats + uTime * uPhase;
  band += (noise(p * 12.0) - 0.5) * uRoughness * 0.4;

  // chromatic aberration: R/G/B read the ramp at offset band coordinates, so the
  // fringes (red/yellow one side, cyan/blue the other) hug every band edge.
  // Keep the offset under the ramp's transition width or the fringes stop being
  // edge accents and flood whole stops with saturated colour. The rim adds extra
  // split (edge * uEdgeRefract) so refraction dispersion concentrates at the glass lip.
  float split = uRGBSplit * 0.04 + edge * uEdgeRefract * 0.10;
  vec3 col = vec3(
    rampColor(band + split).r,
    rampColor(band).g,
    rampColor(band - split).b
  );

  gl_FragColor = vec4(col, 1.0);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    console.error(
      "[RenderGlassBadge] shader compile failed:",
      info || `(no info log — gl.isContextLost() = ${gl.isContextLost()})`,
    )
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/* The metal's program on a context, with everything but the clock and the
   size set once (the settings and the six colours never change). Null when
   it will not compile or link. */
function metalProgram(gl: WebGLRenderingContext, s: ChromaticMetalSettings) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[RenderGlassBadge] program link failed:", gl.getProgramInfoLog(program))
    return null
  }

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // fullscreen triangle (covers the viewport without a quad/index buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPosition = gl.getAttribLocation(program, "aPosition")
  const at = (name: string) => gl.getUniformLocation(program, name)

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.enableVertexAttribArray(aPosition)
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)
  gl.uniform1f(at("uScale"), s.scale)
  gl.uniform1f(at("uStretch"), s.stretch)
  gl.uniform1f(at("uAngle"), s.angle)
  gl.uniform1f(at("uRepeats"), s.repeats)
  gl.uniform1f(at("uOffset"), s.offset)
  gl.uniform1f(at("uPhase"), s.phase)
  gl.uniform1f(at("uEvolution"), s.evolution)
  gl.uniform1f(at("uRoughness"), s.roughness)
  gl.uniform1f(at("uDepth"), s.depth)
  gl.uniform1f(at("uRGBSplit"), s.rgbSplit)
  gl.uniform1f(at("uEdgeRefract"), s.edgeRefract ?? 0.55)
  gl.uniform1f(at("uEdgeStart"), s.edgeWidth ?? 0.55)
  const flat = new Float32Array(18)
  for (let i = 0; i < 6; i++) {
    const [r, g, b] = hexToRgb(s.gradient[i % s.gradient.length] ?? "#ffffff")
    flat[i * 3] = r
    flat[i * 3 + 1] = g
    flat[i * 3 + 2] = b
  }
  gl.uniform3fv(at("uColors[0]"), flat)
  return { program, buffer, vertexShader, fragmentShader, uTime: at("uTime"), uResolution: at("uResolution") }
}

// WHY A STATIC FALLBACK EXISTS (CD, 2026-09-06: "nothing on mobile works ...
// nothing is clickable ... no images load").
//
// Each ChromaticMetalShader opens a LIVE WebGL context running a continuous
// full-screen fbm fragment shader on requestAnimationFrame. The composer mounts
// FOUR of them at once (the upload orb is a RenderGlassBadge = two, plus the
// mobile and desktop New-render buttons). A desktop GPU eats that at a clean
// 60fps, which is why it looked fine everywhere we could test. A phone GPU does
// not: four churning shaders peg the main thread, so iOS Safari drops touches
// (the page reads as "nothing is clickable") AND cannot decode/lay out the tile
// images (they read as "no images, scroll loads nothing"). The login page opens
// ZERO contexts and stayed responsive on the same phone, which is how the four
// contexts were pinned as the cause.
//
// So on a real touch device (and for reduced-motion), we DON'T create the
// context at all: we paint a static chrome gradient instead. Same metal look,
// zero GPU churn. Pointer:fine desktops keep the live shader unchanged.
function prefersStaticMetal(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return (
    window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

// The touch metal (CD, 2026-09-06: on mobile the button was "static and purple").
// The old fallback was a violet swatch with a barely-moving ease-in-out drift.
// This is CHROMATIC liquid metal, silver into blue, cyan and pink (no green,
// DESIGN RULE), under a glossy white sheen, so it reads like the desktop shader.
// Two layers: [0] the moving sheen highlight, [1] the iridescent metal body.
export const STATIC_METAL =
  "linear-gradient(115deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 30%, rgba(255,255,255,0.16) 56%, rgba(0,0,0,0.22)), " +
  "linear-gradient(115deg, #eef3ff 0%, #a9c6ff 12%, #8aa2ff 24%, #c79cff 36%, #ff9ad6 48%, #93d9ff 60%, #bcd4ff 74%, #eef3ff 100%)"

// It MOVES, clearly and continuously (the old drift was too subtle to read as
// animated). The sheen sweeps one way and the metal body the other, a cheap
// per-element repaint, NOT the four WebGL shaders that froze the phone. Off for
// reduced-motion (a phone set to reduce motion keeps the still chromatic look).
const STATIC_METAL_CSS = `
@keyframes zeno-metal-drift { 0% { background-position: 120% 50%, 0% 50%; } 100% { background-position: -120% 50%, 200% 50%; } }
.zeno-metal-static { background-size: 200% 100%, 300% 100%; animation: zeno-metal-drift 4.5s linear infinite; }
@media (prefers-reduced-motion: reduce) { .zeno-metal-static { animation: none; } }
`
const BUTTON_CSS = `
/* The Render button's own box: the studio's .zeno-cta, with its rim and its hover. */
.zeno-cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  color: #fff;
  cursor: pointer;
  outline: none;
  box-shadow: 0 12px 32px -14px rgba(0, 0, 0, 0.85);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  font-family: 'xix3D Manrope', Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.zeno-cta:disabled { cursor: not-allowed; }
.zeno-cta-scrim, .zeno-cta-rim { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.zeno-cta-rim { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); transition: box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1); }
.zeno-cta .rgb-gs-ring { opacity: 0.9; transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1); }
@media (hover: hover) {
  .zeno-cta:hover:not(:disabled) { transform: translateY(-1px) scale(1.01); }
  .zeno-cta:hover:not(:disabled) .zeno-cta-rim { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55); }
  .zeno-cta:hover:not(:disabled) .rgb-gs-ring { opacity: 1; }
}
.zeno-cta:focus-visible:not(:disabled) { transform: translateY(-1px) scale(1.01); }
.zeno-cta:focus-visible:not(:disabled) .zeno-cta-rim { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55); }
.zeno-cta:active:not(:disabled) { transform: scale(0.985); transition-duration: 0.12s; }
.zeno-cta-label {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 26px;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  line-height: 1.2;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
`

const injected = new WeakSet<Node>()
/** The still-metal fallback, the flare ring and the button's own box, once per root: the page's head, or the window's shadow root. */
export function ensureMetalCss(from?: Node | null) {
  if (typeof document === "undefined") return
  const root = from?.getRootNode?.()
  const host: Node = root && root !== document && "appendChild" in root ? root : document.head

  if (injected.has(host)) return
  injected.add(host)
  const s = document.createElement("style")

  s.textContent = STATIC_METAL_CSS + STROKE_CSS + BUTTON_CSS
  host.appendChild(s)
}

/* THE LABEL'S DARK WELL (critic, 7 October: the white label on the metal's
   pale lilac sweep measured 2.1 to 2.6:1). A soft ellipse of near-black behind
   the words, flat across the middle so every glyph sits on it and fading out
   before the edge, so the metal still reads as metal around it. Shared by
   MetalCta and the composer's Render button, its twin. */
// Softer since 9 October (CD: "render, the dark shadow behind is a bit too
// strong"): lighter and fading sooner; the word keeps its own text-shadow.
export const LABEL_WELL = "radial-gradient(closest-side, rgba(6,4,14,0.40) 45%, rgba(6,4,14,0))"

// MetalCta — the render surface's hero action, in the language of the animated
// render button (CD, 2026-09-08: "we have this super cool animated render button,
// where else can we use it?"). This is the REAL button: the live WebGL
// ChromaticMetalShader (PILL_METAL) + dark scrim + spinning flare + white text,
// exactly like the main Render button (RenderCta) uses. NOT the static CSS
// fallback (CD rejected that repeatedly: "that is not the render button we
// designed ... not even the colour"). forceLive so it runs the shader even on a
// phone, the same opt-in the main Render CTA takes; this is a primary render
// action the viewer is actually looking at, one small canvas, and only one
// MetalCta is ever on screen at a time.
export function MetalCta(props: {
  children: JSX.Element
  onClick?: (e: MouseEvent) => void
  disabled?: boolean
  class?: string
  // "submit" lets this be a form's submit button (e.g. the login Sign in), so
  // Enter and the form's onSubmit both fire. Defaults to "button" so every
  // existing caller is unchanged.
  type?: "button" | "submit"
  "aria-label"?: string
  /** Said as well as disabled where a page shows a control that does nothing for this viewer (CustomerPage, the shop's side). */
  "aria-disabled"?: "true"
}) {
  onMount(ensureMetalCss) // STROKE_CSS for the flare ring, self-contained
  // Tracked in JS rather than left to :hover because CSS cannot reach into the
  // shader's clock. MOUSE ONLY: a tap fires pointerenter too and there is no
  // pointerleave to end it on a phone, so a touched button would stay fast for
  // the rest of the session. Focus is included so a keyboard gets the same
  // answer a pointer gets.
  const [hot, setHot] = createSignal(false)
  return (
    <button
      type={props.type ?? "button"}
      onClick={(e) => props.onClick?.(e)}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      aria-disabled={props["aria-disabled"]}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHot(true) }}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      // clip-path as well as overflow-hidden: iOS Safari does not clip the nested
      // WebGL canvas to border-radius via overflow alone, so a rounded metal pill
      // read as a sharp rectangle (CD, 2026-09-08).
      //
      // NO CSS BORDER. It used to carry border-2 border-white/25, and a border
      // moves every absolutely-positioned child onto the padding box: the metal
      // stopped 2px short of the edge and that band showed the PAGE through a
      // translucent white rim, which on the dark login screen read as a dark
      // outline rather than a highlight (CD, 2026-09-11: "some pixels that are
      // not edge to edge"). The rim is now an inset shadow on a layer above the
      // metal, so the metal is edge to edge and the highlight sits on it.
      style={{ "clip-path": "inset(0 round 9999px)" }}
      class={`zeno-cta group relative flex items-center justify-center overflow-hidden rounded-full shadow-[0_12px_32px_-14px_rgba(0,0,0,0.85)] transition-opacity disabled:opacity-40 ${props.class ?? ""}`}
    >
      <ChromaticMetalShader settings={PILL_METAL} size={64} forceLive speed={() => (props.disabled ? 1 : hot() ? CTA_HOT_SPEED : 1)} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", "box-shadow": "none" }} />
      <span aria-hidden="true" class="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(6,4,14,0.20),rgba(6,4,14,0.46))" }} />
      <span aria-hidden="true" class="rgb-gs-ring" style={{ "--zeno-gs-thickness": "2.5px", "--zeno-gs-speed": "8s", "--zeno-gs-colors": GLASS_FLARE_COLORS.join(", "), "mix-blend-mode": "screen" }} />
      <span aria-hidden="true" class="zeno-cta-rim" />
      <span class="relative z-[2] flex items-center justify-center gap-2 px-6 py-2 font-headline font-bold text-white" style={{ "text-shadow": "0 1px 3px rgba(0,0,0,0.7)", background: LABEL_WELL }}>
        {props.children}
      </span>
    </button>
  )
}

export function ChromaticMetalShader(props: {
  settings: ChromaticMetalSettings
  size: number
  style?: JSX.CSSProperties
  /**
   * Run the REAL WebGL shader even on a touch device (CD, 2026-09-06, repeatedly:
   * "that is not the render button we designed ... not even the colour ... why do
   * I keep asking"). The static CSS fallback can never match domain-warped fbm
   * chrome, so the ONE primary render CTA the user actually looks at opts into the
   * live shader on a phone too. The freeze this whole file guards against came
   * from FOUR full shaders at once; a single small button canvas is a fraction of
   * that. So this is opt-in, per instance, and reserved for the render buttons a
   * viewer sees, NOT the decorative upload orb (two contexts) which stays static.
   *
   * Two safety rails keep the phone budget tiny:
   *   - reduced-motion STILL wins (accessibility): a phone set to reduce motion
   *     keeps the still chromatic fallback even here.
   *   - a display:none copy opens NOTHING: the mobile CTA is `md:hidden` (so it is
   *     display:none on desktop) and the desktop foot is hidden on a phone. We only
   *     start the context when the element is actually laid out (offsetParent set),
   *     so exactly the visible copy runs and the hidden twin costs zero.
   */
  forceLive?: boolean
  /**
   * Multiplier on the churn, read every frame (CD, 2026-09-12: the hover
   * "should move faster"). A function rather than a value so the caller can
   * hand over a signal without this component re-running its WebGL setup.
   *
   * Safe BECAUSE time is accumulated here rather than read off the clock: see
   * the rate note in the render loop.
   */
  speed?: () => number
  /**
   * Stop drawing while this is true, holding the last frame (CD, 13 October:
   * the upload orb under the trial link's welcome popup; lib/uploadOrb). Read
   * reactively, so the loop restarts the moment it turns false.
   */
  paused?: () => boolean
}) {
  let containerEl: HTMLDivElement | undefined
  // Set by the live path once its loop exists; the effect below re-checks it
  // whenever `paused` changes.
  let sync: (() => void) | null = null
  createEffect(() => {
    props.paused?.()
    sync?.()
  })

  onMount(() => {
    const container = containerEl
    if (!container) return
    ensureMetalCss(container)
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // Static path: reduced-motion ALWAYS wins (accessibility). Otherwise touch is
    // static UNLESS this instance opts into the live shader (the visible render
    // CTAs). We deliberately do NOT try to skip display:none copies: a hidden md:
    // twin already ran a live shader on desktop before forceLive existed (pointer:
    // fine), so forcing it changes nothing there, and an offsetParent probe at
    // onMount is unreliable during hydration (it wrongly statified the top pill).
    const showStatic = () => {
      ensureMetalCss(container)
      container.style.background = STATIC_METAL
      container.classList.add("zeno-metal-static")
    }
    // Reduced motion (CD, 28 October: "I see the ugly version" on every Render button) is no longer the flat gradient:
    // the real metal is drawn ONCE and held, so nothing moves and it is still the button we designed.
    const still = reduceMotion
    if (!still && prefersStaticMetal() && !props.forceLive) {
      showStatic()
      return
    }
    const s = props.settings
    let disposed = false
    let cleanup: (() => void) | null = null
    let currentCanvas: HTMLCanvasElement | null = null
    let attempt = 0

    const setupGL = (
      gl: WebGLRenderingContext,
      canvas: HTMLCanvasElement,
    ): (() => void) | null => {
      const onLost = (e: Event) => {
        e.preventDefault()
        console.error("[RenderGlassBadge] WebGL context lost")
        showStatic() // a lost context draws nothing: the still metal under it, never a bare dark pill
      }
      canvas.addEventListener("webglcontextlost", onLost)

      const m = metalProgram(gl, s)
      if (!m) {
        showStatic()
        return null
      }
      const { program, buffer, vertexShader, fragmentShader } = m
      const uniforms = { uResolution: m.uResolution, uTime: m.uTime }

      /*
        THE BUTTON'S COST, PAID ONCE (audit, 13 October: "butter smooth across
        all devices"). Measured on a phone profile, every signed-in page kept the
        main thread 43-75% busy with nobody touching it, and these canvases were
        the only thing running. The pattern is unchanged; what went:
          - everything but the clock re-sent every frame. The settings and the
            six colours never change, and the colours were re-parsed from hex
            into a new array 60-120 times a second. Now set once (metalProgram).
          - more frames than a screen can show at this pace: a 120Hz phone or
            Mac drew 120 a second. Capped at 60.
          - a button scrolled out of sight kept drawing. It stops, and picks
            up where it was when it comes back (time is accumulated, see below).
          - 3x pixels on a 3x phone for a soft, flowing pattern: capped at 2x,
            which is 44% fewer pixels and reads the same. The edge stays sharp,
            because the clip is CSS, not the canvas.
      */
      // (The program, the settings and the colours were set once, in metalProgram.)

      let width = 1
      let height = 1
      const resize = (rect: { width: number; height: number }) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        width = Math.max(1, Math.round(rect.width * dpr))
        height = Math.max(1, Math.round(rect.height * dpr))
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
        gl.uniform2f(uniforms.uResolution, width, height)
      }
      resize(container.getBoundingClientRect())
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) resize(entry.contentRect)
        // A resize clears the canvas, and a held frame has no loop to draw the next one.
        if (still) gl.drawArrays(gl.TRIANGLES, 0, 3)
      })
      resizeObserver.observe(container)

      // Accumulate CLAMPED delta time instead of reading absolute wall-clock. rAF
      // pauses when the tab is backgrounded or throttled, but performance.now()
      // keeps advancing, so (now - start) leaps on return and the badge visibly
      // jumps a frame. Summing per-frame deltas capped at 50ms absorbs that leap
      // (and any GC/layout hitch), so the animation only ever moves forward smoothly.
      let elapsed = 0
      let last = performance.now()
      let rafId = 0
      // THE PACE, EASED, NEVER SWITCHED. Multiplying the accumulated delta is
      // what makes a speed change safe here: the pattern continues from exactly
      // where it was and merely moves faster. The same multiplier on an
      // absolute clock (t = now - start) would jump the entire surface to a
      // different point in its evolution the instant the pointer arrived.
      // Eased over roughly --dur-base so the metal is seen to accelerate, which
      // is the part that reads as the button responding.
      let rate = 1

      const render = (now: number) => {
        const dt = Math.min(Math.max(now - last, 0), 50) / 1000
        last = now
        // Framerate-independent approach, so a dropped frame cannot overshoot.
        rate += ((props.speed?.() ?? 1) - rate) * Math.min(1, dt / 0.18)
        elapsed += dt * rate
        gl.uniform1f(uniforms.uTime, elapsed)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }

      render(last) // draw one frame immediately (dt=0, t=0) so the canvas never blanks
      // 60 a second at most: a frame that arrives sooner than ~16ms after the
      // last drawn one is skipped (the 2ms slack keeps a 60Hz screen at 60).
      const frame = (now: number) => {
        if (now - last >= 14.5) render(now)
        rafId = requestAnimationFrame(frame)
      }
      let running = false
      const start = () => {
        if (running) return
        running = true
        last = performance.now()
        rafId = requestAnimationFrame(frame)
      }
      const stop = () => {
        running = false
        cancelAnimationFrame(rafId)
      }
      // Runs while it is on screen AND not paused.
      let inView = typeof IntersectionObserver === "undefined"
      sync = () => (!still && inView && !props.paused?.() ? start() : stop())
      const seen =
        typeof IntersectionObserver === "undefined"
          ? null
          : new IntersectionObserver((entries) => {
              inView = entries.some((e) => e.isIntersecting)
              sync?.()
            })
      if (seen) seen.observe(container)
      else sync()

      return () => {
        sync = null
        stop()
        seen?.disconnect()
        resizeObserver.disconnect()
        canvas.removeEventListener("webglcontextlost", onLost)
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
        gl.getExtension("WEBGL_lose_context")?.loseContext()
      }
    }

    // Born-lost recovery: if getContext returns a null/already-lost context (the tab is at
    // its concurrent-WebGL-context limit), a lost context never revives on the SAME canvas,
    // so we recreate a fresh <canvas> and retry a few times on a short delay before giving up.
    const tryInit = () => {
      if (disposed) return
      if (currentCanvas) {
        currentCanvas.remove()
        currentCanvas = null
      }
      const canvas = document.createElement("canvas")
      canvas.style.width = "100%"
      canvas.style.height = "100%"
      canvas.style.display = "block"
      container.appendChild(canvas)
      currentCanvas = canvas

      // No MSAA: the only geometry is one triangle that covers the canvas, so
      // there is no edge inside it to smooth, and the button's own edge is the
      // CSS clip. Multisampling was memory and fill for nothing.
      const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false })
      if ((!gl || gl.isContextLost()) && attempt < 5) {
        attempt++
        const id = window.setTimeout(tryInit, 400 + attempt * 300)
        cleanup = () => window.clearTimeout(id)
        return
      }
      if (!gl) {
        console.error("[RenderGlassBadge] WebGL not available (context creation returned null)")
        showStatic()
        return
      }
      if (gl.isContextLost()) {
        console.error("[RenderGlassBadge] context created already lost (concurrent-context limit)")
        showStatic()
        return
      }
      cleanup = setupGL(gl, canvas)
    }

    // NO CONTEXT UNTIL IT IS SEEN. A twin hidden by a breakpoint (the desk bar's pill on a phone, the phone's Render on a
    // desk) never intersects, so it never opens a WebGL context: the cost that froze phones in September was these,
    // and it is why every visible button can now ask for the live shader on a touch screen too.
    let firstSight: IntersectionObserver | null = null
    if (typeof IntersectionObserver === "undefined") tryInit()
    else {
      firstSight = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        firstSight?.disconnect()
        firstSight = null
        tryInit()
      })
      firstSight.observe(container)
    }

    onCleanup(() => {
      disposed = true
      firstSight?.disconnect()
      cleanup?.()
      if (currentCanvas) currentCanvas.remove()
    })
  })

  return (
    <div
      ref={containerEl}
      style={{
        width: `${props.size}px`,
        height: `${props.size}px`,
        "border-radius": `${props.settings.rounding}%`,
        // Matches the radius above rather than assuming a circle: every shipped
        // preset is rounding 0, so this is a no-op square clip for them and the
        // rounded callers get a real clip instead of relying on overflow. A
        // caller that overrides border-radius through props.style overrides this
        // with it, because props.style is spread after both.
        "clip-path": `inset(0 round ${props.settings.rounding}%)`,
        overflow: "hidden",
        "box-shadow": "0 12px 40px -12px rgba(0,0,0,0.6)",
        ...props.style,
      }}
    />
  )
}

/* ------------------------------------------------------------------ *
 *  RefractionFilterDefs — feTurbulence -> per-channel feDisplacementMap *
 *  (LiquidGlassBackground.tsx, verbatim; this is the REAL glass)      *
 * ------------------------------------------------------------------ */

function RefractionFilterDefs(props: {
  filterId: string
  baseFrequency: number
  scaleR: number
  scaleG: number
  scaleB: number
  seed?: number
}) {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden={true}>
      <defs>
        <filter
          id={props.filterId}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={props.baseFrequency}
            numOctaves={2}
            seed={props.seed ?? 7}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="rChan"
          />
          <feDisplacementMap
            in="rChan"
            in2="noise"
            scale={props.scaleR}
            xChannelSelector="R"
            yChannelSelector="G"
            result="rDisp"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="gChan"
          />
          <feDisplacementMap
            in="gChan"
            in2="noise"
            scale={props.scaleG}
            xChannelSelector="R"
            yChannelSelector="G"
            result="gDisp"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="bChan"
          />
          <feDisplacementMap
            in="bChan"
            in2="noise"
            scale={props.scaleB}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bDisp"
          />
          <feComposite in="rDisp" in2="gDisp" operator="arithmetic" k2="1" k3="1" result="rg" />
          <feComposite in="rg" in2="bDisp" operator="arithmetic" k2="1" k3="1" />
        </filter>
      </defs>
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 *  Helpers (from LiquidGlassBackground.tsx)                           *
 * ------------------------------------------------------------------ */

const clamp01 = (v: number) => Math.min(100, Math.max(0, v))

/** The refraction ring's inner mask stop (%) from a 0-100 "ring thickness" value. */
function ringInnerStopPct(ringThickness: number): number {
  const v = Number.isFinite(ringThickness) ? ringThickness : 30
  return 88 - (clamp01(v) / 100) * 78
}

/* ------------------------------------------------------------------ *
 *  RenderGlassBadge (the assembled badge)                            *
 * ------------------------------------------------------------------ */

export default function RenderGlassBadge(props: {
  size?: number
  class?: string
  onClick?: (e: MouseEvent) => void
  /**
   * Replaces the centre sparkle with a custom glyph (e.g. the upload arrow, so the
   * same liquid-metal orb reads as an UPLOAD button rather than New render). Sized
   * by the caller. The centre drop-shadow still applies.
   */
  glyph?: JSX.Element
  /**
   * Run the REAL WebGL shader on both metal layers even on touch (the CD confirmed
   * 2026-09-06 that the live metal DOES animate on his iPhone, so the upload orb,
   * the hero of the empty compose screen, gets the real churn back instead of the
   * static fallback). Reduced-motion still wins. This is the orb's TWO contexts;
   * only pass it on the one orb a viewer sees (the upload orb), never a decorative
   * one, so a phone never runs more than the couple of small shaders proven safe.
   */
  forceLive?: boolean
  /**
   * Animation rate for BOTH metal layers, 1 being rest. The composer's dropzone
   * drives this to CTA_HOT_SPEED while the pointer is over the panel: the whole
   * panel is the button, so the orb is what confirms you are on it. Ramped
   * inside the shader from the accumulated clock, so a change in rate never
   * jumps the pattern.
   */
  speed?: () => number
  /** Both metal layers stop drawing while this is true (see ChromaticMetalShader). */
  paused?: () => boolean
}) {
  const size =() => props.size ?? 200
  const uid = createUniqueId().replace(/[^a-zA-Z0-9]/g, "")
  const rimFilterId = `rgb-liquid-${uid}`
  const sparkleGradId = `rgb-sparkle-${uid}`

  // All size-derived geometry, mirroring GlassOrbShell + LiquidGlassBackground math.
  const geom = createMemo(() => {
    const sz = size()
    const bezelScale = sz / REFERENCE_SIZE
    const rimLum = (RIM_GLASS.rimTone ?? 100) / 100 // 1
    const rimBodyDim = 1 // rimClarity = 0
    const rimReflectN = clamp01(RIM_REFLECTIVITY) / 100 // 0.7
    const innerPx = Math.max(1, Math.round(sz * INNER_SCALE))
    const roundedPx = (ROUNDING / 50) * (sz / 2)

    // bezel box-shadow (scaled)
    const bezelShadow =
      `0 0 0 ${1.5 * bezelScale}px rgba(${255 * rimLum},${255 * rimLum},${255 * rimLum},0.85), ` +
      `0 0 0 ${2.5 * bezelScale}px rgba(${140 * rimLum},${144 * rimLum},${150 * rimLum},0.6), ` +
      `0 ${4 * bezelScale}px ${12 * bezelScale}px rgba(20,22,26,0.45)`

    // glass cross-section (the raised-bead radial read)
    //
    // PROPORTIONAL BORDER. BORDER_THICKNESS was applied as a fixed px, so the band
    // stayed 13.5px at every size: right at 200-220px, but proportionally huge on a
    // 40-64px orb (a 40px badge came out almost all border). Lock the band to the
    // FRACTION OF THE RADIUS it filled on the reviewed 220px badge, so every size
    // shares that proportion. bandWidthPct is now constant; the flare ring below
    // reads its px thickness from the same fraction.
    const BORDER_ANCHOR_SIZE = 220
    const bandWidthPct = Math.min(45, (BORDER_THICKNESS / (BORDER_ANCHOR_SIZE / 2)) * 100)
    const flareThicknessPx = (bandWidthPct / 100) * (sz / 2)
    const crossSectionInnerPct = 100 - bandWidthPct
    const glassCrossSection =
      `radial-gradient(circle closest-side at 50% 50%, ` +
      `transparent ${Math.max(0, crossSectionInnerPct - bandWidthPct * 0.2)}%, ` +
      `rgba(12,13,16,${(0.4 * rimBodyDim).toFixed(3)}) ${crossSectionInnerPct}%, ` +
      `rgba(255,255,255,${(0.92 * rimBodyDim).toFixed(3)}) ${crossSectionInnerPct + bandWidthPct * 0.6}%, ` +
      `rgba(90,94,102,${(0.35 * rimBodyDim).toFixed(3)}) ${crossSectionInnerPct + bandWidthPct * 0.92}%, ` +
      `transparent 100%)`

    // veil mask (clears before either the refraction ring or the crisp border)
    const halfDiagonalPx = (sz * Math.SQRT2) / 2
    const refractionRingStartPx = (ringInnerStopPct(RIM_GLASS.ringThickness) / 100) * halfDiagonalPx
    const borderInnerEdgePx =
      (Math.max(0, crossSectionInnerPct - bandWidthPct * 0.2) / 100) * (sz / 2)
    const veilClearPx = Math.min(refractionRingStartPx, borderInnerEdgePx)
    const veilClearPct = Math.max(0, Math.min(100, (veilClearPx / (sz / 2)) * 100))
    const veilMask = `radial-gradient(circle closest-side at 50% 50%, black ${Math.max(0, veilClearPct - 8)}%, transparent ${veilClearPct}%)`

    // LiquidGlassBackground (rim glass) derived math
    const scale = sz / REFERENCE_SIZE
    const light = clamp01(RIM_GLASS.light)
    const refraction = clamp01(RIM_GLASS.refraction)
    const depth = clamp01(RIM_GLASS.depth)
    const dispersion = clamp01(RIM_GLASS.dispersion)
    const frost = clamp01(RIM_GLASS.frost)
    const rimTone = clamp01(RIM_GLASS.rimTone ?? 100)
    const rimLum255 = Math.round((rimTone / 100) * 255)
    const baseFrequency = (0.09 - (depth / 100) * 0.08) / scale
    const refractionPx = (6 + (refraction / 100) * 46) * scale
    const dispersionPx = (dispersion / 100) * 30 * scale
    const scaleR = refractionPx + dispersionPx
    const scaleG = refractionPx
    const scaleB = Math.max(0, refractionPx - dispersionPx)
    const frostBlurPx = (6 + (frost / 100) * 10) * scale
    const innerStopPct = ringInnerStopPct(RIM_GLASS.ringThickness)
    const ringMask = `radial-gradient(circle at 50% 50%, transparent ${innerStopPct}%, white 100%)`
    const sheenBg = `linear-gradient(180deg, rgba(${rimLum255},${rimLum255},${rimLum255},${(light / 100) * 0.5}) 0%, transparent 45%)`
    const sheenShadow = `inset 0 0 0 1px rgba(${rimLum255},${rimLum255},${rimLum255},${0.08 + (light / 100) * 0.12})`

    const glyphFilter = `drop-shadow(0 ${2 * bezelScale}px ${4 * bezelScale}px rgba(0,0,0,0.4))`
    const glyphSize = Math.round(sz * 0.42)

    return {
      innerPx,
      roundedPx,
      bezelShadow,
      glassCrossSection,
      flareThicknessPx,
      veilMask,
      baseFrequency,
      scaleR,
      scaleG,
      scaleB,
      frostBlurPx,
      ringMask,
      sheenBg,
      sheenShadow,
      rimReflectN,
      glyphFilter,
      glyphSize,
    }
  })

  return (
    <div
      class={props.class}
      onClick={(e) => props.onClick?.(e)}
      style={{
        position: "relative",
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": `${ROUNDING}%`,
        "clip-path": `inset(0 round ${ROUNDING}%)`,
        // A MASK AS WELL (CD, 21 October, Firefox 158: "it shows it square, this can never be a thing"). Firefox's compositor
        // draws the two WebGL canvases over the corners although this element has a radius, an overflow clip and a clip-path
        // (a screenshot hides it; a video of the page shows it: orb-round-check.cjs). A mask is applied to the whole finished
        // layer, canvases and glass included, so nothing can reach the corners. The circle is the same one the radius draws.
        "mask-image": "radial-gradient(circle closest-side, #000 calc(100% - 0.75px), transparent 100%)",
        "-webkit-mask-image": "radial-gradient(circle closest-side, #000 calc(100% - 0.75px), transparent 100%)",
        overflow: "hidden",
        isolation: "isolate",
        "box-shadow": geom().bezelShadow,
        cursor: props.onClick ? "pointer" : "default",
      }}
    >
      {/* the material, full-bleed: two ChromaticMetal WebGL layers (border + inner disc) */}
      <div style={{ position: "absolute", inset: "0" }}>
        <ChromaticMetalShader
          settings={METAL_BORDER_SHADER}
          size={size()}
          forceLive={props.forceLive}
          speed={props.speed}
          paused={props.paused}
          style={{ position: "absolute", inset: "0", "box-shadow": "none" }}
        />
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          <div
            style={{
              position: "relative",
              width: `${geom().innerPx}px`,
              height: `${geom().innerPx}px`,
              "border-radius": "50%",
              // clip-path AS WELL AS overflow, for the reason MetalCta already
              // carries: a nested WebGL canvas is not reliably clipped to a
              // border-radius by overflow alone, and it draws as a sharp
              // rectangle when it is not. The badge root clips too, so this is
              // the second line rather than the only one - but the root is a
              // single point of failure and this layer is the one holding a
              // canvas, so it clips itself (CD, 2026-09-22: "noticed a box
              // around the circle button").
              "clip-path": "inset(0 round 50%)",
              overflow: "hidden",
              "box-shadow":
                "0 0 0 1.5px rgba(255,255,255,0.55), 0 0 0 2.5px rgba(20,22,26,0.5), 0 6px 16px rgba(0,0,0,0.5)",
            }}
          >
            <ChromaticMetalShader
              settings={METAL_SHADER}
              size={geom().innerPx}
              forceLive={props.forceLive}
              speed={props.speed}
              paused={props.paused}
              style={{ position: "absolute", inset: "0", "box-shadow": "none" }}
            />
          </div>
        </div>
      </div>

      {/* the dark scrim (Veil) — over the material, under the glass rim; masked out of the ring band */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          background: `rgba(0,0,0,${(VEIL / 100) * 0.75})`,
          "mask-image": geom().veilMask,
          "-webkit-mask-image": geom().veilMask,
        }}
      />

      {/* the real glass rim — LiquidGlassBackground (SVG feDisplacementMap refraction) */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          "border-radius": `${geom().roundedPx}px`,
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <RefractionFilterDefs
          filterId={rimFilterId}
          baseFrequency={geom().baseFrequency}
          scaleR={geom().scaleR}
          scaleG={geom().scaleG}
          scaleB={geom().scaleB}
        />
        {/* 1. calm full-panel frost.

            IT DEFINES ITS OWN SHAPE, AND THIS IS THE BOX THE CD SAW.

            CD, 2026-09-22, with a screenshot of the composer: "noticed a box
            around the circle button ... it was chrome".

            This was position:absolute inset:0 with a backdrop-filter and NO
            radius, mask or clip of its own - a square filter region relying
            entirely on an ancestor to round it. A backdrop-filter establishes
            its own compositing context, and an ancestor's border-radius plus
            overflow does not reliably clip one on a GPU-composited path; the
            header of this file already says backdrop-filter "cannot reliably
            read a live WebGL canvas on a real GPU", which is the same
            compositing seam from the other side. saturate(160%) over a square
            is exactly a lighter box the size of the badge.

            NOT REPRODUCIBLE HEADLESS, which is why it survived: the harness
            renders in software and drops the filter entirely, so every walk we
            have saw a correctly round orb. The element defining its own circle
            is the fix that does not depend on which compositor runs. */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            "border-radius": `${ROUNDING}%`,
            "clip-path": `inset(0 round ${ROUNDING}%)`,
            "backdrop-filter": `blur(${geom().frostBlurPx}px) saturate(160%)`,
            "-webkit-backdrop-filter": `blur(${geom().frostBlurPx}px) saturate(160%)`,
          }}
        />
        {/* 2. the refraction ring — bends + fringes the backdrop, masked to the edges */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            // Same reasoning as the frost above. The ring mask already confines
            // what this DRAWS, but the filter REGION is a separate thing from
            // the mask and is what escapes, so it gets the shape too.
            "border-radius": `${ROUNDING}%`,
            "clip-path": `inset(0 round ${ROUNDING}%)`,
            "backdrop-filter": `url(#${rimFilterId})`,
            "-webkit-backdrop-filter": `url(#${rimFilterId})`,
            "mask-image": geom().ringMask,
            "-webkit-mask-image": geom().ringMask,
          }}
        />
        {/* 3. top sheen (Light) + hairline rim */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            "pointer-events": "none",
            background: geom().sheenBg,
            "box-shadow": geom().sheenShadow,
          }}
        />
      </div>

      {/* the glass border's radial cross-section (bright edge / dark body / bright edge) */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          background: geom().glassCrossSection,
          "mix-blend-mode": "overlay",
        }}
      />

      {/* borderRefraction = 0 -> the second feDisplacementMap backdrop layer is omitted */}

      {/* the rotating rainbow flare on the rim (screen blend, opacity = rimReflectivity/100) */}
      <style>{STROKE_CSS}</style>
      <span
        aria-hidden={true}
        class="rgb-gs-ring"
        style={{
          "--zeno-gs-thickness": `${geom().flareThicknessPx}px`,
          "--zeno-gs-speed": `${SPIN}s`,
          "--zeno-gs-colors": GLASS_FLARE_COLORS.join(", "),
          "mix-blend-mode": "screen",
          opacity: `${geom().rimReflectN}`,
        }}
      />

      {/* the centre sparkle glyph with its warm->cool gradient */}
      <span
        style={{
          position: "absolute",
          inset: "0",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          filter: geom().glyphFilter,
        }}
      >
        <Show
          when={props.glyph}
          fallback={
            <svg width={geom().glyphSize} height={geom().glyphSize} viewBox="0 0 24 24" aria-hidden={true}>
              <defs>
                <linearGradient id={sparkleGradId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ffb24d" />
                  <stop offset="42%" stop-color="#f4f4f2" />
                  <stop offset="58%" stop-color="#f4f4f2" />
                  <stop offset="100%" stop-color="#5b8bff" />
                </linearGradient>
              </defs>
              <path d={SPARKLE_PATH} fill={`url(#${sparkleGradId})`} />
            </svg>
          }
        >
          {props.glyph}
        </Show>
      </span>
    </div>
  )
}
