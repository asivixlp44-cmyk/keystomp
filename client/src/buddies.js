// The Desk Buddies hopping after everyone: little desk things with faces (an eraser, a sticky note, a floppy disk, a cookie, a milk
// carton, a computer mouse, a cassette, a puzzle cube, a pixel ghost, a snowball, a fire sprite, a crown, a planet, a UFO...). Each is
// built once from its recipe in shared/config.js (a body shape, a feature, two colours) with two big shiny eyes and rosy cheeks, into one
// geometry; every kind on screen is one instanced mesh, its list rewritten once a frame (only the nearest characters get theirs).
import { T, scene, selfLit, renderer } from './engine.js';
import { Kit } from './geo.js';
import { BUDDIES, buddyById } from '../../shared/config.js';

const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), vP = new T.Vector3(), vS = new T.Vector3();
const SIZE = { common: 1, rare: 1.1, epic: 1.22, legendary: 1.38 };
const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
// a three.js geometry in one colour, ready for Kit.addGeo
function colored(g, c) {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), tc = new T.Color(c);
    for (let i = 0; i < n; i++) { col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
}
const at = (x, y, z, rx, ry, rz, sx, sy, sz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx ?? 1, sy ?? sx ?? 1, sz ?? sx ?? 1));
const ball = (k, x, y, z, r, c, sy) => k.addGeo(colored(new T.IcosahedronGeometry(1, 2), c), at(x, y, z, 0, 0, 0, r, r * (sy || 1), r));
const cyl = (k, x, y, z, r, h, c, rx, rz, seg) => k.addGeo(colored(new T.CylinderGeometry(r, r, h, seg || 16), c), at(x, y, z, rx, 0, rz));
const cone = (k, x, y, z, r, h, c, seg) => k.addGeo(colored(new T.ConeGeometry(r, h, seg || 12), c), at(x, y, z));
function starShape(r0, r1) {
    const s = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r1 : r0; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    s.closePath();
    return s;
}

// one buddy: its body (front toward +z, feet at y 0), its feature, its face. Returns the geometry
function buildBuddy(b) {
    const k = new Kit(), c1 = b.c1, c2 = b.c2, dark = shade(c1, 0.7);
    // body: f = where its front is, y = where its eyes go, top = its top
    let f = 0.6, y = 1, top = 2;
    switch (b.shape) {
        case 'block': k.box(0, 0.8, 0, 1.8, 1.6, 1.2, c1, { soft: true }); k.box(0, 0.3, 0, 1.84, 0.6, 1.24, c2, { soft: true }); f = 0.62; y = 1.05; top = 1.6; break;
        case 'flat': k.box(0, 1.0, 0, 1.9, 1.9, 0.3, c1, { soft: true }); f = 0.16; y = 1.1; top = 1.95; break;
        case 'tall': k.box(0, 1.15, 0, 0.95, 2.3, 0.95, c1, { soft: true }); f = 0.49; y = 1.5; top = 2.3; break;
        case 'square': k.box(0, 1.0, 0, 1.8, 1.8, 0.4, c1, { soft: true }); f = 0.21; y = 1.25; top = 1.9; break;
        case 'disc': cyl(k, 0, 1.05, 0, 1, 0.5, c1, Math.PI / 2, 0, 20); f = 0.26; y = 1.15; top = 2.05; break;
        case 'coin': cyl(k, 0, 1.05, 0, 1, 0.34, c1, Math.PI / 2, 0, 20); cyl(k, 0, 1.05, 0, 0.82, 0.38, c2, Math.PI / 2, 0, 20); f = 0.2; y = 1.2; top = 2.05; break;
        case 'carton': k.box(0, 0.85, 0, 1.4, 1.7, 1.4, c1, { soft: true }); k.box(0, 0.75, 0.01, 1.42, 0.7, 1.42, c2); f = 0.71; y = 1.25; top = 2.2; break;
        case 'cup': cyl(k, 0, 0.5, 0, 0.75, 1.0, c2, 0, 0, 16); ball(k, 0, 1.25, 0, 0.92, c1, 0.75); f = 0.85; y = 1.25; top = 1.95; break;
        case 'dome': ball(k, 0, 0.55, 0, 0.95, c1, 0.75); k.box(0, 0.45, 0, 1.7, 0.9, 2.2, c1, { soft: true }); k.box(0, 1.0, -0.3, 0.12, 0.25, 0.7, c2); f = 1.1; y = 0.75; top = 1.3; break;
        case 'wide': k.box(0, 0.75, 0, 2.4, 1.3, 0.9, c1, { soft: true }); f = 0.46; y = 0.95; top = 1.4; break;
        case 'cube': k.box(0, 0.85, 0, 1.6, 1.6, 1.6, c1, { soft: true }); f = 0.81; y = 1.0; top = 1.65; break;
        case 'ghost': ball(k, 0, 1.25, 0, 0.95, c1); k.box(0, 0.65, 0, 1.9, 1.1, 1.9, c1, { soft: true }); for (const sx of [-0.6, 0, 0.6]) k.box(sx, 0.1, 0, 0.55, 0.3, 1.8, c1, { soft: true }); f = 0.96; y = 1.25; top = 2.2; break;
        case 'ball': ball(k, 0, 1, 0, 1, c1); f = 0.95; y = 1.15; top = 2; break;
        case 'egg': ball(k, 0, 1.15, 0, 0.95, c1, 1.25); ball(k, 0, 0.95, 0.35, 0.68, c2, 1.15); f = 0.95; y = 1.55; top = 2.35; break;
        case 'gem': k.addGeo(colored(new T.OctahedronGeometry(1.1, 0), c1), at(0, 1.15, 0, 0, Math.PI / 4, 0, 1, 1.2, 1)); f = 0.62; y = 1.2; top = 2.45; break;
        case 'cone': cone(k, 0, 1.0, 0, 0.95, 2.0, c1, 14); f = 0.52; y = 0.85; top = 2.0; break;
        case 'cyl': cyl(k, 0, 0.85, 0, 0.82, 1.7, c1, 0, 0, 18); f = 0.83; y = 1.1; top = 1.7; break;
        case 'key': k.box(0, 0.95, 0, 1.6, 1.5, 1.6, c1, { soft: true }); k.box(0, 0.25, 0, 1.75, 0.5, 1.75, shade(c1, 0.8), { soft: true }); f = 0.81; y = 1.05; top = 1.7; break;
        case 'star': k.addGeo(colored(new T.ExtrudeGeometry(starShape(1.15, 0.5), { depth: 0.45, bevelEnabled: false }), c1), at(0, 1.15, -0.22)); f = 0.24; y = 1.2; top = 2.3; break;
        default: k.box(0, 0.8, 0, 1.6, 1.6, 1.2, c1, { soft: true });
    }
    // feature
    switch (b.feat) {
        case 'curl': k.box(0.72, 1.78, 0.18, 0.5, 0.5, 0.1, shade(c1, 0.85), { rz: 0.6, rx: -0.5 }); break;
        case 'tip': cone(k, 0, 2.62, 0, 0.42, 0.65, 0xf2d8a8, 6); cone(k, 0, 2.85, 0, 0.13, 0.22, 0x3a3a48, 6); k.box(0, 0.12, 0, 1.0, 0.3, 1.0, c2, { soft: true }); break;
        case 'label': k.box(0, 0.75, f + 0.02, 1.3, 0.9, 0.06, 0xf4f4f8); k.box(0, 1.65, f + 0.02, 0.9, 0.4, 0.06, c2); break;
        case 'chips': for (const [x, yy] of [[-0.5, 0.5], [0.45, 0.6], [0.1, 1.7], [-0.55, 1.45], [0.6, 1.35]]) k.box(x, yy, f, 0.22, 0.2, 0.08, c2); break;
        case 'sprinkles': for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box(Math.cos(a) * 0.72, 1.05 + Math.sin(a) * 0.72, f + 0.02, 0.24, 0.08, 0.06, [0xff4a6a, 0x3ab4ff, 0xffe24a, 0x46ec50][i % 4], { rz: a }); } k.box(0, 1.05, f, 0.5, 0.5, 0.08, c2); break;
        case 'roof': k.box(-0.36, 1.95, 0, 0.82, 0.12, 1.4, c2, { rz: 0.6 }); k.box(0.36, 1.95, 0, 0.82, 0.12, 1.4, c2, { rz: -0.6 }); k.box(0, 2.15, 0, 0.2, 0.2, 1.3, 0xffffff); break;
        case 'cherry': ball(k, 0, 2.15, 0, 0.26, 0xff2a3a); k.box(0.05, 2.45, 0, 0.05, 0.3, 0.05, 0x3a8a3a, { rz: 0.3 }); break;
        case 'cable': k.box(0, 0.12, -1.3, 0.14, 0.14, 0.8, 0x3a3a48); k.box(0, 0.12, -1.85, 0.14, 0.14, 0.6, 0x3a3a48, { ry: 0.5 }); break;
        case 'plug': k.box(0, 2.45, 0, 0.6, 0.4, 0.4, c2); k.box(0, 2.45, 0.21, 0.4, 0.2, 0.02, 0x2a2a30); break;
        case 'buttons': k.box(-0.7, 0.8, f + 0.02, 0.5, 0.16, 0.08, 0x2a2a3a); k.box(-0.7, 0.8, f + 0.02, 0.16, 0.5, 0.08, 0x2a2a3a); for (const [x, yy] of [[0.6, 0.95], [0.85, 0.7], [0.35, 0.7]]) k.box(x, yy, f + 0.02, 0.2, 0.2, 0.08, c2); break;
        case 'phones': k.box(0, 1.85, 0, 2.1, 0.22, 0.3, 0x2a2a30); for (const sx of [-1, 1]) k.box(sx * 1.02, 1.1, 0, 0.32, 0.8, 0.8, c2, { soft: true }); break;
        case 'reels': for (const sx of [-0.55, 0.55]) { cyl(k, sx, 0.85, f + 0.01, 0.28, 0.06, 0xf4f4f8, Math.PI / 2, 0, 12); cyl(k, sx, 0.85, f + 0.03, 0.12, 0.06, 0x2a2a30, Math.PI / 2, 0, 8); } k.box(0, 1.25, f + 0.01, 1.8, 0.3, 0.05, c2); break;
        case 'cube': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const cs = [0xff3a3a, 0x3a8aff, 0xffe24a, 0x46ec50, 0xff8a1a, 0xffffff]; k.box(-0.52 + i * 0.52, 0.33 + j * 0.52, -0.82, 0.46, 0.46, 0.04, cs[(i + j * 2) % 6]); k.box(0.82, 0.33 + j * 0.52, -0.52 + i * 0.52, 0.04, 0.46, 0.46, cs[(i * 2 + j + 1) % 6]); k.box(-0.52 + i * 0.52, 1.66, -0.52 + j * 0.52, 0.46, 0.04, 0.46, cs[(i + j + 3) % 6]); } break;
        case 'antenna': k.box(0, 1.95, 0, 0.1, 0.7, 0.1, 0x8a8a98); ball(k, 0, 2.35, 0, 0.18, c2); for (const sx of [-1, 1]) k.box(sx * 0.95, 0.85, 0, 0.18, 0.5, 0.5, c2); break;
        case 'star': k.addGeo(colored(new T.ExtrudeGeometry(starShape(0.45, 0.2), { depth: 0.06, bevelEnabled: false }), 0xffffff), at(0, 1.05, f)); break;
        case 'stick': k.box(0, 1.65, 0, 1.8, 0.16, 1.8, c2, { soft: true }); k.box(0, 2.0, 0, 0.18, 0.7, 0.18, 0x3a3a48); ball(k, 0, 2.4, 0, 0.32, c2); break;
        case 'screen': k.box(0, 1.85, f + 0.02, 0.75, 0.5, 0.06, c2); k.box(0, 2.35, 0, 1.0, 0.16, 1.0, c2); break;
        case 'hat': cyl(k, 0, 2.0, 0, 0.62, 0.16, c2, 0, 0, 14); cyl(k, 0, 2.3, 0, 0.42, 0.5, c2, 0, 0, 14); k.box(0, 0.95, 0.75, 1.3, 0.22, 0.4, 0xff4a4a, { rx: 0.2 }); break;
        case 'beak': cone(k, 0, 1.25, f + 0.15, 0.18, 0.4, 0xffb01a, 6); k.box(-0.35, 0.05, 0.35, 0.4, 0.1, 0.5, 0xffb01a); k.box(0.35, 0.05, 0.35, 0.4, 0.1, 0.5, 0xffb01a); break;
        case 'halo': k.addGeo(colored(new T.TorusGeometry(0.55, 0.08, 6, 20), 0xfff4b8), at(0, 2.75, 0, Math.PI / 2, 0, 0)); break;
        case 'cracks': for (const [x, yy, r] of [[-0.4, 1.5, 0.5], [0.45, 0.6, -0.4], [0.2, 1.4, 1.1], [-0.55, 0.6, 0.9]]) k.box(x, yy, f + 0.03, 0.5, 0.08, 0.06, c2, { rz: r }); break;
        case 'flame': cone(k, 0, 2.25, 0, 0.45, 0.8, c2, 8); cone(k, 0.3, 1.9, 0, 0.25, 0.5, c2, 8); cone(k, -0.3, 1.95, 0, 0.25, 0.5, c2, 8); break;
        case 'handle': k.addGeo(colored(new T.TorusGeometry(0.42, 0.12, 6, 14, Math.PI), c2), at(0.85, 0.9, 0, 0, 0, -Math.PI / 2)); k.box(0, 1.72, 0, 1.5, 0.1, 1.5, 0x6a3a1a); break;
        case 'wings': for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) k.box(sx * (0.95 + j * 0.18), 1.4 + j * 0.15, -0.2 - j * 0.1, 0.12, 0.42, 0.9 - j * 0.15, j ? c2 : 0xffe24a, { rz: sx * (0.5 + j * 0.2) }); break;
        case 'crown': { const cy = top + 0.05; k.box(0, cy, 0, 1.1, 0.32, 1.1, 0xffd23a); for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) cone(k, x, cy + 0.35, z, 0.16, 0.4, 0xffd23a, 4); ball(k, 0, cy + 0.08, 0.56, 0.12, 0xff3a6a); break; }
        case 'handles': for (const sx of [-1, 1]) k.addGeo(colored(new T.TorusGeometry(0.34, 0.1, 6, 12, Math.PI), c2), at(sx * 0.85, 1.25, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2)); k.box(0, 0.1, 0, 1.1, 0.2, 1.1, c2); break;
        case 'ring': k.addGeo(colored(new T.TorusGeometry(1.45, 0.12, 6, 28), c2), at(0, 1.0, 0, Math.PI / 2 - 0.35, 0, 0.2)); break;
        case 'dome': ball(k, 0, 1.5, 0, 0.55, c2, 0.8); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ball(k, Math.cos(a) * 0.82, 0.95, Math.sin(a) * 0.82, 0.1, 0xffe24a); } break;
        default: break;
    }
    // the face: two big eyes with a shine, rosy cheeks, a little smile
    const ey = y, ez = f + 0.03;
    for (const sx of [-1, 1]) {
        k.box(sx * 0.33, ey, ez, 0.36, 0.46, 0.06, 0xffffff);
        k.box(sx * 0.33 + 0.03, ey - 0.04, ez + 0.03, 0.22, 0.3, 0.06, 0x1a1030);
        k.box(sx * 0.33 + 0.08, ey + 0.06, ez + 0.06, 0.08, 0.08, 0.04, 0xffffff);
        k.box(sx * 0.62, ey - 0.32, ez - 0.01, 0.24, 0.12, 0.05, 0xff8aa8);
    }
    k.box(0, ey - 0.36, ez, 0.26, 0.07, 0.05, 0x1a1030);
    return k.geometry();
}

// ----- the crowd: one instanced mesh per kind on screen -----
const meshes = new Map(), counts = new Map();
let mat = null;
const CAP = 24;
function meshOf(id) {
    let m = meshes.get(id);
    if (m) return m;
    const b = buddyById[id];
    if (!b) return null;
    if (!mat) mat = selfLit(new T.MeshLambertMaterial({ vertexColors: true }));
    m = new T.InstancedMesh(buildBuddy(b), mat, CAP);
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; m.count = 0;
    scene.add(m);
    meshes.set(id, m);
    return m;
}
export function beginBuddies() { counts.clear(); }
// a buddy at (x, y, z) facing ry, hopping (t: time, i: its place in the line)
export function addBuddy(id, x, y, z, ry, t, i) {
    const m = meshOf(id);
    if (!m) return;
    const n = counts.get(id) || 0;
    if (n >= CAP) return;
    const b = buddyById[id], s = (SIZE[b.rarity] || 1) * 0.95, hop = Math.abs(Math.sin(t * 6 + i * 1.3)) * 0.7;
    e.set(0, ry, Math.sin(t * 6 + i * 1.3) * 0.08, 'YXZ');
    q.setFromEuler(e);
    m.setMatrixAt(n, m4.compose(vP.set(x, y + hop, z), q, vS.set(s, s * (1 - hop * 0.08), s)));
    counts.set(id, n + 1);
}
export function endBuddies() {
    for (const [id, m] of meshes) { const n = counts.get(id) || 0; if (m.count !== n || n) { m.count = n; m.instanceMatrix.needsUpdate = true; } }
}
// every kind made and drawn once behind the loading screen (their shader and shadow programs compiled then)
export function buddiesWarm() { for (const b of BUDDIES.slice(0, 2)) { const m = meshOf(b.id); if (m) { m.count = 1; m.setMatrixAt(0, m4.makeTranslation(0, -60, 0)); } } }
// a buddy's geometry alone (the hatch screen and the index draw it big)
export const buddyGeo = (id) => { const b = buddyById[id]; return b ? buildBuddy(b) : null; };
export const buddyMaterial = () => mat || (mat = selfLit(new T.MeshLambertMaterial({ vertexColors: true })));
// where each of a character's buddies walks: behind them in a fan, each catching up on its own (st: the character's own list of where
// they are, kept between frames), turned the way it's going
export function placeTeam(st, team, x, y, z, ry, t, dt) {
    if (!team || !team.length) { st.length = 0; return; }
    const bx = -Math.sin(ry), bz = -Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry), k = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < team.length; i++) {
        const row = Math.floor(i / 3), col = (i % 3) - 1, d = 4.2 + row * 3.2;
        const tx = x + bx * d + rx * col * 3.1, tz = z + bz * d + rz * col * 3.1;
        let p = st[i];
        if (!p || (p.x - tx) ** 2 + (p.z - tz) ** 2 > 900) p = st[i] = { x: tx, y, z: tz, ry };
        const dx = tx - p.x, dz = tz - p.z;
        p.x += dx * k; p.z += dz * k; p.y += (y - p.y) * Math.min(1, dt * 10);
        if (dx * dx + dz * dz > 0.05) { let dr = Math.atan2(dx, dz) - p.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.ry += dr * Math.min(1, dt * 8); }
        else { let dr = ry - p.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.ry += dr * Math.min(1, dt * 3); }
        addBuddy(team[i], p.x, p.y, p.z, p.ry, t, i);
    }
    st.length = team.length;
}

// ----- a buddy's portrait for the menus: drawn once from its 3D model into a little picture (cached) -----
const iconCache = new Map();
let iconScene = null, iconCam = null, iconRT = null;
const IN = 128;
export function buddyIcon(id) {
    const hit = iconCache.get(id);
    if (hit) return hit;
    const b = buddyById[id];
    if (!b) return '';
    try {
        if (!iconScene) {
            iconScene = new T.Scene();
            iconScene.add(new T.HemisphereLight(0xffffff, 0x9a8a7a, 1.3), new T.AmbientLight(0xffffff, 0.5));
            const d = new T.DirectionalLight(0xffffff, 1.5); d.position.set(2, 4, 5); iconScene.add(d);
            iconCam = new T.PerspectiveCamera(28, 1, 0.1, 60);
            iconRT = new T.WebGLRenderTarget(IN, IN);
            iconRT.texture.colorSpace = T.SRGBColorSpace;
        }
        const mesh = new T.Mesh(buildBuddy(b), buddyMaterial());
        mesh.rotation.y = -0.5;
        iconScene.add(mesh);
        mesh.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(mesh), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()).length();
        iconCam.position.set(c.x + sz * 0.15, c.y + sz * 0.28, c.z + sz * 1.95); iconCam.lookAt(c);
        const prevRT = renderer.getRenderTarget(), prevA = renderer.getClearAlpha(), prevC = new T.Color(), prevSh = renderer.shadowMap.enabled;
        renderer.getClearColor(prevC);
        renderer.shadowMap.enabled = false;
        renderer.setRenderTarget(iconRT); renderer.setClearColor(0x000000, 0); renderer.clear();
        renderer.render(iconScene, iconCam);
        const px = new Uint8Array(IN * IN * 4);
        renderer.readRenderTargetPixels(iconRT, 0, 0, IN, IN, px);
        renderer.setRenderTarget(prevRT); renderer.setClearColor(prevC, prevA); renderer.shadowMap.enabled = prevSh;
        iconScene.remove(mesh); mesh.geometry.dispose();
        const cv = document.createElement('canvas'); cv.width = cv.height = IN;
        const cx = cv.getContext('2d'), im = cx.createImageData(IN, IN);
        for (let y = 0; y < IN; y++) im.data.set(px.subarray((IN - 1 - y) * IN * 4, (IN - y) * IN * 4), y * IN * 4);
        cx.putImageData(im, 0, 0);
        const url = cv.toDataURL();
        iconCache.set(id, url);
        return url;
    } catch (e) { return ''; }
}
