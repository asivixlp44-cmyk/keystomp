// The keys: every keycap in the game is an instance of one sculpted cap (rounded corners, a rounded top edge, a dish) or a round
// typewriter key (a cap with a nickel ring on a stem), its legend on top; a wide key keeps a 1u key's corners (only its middle stretches).
// Everything a key does is in the vertex shader, from a few uniforms and one number per key, so a press costs no geometry upload:
//   press: it sinks under anyone standing on it, and clacks back with a spring after a tap or a stomp near it;
//   pop-in: a key scales up out of nothing with an overshoot (aBorn: when it was born: a keyboard you've just got builds itself);
//   RGB: the Gamer keyboard's legends and rims run through the rainbow.
// Lambert (matte) material only, lit by the game's rig; legends are a mask mixed in on top of the key's colour.
import { T, selfLit } from './engine.js';

export const SQ_NOW = { value: 0 };
// KEY FRENZY (0..1): every key flashing through the rainbow
export const FRENZY = { value: 0 };
const T0 = performance.now();
export function tickKeys() { SQ_NOW.value = (performance.now() - T0) / 1000; }
export const keysNow = () => SQ_NOW.value;

// where up to 8 characters stand (x, y of their feet, z, 1 when standing): the keys under them are down
export const PRESS = { value: Array.from({ length: 8 }, () => new T.Vector4(0, -9999, 0, 0)) };
const MAXI = 8;
const IMP = { value: Array.from({ length: MAXI }, () => new T.Vector4(0, -9999, 0, -99)) }, IMPK = { value: Array.from({ length: MAXI }, () => new T.Vector4(0, 1, 0, 0)) };
let impN = 0;
// a tap or stomp at (x, y, z): the keys within radius clack down and spring back. strength 0..1.5
export function impact(x, y, z, strength, radius) {
    const i = impN++ % MAXI;
    IMP.value[i].set(x, y, z, SQ_NOW.value);
    IMPK.value[i].set(strength, radius || 3, 0, 0);
}

// ----- the legends: one mask texture (white on black), 8 x 8 cells -----
const LEGENDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '.', 'Ctrl', 'Alt', 'SHIFT', 'BACK', 'ENTER', 'STAR', '',
    '-', '=', '[', ']', '\\', ';', "'", '/', 'Esc', 'Tab', 'Caps', 'Win', 'Fn', 'Menu'];
const cellOf = new Map(LEGENDS.map((t, i) => [t, i]));
export const legendCell = (t) => cellOf.get(t) ?? cellOf.get('');
let atlas = null;
function legendAtlas() {
    if (atlas) return atlas;
    const N = 1024, S = N / 8, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineCap = 'round'; x.lineJoin = 'round';
    LEGENDS.forEach((t, i) => {
        const cx = (i % 8 + 0.5) * S, cy = (Math.floor(i / 8) + 0.5) * S;
        if (t === 'SHIFT') { x.beginPath(); x.moveTo(cx, cy - S * 0.3); x.lineTo(cx + S * 0.28, cy); x.lineTo(cx + S * 0.13, cy); x.lineTo(cx + S * 0.13, cy + S * 0.28); x.lineTo(cx - S * 0.13, cy + S * 0.28); x.lineTo(cx - S * 0.13, cy); x.lineTo(cx - S * 0.28, cy); x.closePath(); x.fill(); return; }
        if (t === 'BACK') { x.lineWidth = S * 0.09; x.beginPath(); x.moveTo(cx + S * 0.3, cy); x.lineTo(cx - S * 0.26, cy); x.stroke(); x.beginPath(); x.moveTo(cx - S * 0.08, cy - S * 0.2); x.lineTo(cx - S * 0.28, cy); x.lineTo(cx - S * 0.08, cy + S * 0.2); x.stroke(); return; }
        if (t === 'ENTER') { x.lineWidth = S * 0.09; x.beginPath(); x.moveTo(cx + S * 0.26, cy - S * 0.24); x.lineTo(cx + S * 0.26, cy + S * 0.12); x.lineTo(cx - S * 0.24, cy + S * 0.12); x.stroke(); x.beginPath(); x.moveTo(cx - S * 0.06, cy - S * 0.08); x.lineTo(cx - S * 0.26, cy + S * 0.12); x.lineTo(cx - S * 0.06, cy + S * 0.32); x.stroke(); return; }
        if (t === 'Win') { for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) x.fillRect(cx - S * 0.22 + a * S * 0.24, cy - S * 0.22 + b * S * 0.24, S * 0.2, S * 0.2); return; }
        if (t === 'Menu') { for (let a = 0; a < 3; a++) x.fillRect(cx - S * 0.22, cy - S * 0.18 + a * S * 0.15, S * 0.44, S * 0.07); return; }
        if (t === 'STAR') { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? S * 0.14 : S * 0.32; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fill(); return; }
        const small = t.length > 1;
        x.font = '700 ' + (small ? (t.length > 3 ? S * 0.27 : S * 0.32) : S * 0.56) + 'px Fredoka, "Arial Rounded MT Bold", sans-serif';
        x.fillText(t, cx, cy + S * 0.03);
    });
    atlas = new T.CanvasTexture(c);
    atlas.colorSpace = T.NoColorSpace;
    atlas.anisotropy = 4;
    return atlas;
}
const UATLAS = { value: null };

// ----- the material -----
const KEY_GLSL = /* glsl */`
uniform float uSq; uniform vec4 uImp[${MAXI}]; uniform vec4 uImpK[${MAXI}]; uniform vec4 uPress[8];
attribute vec3 aKey; attribute vec3 aInk; attribute float aBorn; attribute float aLit; attribute vec3 aLitC;
varying vec3 vInk; varying float vRgb; varying float vTop; varying float vLit; varying vec3 vLitC; varying float vPh;
float keyPress(vec3 c, float hw, float hd) {
    float p = 0.0;
    for (int i = 0; i < 8; i++) {
        vec4 q = uPress[i];
        if (q.w < 0.5 || abs(q.y - c.y) > 3.0) continue;
        vec2 d = abs(q.xz - c.xz) - vec2(hw, hd);
        p = max(p, 1.0 - smoothstep(-0.3, 0.7, max(d.x, d.y)));
    }
    for (int i = 0; i < ${MAXI}; i++) {
        vec4 im = uImp[i];
        float age = uSq - im.w;
        if (age < 0.0 || age > 1.2 || abs(im.y - c.y) > 3.0) continue;
        vec2 dv = max(abs(c.xz - im.xz) - vec2(hw, hd) * 0.8, vec2(0.0));
        float r = length(dv), R = uImpK[i].y;
        if (r > R) continue;
        float a = age - r * 0.014;
        if (a < 0.0) continue;
        float k = a < 0.03 ? a / 0.03 : exp(-(a - 0.03) * 11.0) * cos((a - 0.03) * 24.0) * 1.1;
        p = max(p, k * (1.0 - r / R * 0.7) * uImpK[i].x);
    }
    return clamp(p, -0.18, 1.0);
}
`;
let matC = null;
// where a pressed key's top comes to rest (just under the feet of whoever stands on it: they stand at the case top, 1.0)
export const PRESSED_TOP = 0.97;
export function keyMaterial() {
    if (matC) return matC;
    UATLAS.value = legendAtlas();
    const m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uSq: SQ_NOW, uImp: IMP, uImpK: IMPK, uPress: PRESS, uLeg: UATLAS, uFrenzy: FRENZY });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + KEY_GLSL + `
varying vec2 vKxz; varying vec2 vCell; varying float vH; varying float vRim; varying float vWx;`)
            // a wide key is a 1u key with its middle stretched (its corners, its taper and its dish's rim stay a 1u key's): the
            // normals are put right for that before the instance's scale is applied to them
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float kSx = length(instanceMatrix[0].xyz), kSy = length(instanceMatrix[1].xyz), kSz = length(instanceMatrix[2].xyz);
float kAsp = max(kSx / kSz, 1.0);
objectNormal.x *= kAsp;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float ix = 1.0 / kAsp; transformed.x = sign(position.x) * (abs(position.x) * ix + 0.5 * (1.0 - ix)); }
// where on the top a point is, in 1u keys from the middle (the legend goes there, never stretched)
vKxz = vec2(transformed.x * kAsp, transformed.z);
vec3 kc = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
float khw = 0.5 * kSx, khd = 0.5 * kSz;
float kba = uSq - aBorn;
float kbx = kba / 0.24 - 1.0;
float kbs = kba < 0.0 ? 0.0 : kba < 0.24 ? 1.0 + 2.7 * kbx * kbx * kbx + 1.7 * kbx * kbx : 1.0;
transformed *= kbs;
// pressed, its top comes down to just under the feet: a real key's travel
transformed.y -= keyPress(kc, khw, khd) * max(0.3, (kSy + kc.y - ${PRESSED_TOP.toFixed(2)}) / kSy);
vRgb = aKey.z; vInk = aInk; vPh = aKey.y; vWx = kc.x;
// reactive lighting: a key just pressed glows in its keyboard's colour, fading over most of a second
{ float la = uSq - aLit; vLit = la < 0.0 ? 0.0 : max(0.0, 1.0 - la / 0.85); vLit *= vLit; vLitC = aLitC; }
vTop = uv.x; vRim = uv.y; vH = position.y;
vCell = vec2(mod(aKey.x, 8.0), floor(aKey.x / 8.0));`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uLeg; uniform float uSq; uniform float uFrenzy;
varying vec3 vInk; varying float vRgb; varying float vTop; varying float vLit; varying vec3 vLitC; varying float vPh;
varying vec2 vKxz; varying vec2 vCell; varying float vH; varying float vRim; varying float vWx;
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
// the legend: its cell of the atlas laid over the top's middle (the top's rim is 0.375 out)
vec2 kq = vec2(0.5 + vKxz.x / 0.75, 0.5 - vKxz.y / 0.75);
float kIn = step(0.0, kq.x) * step(kq.x, 1.0) * step(0.0, kq.y) * step(kq.y, 1.0) * step(0.6, vTop);
vec2 kc2 = clamp(kq, 0.0, 1.0);
float kLeg = texture2D(uLeg, vec2((vCell.x + kc2.x) / 8.0, 1.0 - (vCell.y + 1.0 - kc2.y) / 8.0)).r * kIn;
vec3 kInk = vInk;
if (vRgb > 0.5) kInk = hue(uSq * 0.16 + vWx * 0.012 + kq.y * 0.12);
diffuseColor.rgb = mix(diffuseColor.rgb, kInk, kLeg);
// a typewriter key's ring and stem: brushed nickel
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.46, 0.5), vRim);
// the skirt darkens down into the plate it stands in (the gaps between keys are dark); the top a touch brighter
float kAo = mix(0.42, 1.0, smoothstep(0.16, 0.86, vH));
diffuseColor.rgb *= mix(kAo, 1.05, vTop);
// a pressed key takes on its glow
diffuseColor.rgb = mix(diffuseColor.rgb, vLitC, vLit * 0.5 * vTop);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float kLow = 1.0 - smoothstep(0.2, 0.75, vH);
if (vRgb > 0.5) totalEmissiveRadiance += kInk * (kLeg * 1.1 + (1.0 - vTop) * kLow * 0.6);
totalEmissiveRadiance += vLitC * vLit * (0.45 + 0.75 * kLeg + (1.0 - vTop) * 0.5);
if (uFrenzy > 0.001) { vec3 fz = hue(uSq * 0.45 + vPh); totalEmissiveRadiance += fz * uFrenzy * (0.18 + 0.6 * kLeg + (1.0 - vTop) * 0.4) * (0.65 + 0.35 * sin(uSq * 7.0 + vPh * 6.28)); }`);
    };
    m.customProgramCacheKey = () => 'kb-key2';
    matC = selfLit(m);
    return matC;
}

// ----- geometry: 1 x 1 base, 1 tall, centred on x/z, base at 0 -----
function fixWinding(g) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * (n[a] + n[b] + n[c]) + cy * (n[a + 1] + n[b + 1] + n[c + 1]) + cz * (n[a + 2] + n[b + 2] + n[c + 2]) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
}
// Rings of one outline (a rounded square, cs points per corner, or a circle of cs points) stacked up and joined. A ring:
// { half (0: the middle point, a fan to the ring before), rad (the corners' radius), y, nh / nv (its normal: out, up),
//   top (uv.x: how much of the top it is: the legend and the glow go there), rim (uv.y: a typewriter key's metal), cut (not joined
//   to the ring before: a hard edge) }
function outline(half, rad, cs, round) {
    const out = [], snap = (v) => (Math.abs(v) < 1e-6 ? 0 : v);
    if (round) {
        for (let j = 0; j < cs; j++) { const a = j / cs * Math.PI * 2, c = snap(Math.cos(a)), s = snap(Math.sin(a)); out.push([c * half, s * half, c, s]); }
        return out;
    }
    for (let c = 0; c < 4; c++) {
        const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1;
        for (let i = 0; i <= cs; i++) {
            const a = (c + i / cs) * Math.PI / 2, nx = snap(Math.cos(a)), nz = snap(Math.sin(a));
            out.push([sx * (half - rad) + nx * rad, sz * (half - rad) + nz * rad, nx, nz]);
        }
    }
    return out;
}
function ringGeo(rings, cs, round) {
    const pos = [], nor = [], uv = [], idx = [], n = new T.Vector3();
    let prev = -1, M = 0;
    for (const r of rings) {
        const at = pos.length / 3;
        if (!r.half) {
            pos.push(0, r.y, 0); nor.push(0, 1, 0); uv.push(r.top || 0, r.rim || 0);
            for (let j = 0; j < M; j++) idx.push(prev + j, prev + (j + 1) % M, at);
            prev = -1;
            continue;
        }
        const pts = outline(r.half, r.rad || 0, cs, round);
        M = pts.length;
        for (const [x, z, nx, nz] of pts) {
            n.set(nx * r.nh, r.nv, nz * r.nh).normalize();
            pos.push(x, r.y, z); nor.push(n.x, n.y, n.z); uv.push(r.top || 0, r.rim || 0);
        }
        if (prev >= 0 && !r.cut) for (let j = 0; j < M; j++) { const a0 = prev + j, a1 = prev + (j + 1) % M, b0 = at + j, b1 = at + (j + 1) % M; idx.push(a0, a1, b1, a0, b1, b0); }
        prev = at;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    fixWinding(g);
    return g;
}
// A sculpted keycap: a rounded-square skirt tapering up, a rounded top edge, a spherical dish (D deep, its rim 0.375 out)
const DISH = 0.06, RIM = 0.375;
const dishY = (h) => 1 - DISH * (1 - (h / RIM) ** 2), dishN = (h) => -2 * DISH * (h / RIM) / RIM;
const SKIRT = { nh: 0.88, nv: 0.085 };
function buildKeyGeo(low) {
    if (low) return ringGeo([
        { half: 0.5, rad: 0.06, y: 0, ...SKIRT },
        { half: 0.41, rad: 0.08, y: 0.9, ...SKIRT },
        { half: 0.37, rad: 0.07, y: 1, nh: 0.25, nv: 1, top: 1 },
        { half: 0, y: 1 - DISH, top: 1 },
    ], 1, false);
    return ringGeo([
        { half: 0.5, rad: 0.07, y: 0, ...SKIRT },
        { half: 0.415, rad: 0.09, y: 0.88, ...SKIRT },
        { half: 0.398, rad: 0.085, y: 0.965, nh: 0.6, nv: 0.8, top: 0.35 },
        { half: RIM, rad: 0.075, y: 1, nh: -0.12, nv: 1, top: 1 },
        { half: 0.25, rad: 0.05, y: dishY(0.25), nh: dishN(0.25), nv: 1, top: 1 },
        { half: 0.125, rad: 0.025, y: dishY(0.125), nh: dishN(0.125), nv: 1, top: 1 },
        { half: 0, y: 1 - DISH, top: 1 },
    ], 2, false);
}
// A typewriter key: a round cap on a thin stem, a nickel ring round it with a rolled lip, the face a step down inside the ring
function buildRoundGeo(low) {
    // far off and on Low: the stem, the ring's side, its lip, the face (84 triangles)
    if (low) return ringGeo([
        { half: 0.12, y: 0, nh: 1, nv: 0, rim: 1 },
        { half: 0.12, y: 0.6, nh: 1, nv: 0, rim: 1 },
        { half: 0.47, y: 0.6, nh: 1, nv: 0, rim: 1, cut: true },
        { half: 0.47, y: 0.94, nh: 1, nv: 0.35, rim: 1 },
        { half: 0.42, y: 1, nh: 0.2, nv: 1, rim: 1 },
        { half: 0.4, y: 0.99, nh: 0, nv: 1, top: 1, cut: true },
        { half: 0, y: 0.97, top: 1 },
    ], 12, true);
    return ringGeo([
        { half: 0.12, y: 0, nh: 1, nv: 0, rim: 1 },
        { half: 0.12, y: 0.58, nh: 1, nv: 0, rim: 1 },
        { half: 0.12, y: 0.58, nh: 0, nv: -1, rim: 1, cut: true },
        { half: 0.47, y: 0.6, nh: 0, nv: -1, rim: 1 },
        { half: 0.47, y: 0.6, nh: 1, nv: 0, rim: 1, cut: true },
        { half: 0.47, y: 0.93, nh: 1, nv: 0.35, rim: 1 },
        { half: 0.44, y: 1, nh: 0.25, nv: 1, rim: 1 },
        { half: 0.405, y: 0.985, nh: -0.6, nv: 0.8, rim: 1 },
        { half: 0.4, y: 0.965, nh: -1, nv: 0.2, rim: 1 },
        { half: 0.4, y: 0.965, nh: 0, nv: 1, top: 1, cut: true },
        { half: 0, y: 0.95, top: 1 },
    ], 16, true);
}
let hiC = null, loC = null, rndC = null, rndLoC = null;
export const roundKeyGeo = (low) => (low ? (rndLoC || (rndLoC = buildRoundGeo(true))) : (rndC || (rndC = buildRoundGeo(false))));
// 132 triangles near (rounded corners, a rounded top edge, a dish), 40 far off and on Low
export const keyGeo = (low) => (low ? (loC || (loC = buildKeyGeo(true))) : (hiC || (hiC = buildKeyGeo(false))));

// ----- a set of keys, one draw -----
const m4 = new T.Matrix4(), qI = new T.Quaternion(), qT = new T.Quaternion(), AX = new T.Vector3(1, 0, 0), vP = new T.Vector3(), vS = new T.Vector3(), tc = new T.Color();
const NEVER = 1e7, LONG_AGO = -1000;
let lowDetail = false;
export function keyDetail(low) { lowDetail = !!low; }
export class KeySet {
    // list: [{ x, y (base), z, w, d, h, rx (its tilt: a sculpted row), color, ink ([r, g, b] or hex), cell, rgb, born, lit (the glow's colour) }]
    constructor(list, o) {
        o = o || {};
        // two shapes sharing the keys' data: the detailed cap near the camera, the simple one far off (or always, on Low)
        const n = list.length, shape = o.round ? roundKeyGeo : keyGeo, geo = shape(true).clone();
        this.geoLo = geo; this.geoHi = lowDetail ? null : shape(false).clone();
        this.list = list;
        this.state = new Float32Array(n);
        const key = new Float32Array(n * 3), ink = new Float32Array(n * 3), litC = new Float32Array(n * 3);
        this.litT = new Float32Array(n).fill(LONG_AGO);
        const im = new T.InstancedMesh(geo, keyMaterial(), n);
        list.forEach((k, i) => {
            im.setMatrixAt(i, m4.compose(vP.set(k.x, k.y, k.z), k.rx ? qT.setFromAxisAngle(AX, k.rx) : qI, vS.set(k.w, k.h, k.d)));
            im.setColorAt(i, tc.set(k.color));
            key[i * 3] = k.cell ?? 44; key[i * 3 + 1] = i * 0.37 % 1; key[i * 3 + 2] = k.rgb ? 1 : 0;
            tc.set(k.ink ?? 0x1a1030); ink[i * 3] = tc.r; ink[i * 3 + 1] = tc.g; ink[i * 3 + 2] = tc.b;
            tc.set(k.lit ?? 0x8ad8ff); litC[i * 3] = tc.r; litC[i * 3 + 1] = tc.g; litC[i * 3 + 2] = tc.b;
            this.state[i] = k.born ?? LONG_AGO;
        });
        geo.setAttribute('aKey', new T.InstancedBufferAttribute(key, 3));
        geo.setAttribute('aInk', new T.InstancedBufferAttribute(ink, 3));
        this.attr = new T.InstancedBufferAttribute(this.state, 1).setUsage(T.DynamicDrawUsage);
        geo.setAttribute('aBorn', this.attr);
        this.litA = new T.InstancedBufferAttribute(this.litT, 1).setUsage(T.DynamicDrawUsage);
        geo.setAttribute('aLit', this.litA);
        this.litCA = new T.InstancedBufferAttribute(litC, 3);
        geo.setAttribute('aLitC', this.litCA);
        if (this.geoHi) for (const k of ['aKey', 'aInk', 'aBorn', 'aLit', 'aLitC']) this.geoHi.setAttribute(k, geo.getAttribute(k));
        if (this.geoHi) im.geometry = this.geoHi;
        this.llo = 1e9; this.lhi = -1;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        // the keys throw no shadow (it would fall on the keys; the shadow pass is spared them), and they're drawn before
        // what's under them: those pixels are then skipped
        im.castShadow = false; im.receiveShadow = true;
        im.renderOrder = -1;
        im.matrixAutoUpdate = false; im.updateMatrix();
        im.visible = o.visible !== false;
        this.mesh = im;
        this.cx = im.boundingSphere.center.x; this.cz = im.boundingSphere.center.z; this.r = im.boundingSphere.radius;
        this.lo = 1e9; this.hi = -1;
    }
    // the keys from i on come up now (t: when, default now); hide: none of them yet
    born(i, t) { this.state[i] = t ?? SQ_NOW.value; this.touch(i); }
    hide(i) { this.state[i] = NEVER; this.touch(i); }
    touch(i) { this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i); this.dirty = true; }
    // a key pressed: it lights up now (a glow in its colour, fading); c: another colour for it from now on
    light(i, c) {
        if (i < 0 || i >= this.litT.length) return;
        this.litT[i] = SQ_NOW.value;
        if (c !== undefined) { tc.set(c); this.litCA.setXYZ(i, tc.r, tc.g, tc.b); this.litCA.needsUpdate = true; }
        this.llo = Math.min(this.llo, i); this.lhi = Math.max(this.lhi, i);
    }
    flushLit() {
        if (this.lhi < 0) return;
        this.litA.clearUpdateRanges(); this.litA.addUpdateRange(this.llo, this.lhi - this.llo + 1); this.litA.needsUpdate = true;
        this.llo = 1e9; this.lhi = -1;
    }
    flush() {
        if (!this.dirty) return;
        this.dirty = false;
        this.attr.clearUpdateRanges(); this.attr.addUpdateRange(this.lo, this.hi - this.lo + 1); this.attr.needsUpdate = true;
        this.lo = 1e9; this.hi = -1;
    }
    setColor(i, c) { this.mesh.setColorAt(i, tc.set(c)); this.mesh.instanceColor.needsUpdate = true; }
    // far from the camera the keys aren't drawn (the plate under them shows); past near, they're the simple caps (tiny on screen:
    // the detail would only cost)
    lod(cam, far, near) {
        const d2 = (cam.x - this.cx) ** 2 + (cam.z - this.cz) ** 2, on = d2 < (far + this.r) ** 2;
        if (on !== this.mesh.visible) this.mesh.visible = on;
        if (this.geoHi) { const g = d2 < ((near || 0) + this.r) ** 2 ? this.geoHi : this.geoLo; if (this.mesh.geometry !== g) this.mesh.geometry = g; }
    }
    dispose() { this.geoLo.dispose(); if (this.geoHi) this.geoHi.dispose(); this.mesh.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}
export const NEVER_BORN = NEVER;

// a key, for the loading warm-up
export function keyWarmGroup() {
    const g = new T.Group(), a = new KeySet([{ x: 0, y: 0, z: 0, w: 2, h: 1, d: 2, color: 0xffffff, cell: 1 }]);
    g.add(a.mesh);
    return g;
}
