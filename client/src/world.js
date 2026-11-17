// The Mega Desk on screen (shared/world.js has where everything stands): you're tiny on a giant wooden desk in a giant sunny bedroom.
// Nine computer setups down the desk, each a keyboard (its keys one instanced draw), its monitor (a live screen: the word to type and
// what you've typed), a giant mouse (its buttons press under a MEGA CLICK) and a Buddy Box; the plaza by the spawn with the Tech Shop,
// the Click Speed Test, the Reboot terminal and the leaderboards; a coffee mug, a pencil cup, a lamp, a plant, a pile of books. The
// room round it (walls, windows onto the sky, a bed, a bookshelf, posters) is backdrop: no shadows, hazed by the room's air.
// Static things are merged per setup and batched (a setup off screen isn't drawn).
import { T, V3, scene, renderer, texFrom, fitFont, prompts, setGroundVisible, selfLit } from './engine.js';
import { Kit, glowVCMaterial, batchKits } from './geo.js';
import { KeySet, legendCell, keysNow } from './keys.js';
import { Signs, big, GOLD, LIME, WHITE, RED, AQUA, PINK } from './signs.js';
import { CU } from './clock.js';
import { P, KB_Y, KB_W, KB_D, DESK, SPAWN, KEYS, SETUPS, SHOP, SPEED, REBOOT, LEADER, PROPS } from '../../shared/world.js';
import { BOARDS, BOXES, fmt, fmtComma } from '../../shared/config.js';

const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const css = (c) => '#' + new T.Color(c).getHexString();
const RAINBOW = [0xff3a5a, 0xff8a1a, 0xffd21a, 0x3ae83a, 0x1ad8e8, 0x3a7aff, 0xb43aff];

// ----- wood: long boards, painted pixel by pixel once while loading. Flat-sawn grain (the growth rings cut at a slant: long
// stripes that close into arches once along a board), fine pores along it, each board its own shade, the seams between boards
// and their staggered end joints. A height field alongside makes the normal map (the seams are grooves, the late wood a touch
// lower), so the boards catch the sun. TILE world units a tile, along u; 4 boards across it. -----
const WOOD_TILE = 100;
function woodTextures(low, o) {
    o = o || {};
    const N = low ? 512 : 1024, BOARDS_N = 4, ph = N / BOARDS_N, px = N / WOOD_TILE, wantN = !low && o.nrm;
    let seed = o.seed || 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // a smooth 1D noise that wraps round the tile (so the tile repeats seamlessly)
    const wrapNoise = (cells, oct) => {
        const out = new Float32Array(N);
        for (let k = 0; k < oct; k++) {
            const n = cells << k, v = Array.from({ length: n }, rnd), amp = 1 / (1 << k);
            for (let x = 0; x < N; x++) { const f = x / N * n, i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t); out[x] += (v[i % n] + (v[(i + 1) % n] - v[i % n]) * s - 0.5) * amp; }
        }
        return out;
    };
    const early = o.early || [212, 166, 116], late = o.late || [150, 101, 60];
    const img = new Uint8ClampedArray(N * N * 4), hgt = wantN ? new Float32Array(N * N) : null;
    const pores = wrapNoise(64, 3), rowVal = new Float32Array(N), rowOff = new Int32Array(N);
    for (let y = 0; y < N; y++) { rowVal[y] = rnd(); rowOff[y] = Math.floor(rnd() * N); }
    for (let b = 0; b < BOARDS_N; b++) {
        const tone = 1 + (rnd() - 0.5) * 0.16, warm = (rnd() - 0.5) * 14;
        // the log's heart lies off the board (to one side): its rings cross the board as long stripes that drift into stretched
        // arches; never a bullseye
        const pith = rnd() < 0.5 ? -0.35 - rnd() * 1.1 : 1.35 + rnd() * 1.1, rings = 9 + rnd() * 8, arch = 0.08 + rnd() * 0.3, uc = rnd();
        const wave = wrapNoise(3, 3), wave2 = wrapNoise(5, 2), joint = Math.floor(rnd() * N);
        const archT = new Float32Array(N);
        for (let x = 0; x < N; x++) { const s = Math.sin(Math.PI * (x / N - uc)); archT[x] = s * s * arch; }
        for (let yy = 0; yy < ph; yy++) {
            const y = b * ph + yy, yl = (yy + 0.5) / ph, dy = (yl - pith) * (yl - pith);
            // the board's edges: rounded over and dark in the seam
            const e = Math.min(yy + 0.5, ph - yy - 0.5) / (1.2 * px), edge = e < 1 ? 0.55 + 0.45 * e * e * (3 - 2 * e) : 1;
            const rv = rowVal[y], ro = rowOff[y];
            for (let x = 0; x < N; x++) {
                const r = Math.sqrt(dy + archT[x]) * rings + wave[x] * 1.4 + wave2[x] * yl * 1.2;
                const f = r - Math.floor(r);
                const lw = (f < 0.62 ? 0 : f < 0.9 ? (f - 0.62) / 0.28 : 1 - (f - 0.9) / 0.1);
                const lwS = lw * lw * (3 - 2 * lw);
                const pore = (rv - 0.5) * 0.1 + pores[(x + ro) % N] * 0.12;
                const jd = Math.abs(x - joint), jt = jd < 0.7 * px ? 0.5 + 0.5 * (jd / (0.7 * px)) ** 2 : 1;
                const k = tone * edge * jt * (1 + pore);
                const i = (y * N + x) * 4, m = lwS * 0.55;
                img[i] = (early[0] + (late[0] - early[0]) * m + warm) * k;
                img[i + 1] = (early[1] + (late[1] - early[1]) * m + warm * 0.4) * k;
                img[i + 2] = (early[2] + (late[2] - early[2]) * m) * k;
                img[i + 3] = 255;
                if (hgt) hgt[y * N + x] = (edge - 1) * 1.6 + (jt - 1) * 1.6 - lwS * 0.08 + pore * 0.25;
            }
        }
    }
    const c = document.createElement('canvas'); c.width = c.height = N;
    c.getContext('2d').putImageData(new ImageData(img, N, N), 0, 0);
    const map = texFrom(c, true);
    map.anisotropy = Math.min(low ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
    let nrm = null;
    if (hgt) {
        const nd = new Uint8ClampedArray(N * N * 4), at = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)], S = 3.2;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * S, dy = (at(x, y + 1) - at(x, y - 1)) * S, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
            nd[i] = (-dx / l * 0.5 + 0.5) * 255; nd[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
        }
        const cn = document.createElement('canvas'); cn.width = cn.height = N;
        cn.getContext('2d').putImageData(new ImageData(nd, N, N), 0, 0);
        nrm = new T.CanvasTexture(cn);
        nrm.colorSpace = T.NoColorSpace; nrm.wrapS = nrm.wrapT = T.RepeatWrapping; nrm.anisotropy = map.anisotropy;
    }
    return { map, nrm };
}
// a big flat stretch of wood: subdivided so each vertex carries a gentle shade (no two stretches of the desk look alike from afar)
function woodPlane(w, d, tex, o) {
    o = o || {};
    const cell = o.cell || 12, g = new T.PlaneGeometry(w, d, Math.ceil(w / cell), Math.ceil(d / cell)).rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    const blob = Array.from({ length: 14 }, (_, i) => [Math.sin(i * 12.9898) * w * 0.5, Math.cos(i * 78.233) * d * 0.5, 30 + (i * 37 % 60), ((i * 53) % 7 - 3) * 0.022]);
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        let k = 1;
        for (const [bx, bz, r, a] of blob) k += a * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r));
        // a little darker toward the edges, where hands and time have been
        const ex = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
        k *= ex < 10 ? 0.93 + 0.07 * ex / 10 : 1;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const map = tex.map.clone(), nrm = tex.nrm && tex.nrm.clone();
    map.repeat.set(w / WOOD_TILE, d / WOOD_TILE); map.rotation = Math.PI / 2;
    if (nrm) { nrm.repeat.copy(map.repeat); nrm.rotation = map.rotation; }
    const mat = new T.MeshLambertMaterial({ map, vertexColors: true, color: o.tint ?? 0xffffff });
    if (nrm) { mat.normalMap = nrm; mat.normalScale = new T.Vector2(0.9, 0.9); }
    return new T.Mesh(g, mat);
}

// a soft dark patch, darkest in its middle
let softTex = null;
function softShadowTex() {
    if (softTex) return softTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(40,22,10,0.5)'); g.addColorStop(0.55, 'rgba(40,22,10,0.32)'); g.addColorStop(1, 'rgba(40,22,10,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    softTex = new T.CanvasTexture(c); softTex.colorSpace = T.SRGBColorSpace;
    return softTex;
}
// ----- a leaderboard's face (drawn at 768 x 900, stored at 2/3 of that; only when the rows changed) -----
function boardTexture(title, unit) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 600;
    return { c, t: texFrom(c), title, unit, key: '' };
}
function drawBoard(B, rows) {
    const key = JSON.stringify(rows || []);
    if (key === B.key) return;
    B.key = key;
    const x = B.c.getContext('2d'), Wd = 768, H = 900;
    x.setTransform(B.c.width / Wd, 0, 0, B.c.height / H, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2a5a'); g.addColorStop(1, '#16163a');
    x.fillStyle = g; x.fillRect(0, 0, Wd, H);
    x.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 9; i++) for (let j = 0; j < 11; j++) { x.beginPath(); x.roundRect(10 + i * 84, 10 + j * 84, 70, 70, 14); x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, B.title, Wd - 40, 74, 400, '"Luckiest Guy", Fredoka, sans-serif', 0.2);
    x.lineWidth = 14; x.strokeStyle = '#0a0a2a'; x.strokeText(B.title, Wd / 2, 70); x.fillStyle = '#ffe24a'; x.fillText(B.title, Wd / 2, 70);
    const medal = ['#ffd23a', '#d8dce8', '#e09a5a'];
    (rows || []).slice(0, 9).forEach((r, i) => {
        const y = 170 + i * 80;
        if (i < 3) { x.fillStyle = medal[i]; x.beginPath(); x.arc(52, y, 24, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1a1030'; x.font = '700 30px Fredoka, sans-serif'; x.textAlign = 'center'; x.fillText(String(i + 1), 52, y + 2); }
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#0a0a2a';
        const name = (i < 3 ? '' : '#' + (i + 1) + ' ') + r.n;
        fitFont(x, name, Wd - 330, 44, 700, 'Fredoka, sans-serif', 0);
        x.strokeText(name, i < 3 ? 90 : 40, y); x.fillStyle = '#ffffff'; x.fillText(name, i < 3 ? 90 : 40, y);
        x.textAlign = 'right'; x.font = '700 44px Fredoka, sans-serif';
        const v = B.unit === 'speed' ? fmtComma(r.v) : fmt(r.v);
        x.strokeText(v, Wd - 40, y); x.fillStyle = '#7dff6b'; x.fillText(v, Wd - 40, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#c8d4ff'; x.fillText('Be the first!', Wd / 2, 200); }
    B.t.needsUpdate = true;
}

// ----- a monitor's screen -----
const MW = 512, MH = 292;
function screenBg(x, B, title) {
    const g = x.createLinearGradient(0, 0, MW, MH);
    g.addColorStop(0, css(shade(B.screen, 0.55))); g.addColorStop(1, css(shade(B.screen, 0.2)));
    x.fillStyle = g; x.fillRect(0, 0, MW, MH);
    // the OS's top bar
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, MW, 30);
    for (let i = 0; i < 3; i++) { x.fillStyle = ['#ff5a5a', '#ffd23a', '#46ec50'][i]; x.beginPath(); x.arc(18 + i * 20, 15, 6, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffffff'; x.font = '700 16px Fredoka, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText(title, 82, 16);
}
// a keyboard's idle screen: its name and what it pays, or what opens it
function idleScreen(B, locked) {
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    const x = c.getContext('2d');
    screenBg(x, B, 'KeystompOS · ' + B.name);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (B.stars) { x.fillStyle = '#ffffff'; for (let i = 0; i < 60; i++) { x.globalAlpha = Math.random() * 0.8; x.fillRect(Math.random() * MW, 32 + Math.random() * (MH - 32), 2, 2); } x.globalAlpha = 1; }
    fitFont(x, B.name.toUpperCase(), MW - 60, 54, 400, '"Luckiest Guy", Fredoka, sans-serif', 0.2);
    x.lineWidth = 10; x.strokeStyle = '#100a24'; x.strokeText(B.name.toUpperCase(), MW / 2, 104); x.fillStyle = '#ffffff'; x.fillText(B.name.toUpperCase(), MW / 2, 104);
    x.font = '400 64px "Luckiest Guy", Fredoka, sans-serif';
    x.strokeText('x' + fmt(B.mult), MW / 2, 176); x.fillStyle = '#ffe24a'; x.fillText('x' + fmt(B.mult), MW / 2, 176);
    x.font = '700 24px Fredoka, sans-serif';
    const line = locked ? '🔒 Opens at ' + fmtComma(B.need) + ' clicks' : 'Stomp the keys!';
    x.lineWidth = 6; x.strokeText(line, MW / 2, 240); x.fillStyle = locked ? '#ffb0a0' : '#c8ffc0'; x.fillText(line, MW / 2, 240);
    return c;
}

// ----- the room round the desk: backdrop, no shadows -----
const FLOOR_Y = -150, CEIL_Y = 520;
const ROOM = { x0: -760, x1: 760, z0: -980, z1: 640 };
function buildRoom(k) {
    const R = ROOM, wallC = 0xbfe0ee, wall2 = 0xf4ead8, trim = 0xffffff;
    // the floor (its boards are a textured plane: buildDesk), a round rug under the desk
    k.addGeo(colorGeo(new T.CylinderGeometry(420, 420, 1.5, 48), 0x6a8ad8), new T.Matrix4().makeTranslation(-20, FLOOR_Y + 0.8, -120));
    k.addGeo(colorGeo(new T.CylinderGeometry(330, 330, 1.6, 48), 0xf4d8a0), new T.Matrix4().makeTranslation(-20, FLOOR_Y + 0.9, -120));
    k.addGeo(colorGeo(new T.CylinderGeometry(240, 240, 1.7, 48), 0xe8826a), new T.Matrix4().makeTranslation(-20, FLOOR_Y + 1.0, -120));
    const H = CEIL_Y - FLOOR_Y, my = (CEIL_Y + FLOOR_Y) / 2;
    // walls: west and south plain, north and east with windows onto the sky (the sky dome shows through the openings)
    k.box(R.x0 - 5, my, (R.z0 + R.z1) / 2, 10, H, R.z1 - R.z0, wallC);
    k.box(0, my, R.z1 + 5, R.x1 - R.x0, H, 10, wall2);
    // north wall: a window x -260..260, y 60..360
    const wx0 = -260, wx1 = 260, wy0 = 60, wy1 = 380;
    k.box((R.x0 + wx0) / 2, my, R.z0 - 5, wx0 - R.x0, H, 10, wall2);
    k.box((wx1 + R.x1) / 2, my, R.z0 - 5, R.x1 - wx1, H, 10, wall2);
    k.box(0, (FLOOR_Y + wy0) / 2, R.z0 - 5, wx1 - wx0, wy0 - FLOOR_Y, 10, wall2);
    k.box(0, (wy1 + CEIL_Y) / 2, R.z0 - 5, wx1 - wx0, CEIL_Y - wy1, 10, wall2);
    winFrame(k, 'z', R.z0 + 2, wx0, wx1, wy0, wy1, trim);
    // east wall (the sun's side): a big window z -520..220, y 40..400
    const ez0 = -520, ez1 = 220, ey0 = 40, ey1 = 400;
    k.box(R.x1 + 5, my, (R.z0 + ez0) / 2, 10, H, ez0 - R.z0, wallC);
    k.box(R.x1 + 5, my, (ez1 + R.z1) / 2, 10, H, R.z1 - ez1, wallC);
    k.box(R.x1 + 5, (FLOOR_Y + ey0) / 2, (ez0 + ez1) / 2, 10, ey0 - FLOOR_Y, ez1 - ez0, wallC);
    k.box(R.x1 + 5, (ey1 + CEIL_Y) / 2, (ez0 + ez1) / 2, 10, CEIL_Y - ey1, ez1 - ez0, wallC);
    winFrame(k, 'x', R.x1 - 2, ez0, ez1, ey0, ey1, trim);
    // curtains either side of the east window
    for (const z of [ez0 - 40, ez1 + 40]) for (let i = 0; i < 5; i++) k.box(R.x1 - 18, (ey0 + ey1) / 2 + 30, z + (i - 2) * 14, 10, ey1 - ey0 + 120, 13, i % 2 ? 0xff8a8a : 0xffa8a0, { soft: true });
    // ceiling, skirting
    k.box(0, CEIL_Y + 5, (R.z0 + R.z1) / 2, R.x1 - R.x0, 10, R.z1 - R.z0, 0xfaf6ee);
    k.box(0, FLOOR_Y + 10, R.z1 - 2, R.x1 - R.x0, 20, 4, trim); k.box(R.x0 + 2, FLOOR_Y + 10, (R.z0 + R.z1) / 2, 4, 20, R.z1 - R.z0, trim);
    // the ceiling lamp
    k.addGeo(colorGeo(new T.CylinderGeometry(70, 110, 50, 24, 1, true), 0xfff4d0), new T.Matrix4().makeTranslation(0, CEIL_Y - 80, -150));
    k.box(0, CEIL_Y - 30, -150, 6, 60, 6, 0x8a8a98);
    // a bed against the west wall: frame, mattress, blanket, pillows
    const bx = -560, bz = -300;
    k.box(bx, FLOOR_Y + 40, bz, 320, 80, 520, 0x8a5a3a, { soft: true });
    k.box(bx, FLOOR_Y + 95, bz, 300, 40, 500, 0xffffff, { soft: true });
    k.box(bx + 10, FLOOR_Y + 118, bz + 60, 306, 18, 380, 0x5a8aff, { soft: true });
    for (const z of [-140, 140]) k.box(bx - 8, FLOOR_Y + 130, bz - 210 + (z > 0 ? 0 : 0) + z * 0.0, 90, 30, 130, 0xfff4e0, { soft: true });
    k.box(bx - 150, FLOOR_Y + 160, bz, 20, 320, 520, 0x7a4a2a, { soft: true });
    // a bookshelf on the south wall, full of books
    const sx = 380, sz = R.z1 - 50;
    k.box(sx, FLOOR_Y + 250, sz, 280, 500, 90, 0x9a6a40);
    for (let r = 0; r < 4; r++) {
        let x0 = sx - 125;
        k.box(sx, FLOOR_Y + 40 + r * 120, sz - 4, 266, 8, 86, 0x7a4a2a);
        while (x0 < sx + 120) { const w = 12 + Math.random() * 16, h = 60 + Math.random() * 45; k.box(x0 + w / 2, FLOOR_Y + 44 + r * 120 + h / 2, sz - 10, w - 1.5, h, 60, RAINBOW[Math.floor(Math.random() * RAINBOW.length)]); x0 += w; }
    }
    // posters and a clock on the walls
    k.box(R.x0 + 2, 260, -620, 4, 200, 150, 0xffd23a); k.box(R.x0 + 4, 260, -620, 4, 180, 130, 0x3a7aff);
    k.box(R.x0 + 2, 230, 260, 4, 160, 220, 0xff5ac0); k.box(R.x0 + 4, 230, 260, 4, 140, 200, 0x2a2a5a);
    k.box(-520, 270, R.z0 + 2, 180, 240, 4, 0x46ec50); k.box(-520, 270, R.z0 + 4, 160, 220, 4, 0xffffff);
    k.box(500, 300, R.z0 + 2, 140, 140, 4, 0xff8a3a); k.box(500, 300, R.z0 + 4, 120, 120, 4, 0xfff4e0);
    k.addGeo(colorGeo(new T.CylinderGeometry(60, 60, 6, 32), 0xffffff), new T.Matrix4().compose(new V3(-60, 430, R.z1 - 6), new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)), new V3(1, 1, 1)));
    // the desk's legs and a chest of drawers under it, down to the floor
    for (const x of [DESK.x0 + 10, DESK.x1 - 10]) for (const z of [DESK.z0 + 10, DESK.z1 - 10]) k.box(x, (FLOOR_Y - 10) / 2, z, 16, -FLOOR_Y - 10, 16, 0x8a5a32);
    k.box(DESK.x1 - 60, (FLOOR_Y - 10) / 2, -40, 100, -FLOOR_Y - 10, 280, 0xa8703c);
    for (let i = 0; i < 3; i++) { k.box(DESK.x1 - 60, -30 - i * 40, 101, 92, 34, 2, 0xc08850); k.box(DESK.x1 - 60, -30 - i * 40, 103, 30, 6, 4, 0xe8d8b8); }
}
function winFrame(k, axis, at, a0, a1, y0, y1, c) {
    const T2 = 10, place = (u, y, su, sy) => (axis === 'z' ? k.box(u, y, at, su, sy, 8, c) : k.box(at, y, u, 8, sy, su, c));
    place((a0 + a1) / 2, y0, a1 - a0 + T2, T2); place((a0 + a1) / 2, y1, a1 - a0 + T2, T2);
    place(a0, (y0 + y1) / 2, T2, y1 - y0); place(a1, (y0 + y1) / 2, T2, y1 - y0);
    place((a0 + a1) / 2, (y0 + y1) / 2, 6, y1 - y0); place((a0 + a1) / 2, (y0 + y1) / 2, a1 - a0, 6);
    // the sill
    if (axis === 'z') k.box((a0 + a1) / 2, y0 - 6, at + 10, a1 - a0 + 30, 6, 26, c); else k.box(at - 10, y0 - 6, (a0 + a1) / 2, 26, 6, a1 - a0 + 30, c);
}
function colorGeo(g, c) {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), tc = new T.Color(c);
    for (let i = 0; i < n; i++) { col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
}
const cylAt = (k, x, y, z, r0, r1, h, c, seg, glow) => k.addGeo(colorGeo(new T.CylinderGeometry(r0, r1, h, seg || 20), c), new T.Matrix4().makeTranslation(x, y, z), glow);

// ----- a keyboard's build: the plate's top, the bezel's top, the keys' base and height (their tops stand ~0.85 over the case top
// you walk at, KB_Y; pressed, a key comes down to just under your feet) -----
const PLATE_Y = 0.55, BEZEL_Y = 1.3, KEY_BASE = 0.2, KEY_H = 1.65;
const ROW_RISE = [0.15, 0.06, 0, 0.02, 0.04], ROW_TILT = [0.12, 0.05, 0, -0.06, -0.09], ROUND_RISE = [0.3, 0.2, 0.1, 0, -0.05];
// ----- each setup's desk mat -----
const MAT = { office: 0x34405a, bubble: 0x7a2a5e, mech: 0x1c1a2c, type: 0x3a2618, rgb: 0x121420, frost: 0x24486a, lava: 0x2a1410, gold: 0x3a280e, galaxy: 0x140a2c };
// ----- the glow a key lights up in when it's pressed: its keyboard's colour; the RGB Gamer's by column through the rainbow -----
function litOf(B, k, i) {
    if (B.rgb) return RAINBOW[Math.floor((k.x / P + 7.5) / 15 * 7) % 7];
    if (B.id === 'galaxy') return [0xff8af0, 0x8ae8ff, 0xb48aff][i % 3];
    if (B.id === 'type') return 0xffc86a;
    if (B.id === 'gold') return 0xfff4b8;
    if (B.id === 'office') return 0x6ac8ff;
    return B.acc;
}
// ----- a key's colour on each keyboard -----
function keyColor(B, k, i) {
    const mod = !k.ch || k.ch === ' ';
    let c = mod ? B.cap[1] : B.cap[0];
    switch (B.id) {
        case 'office': if (k.t === 'Esc') c = 0xe87a6a; break;
        case 'bubble': if (!mod && i % 3 === 0) c = 0xfff0fa; if (k.t === 'ENTER' || k.t === 'Esc' || k.ch === ' ') c = B.acc; break;
        case 'mech': if (k.t === 'ENTER' || k.t === 'Esc') c = B.acc; break;
        case 'frost': if (!mod && i % 2) c = 0xd8f0ff; if (k.t === 'ENTER') c = B.acc; break;
        case 'lava': if (k.t === 'ENTER' || k.t === 'Esc' || k.ch === ' ') c = 0xff6a1a; break;
        case 'gold': if (!mod && i % 4 === 0) c = 0xfff4b8; if (mod) c = 0xe0a828; break;
        case 'galaxy': if (!mod) c = [0x2a1a5a, 0x3a2472, 0x1a2a6a, 0x4a1a5a][i % 4]; if (k.t === 'ENTER' || k.ch === ' ') c = 0xb45aff; break;
        default: break;
    }
    return c;
}
function inkOf(B, k) {
    if (B.id === 'bubble' && (k.t === 'ENTER' || k.t === 'Esc' || k.ch === ' ')) return 0xffffff;
    if (B.id === 'lava' && (k.t === 'ENTER' || k.t === 'Esc' || k.ch === ' ')) return 0x2a0a00;
    if (B.id === 'mech' && (k.t === 'ENTER' || k.t === 'Esc')) return 0xffffff;
    return new T.Color(B.ink).getHex();
}

export function buildDesk(opts) {
    opts = opts || {};
    setGroundVisible(false);
    const low = !!opts.low;
    // keys further than this from the camera aren't drawn (the plate under them shows)
    const keyFar = low ? 320 : 360, keyNear = 130;
    const group = new T.Group(), signs = new Signs(4, 448, 152);
    // a kit per area: the plaza, each setup, the far props; the room alone (no shadows)
    const kPlaza = new Kit({ glow: true }), kSet = SETUPS.map(() => new Kit({ glow: true })), kProps = new Kit({ glow: true }), kRoom = new Kit({ glow: true });
    buildRoom(kRoom);
    // ----- the desk: a wooden slab (its top one textured plane), a rounded lip round it -----
    const dw = DESK.x1 - DESK.x0 + 8, dd = DESK.z1 - DESK.z0 + 8, dcx = (DESK.x0 + DESK.x1) / 2, dcz = (DESK.z0 + DESK.z1) / 2;
    const wood = woodTextures(low, { nrm: !!opts.high });
    const deskTop = woodPlane(dw, dd, wood);
    deskTop.position.set(dcx, 0, dcz);
    deskTop.receiveShadow = true;
    deskTop.renderOrder = 0;
    group.add(deskTop);
    // the bedroom's floorboards: darker, older wood (the same boards, tinted; backdrop: no shadows)
    const floor = woodPlane(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0, wood, { tint: 0x9a7058, cell: 160 });
    floor.material.map.repeat.multiplyScalar(0.8); if (floor.material.normalMap) floor.material.normalMap.repeat.multiplyScalar(0.8);
    floor.position.set((ROOM.x0 + ROOM.x1) / 2, FLOOR_Y + 0.05, (ROOM.z0 + ROOM.z1) / 2);
    floor.receiveShadow = false;
    group.add(floor);
    // the slab under it (its top a hair below the wood's, so the two never fight over the same pixels)
    kRoom.box(dcx, -6.1, dcz, dw, 12, dd, 0x9a6a44);
    for (const [x, z, sx, sz] of [[dcx, DESK.z1 + 4, dw + 4, 3], [dcx, DESK.z0 - 4, dw + 4, 3], [DESK.x0 - 4, dcz, 3, dd], [DESK.x1 + 4, dcz, 3, dd]]) kPlaza.box(x, 0.4, z, sx, 1.4, sz, 0xb8885a, { soft: true });
    // ----- things lying on the desk: sticky notes, sheets of paper, a pen, coins -----
    const notes = [[-30, 40, 0.3, 0xffe24a], [36, 64, -0.2, 0xff9ad0], [-104, 12, 0.5, 0x8ae8ff], [110, -40, -0.4, 0xaaff8a], [-20, -110, 0.15, 0xffe24a], [104, -128, 0.7, 0xff9ad0], [-108, -200, -0.3, 0x8ae8ff], [20, -280, 0.4, 0xaaff8a], [-60, 120, -0.6, 0xffb04a]];
    const onMat = (x, z) => SETUPS.some((st) => { const ms = st.mouse, fw = KB_W / 2, fd = KB_D / 2; return x > Math.min(st.x - fw, ms.x - ms.hx) - 15 && x < Math.max(st.x + fw, ms.x + ms.hx) + 15 && z > st.z - fd - 17 && z < st.z + fd + 15; });
    notes.forEach(([x, z, r, c], i) => { if (!onMat(x, z)) kSet[0].box(x, 0.06, z, 13, 0.12, 13, c, { ry: r, shade: 1 + (i % 2) * 0.02 }); });
    kPlaza.box(88, 0.08, 118, 26, 0.12, 34, 0xffffff, { ry: 0.25 }); kPlaza.box(92, 0.16, 116, 26, 0.12, 34, 0xf8f8ff, { ry: 0.1 });
    for (let i = 0; i < 6; i++) kPlaza.box(84 + 2, 0.24, 106 + i * 3.6, 18, 0.06, 0.5, 0x8ab4ff, { ry: 0.1 });
    kPlaza.box(-88, 0.9, 74, 2, 1.8, 30, 0x3a7aff, { ry: 0.6, soft: true }); kPlaza.box(-88 - 9.3, 0.9, 74 + 12.6, 2.1, 1.9, 4, 0xe8e8f0, { ry: 0.6 });
    for (const [x, z] of [[24, 118], [27, 121], [-36, 92]]) cylAt(kPlaza, x, 0.3, z, 2.2, 2.2, 0.6, 0xffd23a, 16);
    // ----- the spawn: a mousepad with KEYSTOMP on it -----
    kPlaza.box(SPAWN.x, 0.15, SPAWN.z, 44, 0.3, 30, 0x2a2a5a, { soft: true });
    kPlaza.box(SPAWN.x, 0.32, SPAWN.z, 40, 0.06, 26, 0x3a3a7a);
    // its stitched edge: a dashed seam all round
    for (const [len, along, at] of [[40, 'x', SPAWN.z - 12.2], [40, 'x', SPAWN.z + 12.2], [26, 'z', SPAWN.x - 19.2], [26, 'z', SPAWN.x + 19.2]]) {
        const n = Math.floor((len - 2) / 1.6);
        for (let i = 0; i < n; i++) {
            const u = -((n - 1) * 1.6) / 2 + i * 1.6;
            if (along === 'x') kPlaza.box(SPAWN.x + u, 0.36, at, 1, 0.04, 0.22, 0x9a9ae8); else kPlaza.box(at, 0.36, SPAWN.z + u, 0.22, 0.04, 1, 0x9a9ae8);
        }
    }
    for (let k = 0; k < 4; k++) kPlaza.box(SPAWN.x, 0.4, SPAWN.z, k % 2 ? 9 : 14, 0.08, 1.3, RAINBOW[k * 2], { ry: k * Math.PI / 4, glow: 1 });
    // chevrons from the spawn to the first keyboard
    for (let k = 0; k < 3; k++) { const z = 70 - k * 6; kPlaza.box(-3.2, 0.2, z, 8, 0.25, 2.2, 0x46ec50, { glow: 2, ry: 0.85 }); kPlaza.box(3.2, 0.2, z, 8, 0.25, 2.2, 0x46ec50, { glow: 2, ry: -0.85 }); }
    // ----- the setups -----
    const keySets = [], monitors = [], fenceM4 = [], mats = [], soft = [];
    const live = { c: document.createElement('canvas'), tex: null, at: -1 };
    live.c.width = MW; live.c.height = MH; live.tex = texFrom(live.c);
    const btnGeo = new T.BoxGeometry(1, 1, 1);
    const btnMesh = new T.InstancedMesh(btnGeo, glowlessMat(), SETUPS.length * 2);
    const btnState = [];
    const m4 = new T.Matrix4(), qI = new T.Quaternion(), vP = new V3(), vS = new V3(), tc = new T.Color();
    const setupV = SETUPS.map((st) => {
        const B = st.b, k = kSet[st.i], fw = KB_W / 2, fd = KB_D / 2, ms = st.mouse, mo = st.mon;
        const glowy = B.id !== 'office' && B.id !== 'type';
        // the desk mat the keyboard and the mouse sit on: the setup's own colour, its edge lit
        const m0 = Math.min(st.x - fw, ms.x - ms.hx) - 6, m1 = Math.max(st.x + fw, ms.x + ms.hx) + 6, mz0 = st.z - fd - 8, mz1 = st.z + fd + 6;
        const mcx = (m0 + m1) / 2, mcz = (mz0 + mz1) / 2, mw = m1 - m0, md = mz1 - mz0;
        mats.push({ x0: m0, x1: m1, z0: mz0, z1: mz1 });
        k.box(mcx, 0.07, mcz, mw, 0.14, md, MAT[B.id] || 0x2a2a3a, { soft: true });
        const edgeC = (i, n) => (B.rgb ? RAINBOW[i % RAINBOW.length] : B.acc);
        const seg = 8;
        for (let i = 0; i < seg; i++) {
            const u0 = m0 + 1 + i * (mw - 2) / seg, u1 = u0 + (mw - 2) / seg - 0.2;
            k.box((u0 + u1) / 2, 0.16, mz1 - 0.7, u1 - u0, 0.06, 0.5, edgeC(i, seg), { glow: glowy ? 1 : 0, shade: glowy ? 1 : 0.9 });
            k.box((u0 + u1) / 2, 0.16, mz0 + 0.7, u1 - u0, 0.06, 0.5, edgeC(i + 3, seg), { glow: glowy ? 1 : 0, shade: glowy ? 1 : 0.9 });
        }
        for (const sx of [m0 + 0.7, m1 - 0.7]) k.box(sx, 0.16, mcz, 0.5, 0.06, md - 1.4, edgeC(sx > mcx ? 5 : 1, 1), { glow: glowy ? 1 : 0, shade: glowy ? 1 : 0.9 });
        // the keyboard's case: a bottom shell a little wider, the dark plate the keys stand in (it shows between them), the bezel
        // round it (the keys stand proud of it), its lit edge. You stand at KB_Y whatever it looks like (shared/world.js)
        k.box(st.x, 0.25, st.z, KB_W + 1.4, 0.5, KB_D + 1.4, shade(B.edge, 0.72), { soft: true });
        k.box(st.x, PLATE_Y / 2, st.z, KB_W - 2, PLATE_Y, KB_D - 2, mixC(B.edge, 0x050508, 0.78));
        k.box(st.x, BEZEL_Y / 2, st.z - fd + 0.8, KB_W, BEZEL_Y, 1.6, B.edge, { soft: true });
        k.box(st.x, BEZEL_Y / 2, st.z + fd - 0.8, KB_W, BEZEL_Y, 1.6, B.edge, { soft: true });
        k.box(st.x - fw + 0.8, BEZEL_Y / 2, st.z, 1.6, BEZEL_Y, KB_D - 3, B.edge, { soft: true });
        k.box(st.x + fw - 0.8, BEZEL_Y / 2, st.z, 1.6, BEZEL_Y, KB_D - 3, B.edge, { soft: true });
        for (const sz of [-1, 1]) k.box(st.x, BEZEL_Y + 0.02, st.z + sz * (fd - 0.8), KB_W - 1.6, 0.08, 0.4, B.acc, { glow: 1 });
        for (const sx of [-1, 1]) k.box(st.x + sx * (fw - 0.8), BEZEL_Y + 0.02, st.z, 0.4, 0.08, KB_D - 1.6, B.acc, { glow: 1 });
        if (B.rgb) for (let i = 0; i < 7; i++) k.box(st.x - fw + 6 + i * (KB_W - 12) / 6, BEZEL_Y + 0.08, st.z + fd - 0.8, 4, 0.1, 0.6, RAINBOW[i], { glow: 1 });
        // the backlight, seen between the keys: the RGB Gamer's runs through the rainbow across the board, the others glow softly
        // in their colour
        if (B.rgb) for (let i = 0; i < 7; i++) k.box(st.x - (KB_W - 3.2) / 2 + (i + 0.5) * (KB_W - 3.2) / 7, PLATE_Y + 0.01, st.z, (KB_W - 3.2) / 7, 0.02, KB_D - 3.2, shade(RAINBOW[i], 0.7), { glow: 1 });
        else if (glowy) k.box(st.x, PLATE_Y + 0.01, st.z, KB_W - 3.2, 0.02, KB_D - 3.2, shade(B.acc, 0.32), { glow: 1 });
        // underglow: light spilling onto the mat round the case
        if (glowy) {
            const ug = 1.2;
            for (const sz of [-1, 1]) k.box(st.x, 0.18, st.z + sz * (fd + 1.1), KB_W + 2.6, 0.04, ug, B.rgb ? RAINBOW[sz > 0 ? 1 : 5] : B.acc, { glow: 1 });
            for (const sx of [-1, 1]) k.box(st.x + sx * (fw + 1.1), 0.18, st.z, ug, 0.04, KB_D + 2.6, B.rgb ? RAINBOW[sx > 0 ? 3 : 6] : B.acc, { glow: 1 });
        }
        // a little brand plate on the front, the status lights
        k.box(st.x + fw - 10, 0.75, st.z + fd + 0.05, 5, 0.5, 0.1, shade(B.edge, 1.3));
        for (let i = 0; i < 3; i++) k.box(st.x + fw - 4 + i * 1.2, BEZEL_Y + 0.05, st.z - fd + 0.8, 0.5, 0.1, 0.5, [0x46ec50, 0x46ec50, 0xffd23a][i], { glow: 1 });
        // the cable to the monitor
        k.box(st.x + 10, 0.4, st.z - fd - 4, 0.9, 0.8, 8, 0x2a2a30, { soft: true });
        k.box(st.x + 10, 0.4, st.z - fd - 14, 0.9, 0.8, 12, 0x2a2a30, { soft: true, ry: 0.35 });
        // the keys: one draw per keyboard (each lights up in its keyboard's colour when pressed)
        // sculpted rows like a real board's: the number row tallest and leaning back, the bottom rows leaning forward; a typewriter's
        // rows step up toward the back
        const list = KEYS.map((key, i) => {
            const h = KEY_H + (B.round ? ROUND_RISE : ROW_RISE)[key.row], rx = B.round ? 0 : ROW_TILT[key.row];
            return {
                x: st.x + key.x, y: KEY_BASE, z: st.z + key.z - Math.sin(rx) * h * 0.5, w: key.w * P - (B.round ? 0.9 : 0.32), h, d: P - (B.round ? 0.9 : 0.32), rx,
                color: keyColor(B, key, i), ink: inkOf(B, key), cell: legendCell(key.t), rgb: !!B.rgb, lit: litOf(B, key, i),
            };
        });
        const set = new KeySet(list, { round: !!B.round });
        set.colors = list.map((x) => x.color);
        keySets.push(set); group.add(set.mesh);
        // the monitor: an oval foot, a slim arm, a thin bezel, a deeper shell behind, a chin with a lit logo
        const dark = B.id === 'office' ? 0x2a2a30 : shade(B.edge, 0.9), shell = shade(dark, 0.85);
        k.addGeo(colorGeo(new T.CylinderGeometry(1, 1.06, 1, 28), shade(dark, 1.1)), new T.Matrix4().compose(new V3(mo.x, 0.5, mo.z + 1), new T.Quaternion(), new V3(12, 1, 6)));
        k.box(mo.x, (mo.y0 + 3) / 2 + 0.4, mo.z - 0.6, 5, mo.y0 + 3, 2.4, shade(dark, 1.15), { soft: true, rx: 0.08 });
        k.box(mo.x, mo.y0 + mo.h / 2 + 2, mo.z - 1.9, mo.w - 8, mo.h - 6, 3.2, shell, { soft: true });
        k.box(mo.x, mo.y0 + mo.h / 2 + 2.6, mo.z, mo.w + 2.4, mo.h + 1.8, 2.2, dark, { soft: true });
        k.box(mo.x, mo.y0 + 0.7, mo.z + 0.1, mo.w + 2.4, 2.8, 2.4, dark, { soft: true });
        k.box(mo.x, mo.y0 + 0.75, mo.z + 1.35, 5, 0.7, 0.1, B.acc, { glow: 1 });
        k.box(mo.x + mo.w / 2 - 2, mo.y0 + 0.75, mo.z + 1.35, 0.6, 0.6, 0.1, 0x46ec50, { glow: 1 });
        // a soft light spilling from behind the screen onto the wall of air (the setup's colour)
        if (glowy) k.box(mo.x, mo.y0 + mo.h / 2 + 2, mo.z - 3.6, mo.w - 12, mo.h - 10, 0.1, B.acc, { glow: 1 });
        const idle = [texFrom(idleScreen(B, false)), texFrom(idleScreen(B, true))];
        const scr = new T.Mesh(new T.PlaneGeometry(mo.w, mo.h), new T.MeshBasicMaterial({ map: idle[1], toneMapped: false }));
        scr.position.set(mo.x, mo.y0 + mo.h / 2 + 2.6, mo.z + 1.15);
        group.add(scr);
        monitors.push({ scr, idle, locked: true });
        // the giant mouse: its body, a hump at the back, grips down the sides, an RGB strip round its foot, a lit logo, the wheel, its
        // cable (the buttons themselves are instanced: they press)
        const mcol = B.id === 'office' ? 0xe8e8ee : shade(B.edge, 1.05);
        k.box(ms.x, ms.top / 2 - 0.3, ms.z + 1.5, ms.hx * 2, ms.top - 0.6, ms.hz * 2 - 3, mcol, { soft: true });
        k.addGeo(colorGeo(new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mcol), new T.Matrix4().compose(new V3(ms.x, ms.top - 0.9, ms.z + 4), new T.Quaternion(), new V3(ms.hx - 0.2, 2.2, ms.hz - 4.5)));
        for (const sx of [-1, 1]) k.box(ms.x + sx * (ms.hx - 0.1), ms.top * 0.45, ms.z + 2, 0.6, ms.top * 0.5, ms.hz * 1.3, shade(mcol, 0.7), { soft: true });
        k.box(ms.x, 0.35, ms.z + 1.5, ms.hx * 2 + 0.4, 0.3, ms.hz * 2 - 2.6, B.rgb ? RAINBOW[2] : glowy ? B.acc : shade(mcol, 0.8), { glow: glowy ? 1 : 0 });
        k.box(ms.x, ms.top + 1.25, ms.z + 7, 2.4, 0.15, 2.4, B.acc, { glow: 1, ry: Math.PI / 4 });
        k.box(ms.x, ms.top / 2, ms.z - ms.hz + 1.5, ms.hx * 2 - 1, ms.top - 1, 3, B.id === 'office' ? 0xe0e0e8 : shade(B.edge, 0.95), { soft: true });
        k.box(ms.x, ms.top + 0.4, ms.z - ms.hz / 2 - 0.5, 1.4, 1.6, 4.5, B.acc, { glow: 1, soft: true });
        k.box(ms.x, 0.4, ms.z - ms.hz - 8, 0.9, 0.8, 16, 0x2a2a30, { soft: true });
        for (const side of [0, 1]) {
            const bx = ms.x + (side ? 1 : -1) * (ms.hx / 2 + 0.25), bz = ms.z - ms.hz / 2 - 0.75;
            btnState.push({ x: bx, z: bz, y: ms.top - 0.3, sx: ms.hx - 0.8, sz: ms.hz - 2.2, t: -9, color: B.id === 'office' ? 0xf4f4f8 : side ? B.cap[0] : mixC(B.cap[0], B.acc, 0.35) });
        }
        // the Buddy Box machine: a big cardboard box on a stand, its tape and bow in the box's colour, a "?" glowing on it
        const bxo = st.box, box = BOXES[st.i];
        k.box(bxo.x, 1, bxo.z, 9, 2, 9, 0x5a5a6a, { soft: true });
        k.box(bxo.x, 2.05, bxo.z, 9.4, 0.12, 9.4, box.color, { glow: 1 });
        k.box(bxo.x, 5.4, bxo.z, 7.4, 6.8, 7.4, 0xd8a868, { soft: true });
        k.box(bxo.x, 8.75, bxo.z, 7.6, 0.4, 7.6, 0xc89858, { soft: true });
        k.box(bxo.x, 5.4, bxo.z, 7.6, 1.2, 7.6, box.color);
        k.box(bxo.x, 5.4, bxo.z, 1.2, 7, 7.6, box.color);
        k.box(bxo.x, 9.4, bxo.z, 3.4, 1.2, 1.2, box.color, { rz: 0.5 }); k.box(bxo.x, 9.4, bxo.z, 3.4, 1.2, 1.2, box.color, { rz: -0.5 });
        for (const sx of [-1, 1]) { k.box(bxo.x + sx * 3.75, 6.3, bxo.z, 0.12, 1.6, 0.5, 0xffffff, { glow: 1 }); k.box(bxo.x + sx * 3.75, 5.6, bxo.z + 0.6, 0.12, 0.5, 1.1, 0xffffff, { glow: 1 }); k.box(bxo.x + sx * 3.75, 4.3, bxo.z, 0.12, 0.5, 0.5, 0xffffff, { glow: 1 }); }
        signs.add([big(box.name, WHITE, 64), big(fmt(box.cost) + ' CLICKS', GOLD, 70, '#3a1a00')], 16, new V3(bxo.x, 14.5, bxo.z), false, 95);
        // the sign over the keyboard: its name and what a press pays; the lock (shown while it's locked)
        const name = signs.add([big('x' + fmt(B.mult), GOLD, 118), { t: B.name, c: '#ffffff', s: '#1a1030', px: 50 }], 20, new V3(st.sign.x, 11, st.sign.z), false, 190);
        const lock = signs.add([big('🔒 ' + fmtComma(B.need) + ' CLICKS', RED, 70)], 20, new V3(st.sign.x, 4.4, st.sign.z), false, 130);
        fenceM4.push(new T.Matrix4().compose(new V3(st.x, 4.5, st.z), qI, new V3(KB_W + 2, 9, KB_D + 2)));
        // contact shadows: the keyboard, the mouse, the monitor's foot, the box machine
        soft.push([st.x - 0.8, st.z - 0.8, KB_W + 7, KB_D + 7, 0.42], [ms.x - 0.6, ms.z + 0.8, ms.hx * 2 + 4, ms.hz * 2 + 3, 0.4], [mo.x, mo.z + 1, 28, 15, 0.38], [bxo.x - 0.5, bxo.z - 0.5, 13, 13, 0.4]);
        return { st, B, set, name, lock, open: null };
    });
    btnState.forEach((b, i) => { btnMesh.setMatrixAt(i, m4.compose(vP.set(b.x, b.y, b.z), qI, vS.set(b.sx, 1.2, b.sz))); btnMesh.setColorAt(i, tc.set(b.color)); });
    btnMesh.castShadow = true; btnMesh.receiveShadow = true;
    group.add(btnMesh);
    // a locked keyboard sits under glass: one instanced box each
    const fence = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0x8ae8ff, transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }), SETUPS.length);
    fenceM4.forEach((mm, i) => fence.setMatrixAt(i, mm));
    fence.renderOrder = 3;
    group.add(fence);
    const placeFence = (i, open) => { if (open) fence.setMatrixAt(i, m4.makeScale(0, 0, 0)); else fence.setMatrixAt(i, fenceM4[i]); fence.instanceMatrix.needsUpdate = true; };
    // ----- the plaza -----
    {
        // the Tech Shop: a counter under a striped awning, gadgets on display
        const x = SHOP.x, z = SHOP.z;
        kPlaza.box(x + 2, 0.2, z, 16, 0.4, 22, 0x5a5a8a, { soft: true });
        kPlaza.box(x - 6, 5, z, 3, 10, 20, 0x3a3a6a);
        kPlaza.box(x + 2, 2, z, 3.6, 4, 16, 0x8a8ad8, { soft: true });
        kPlaza.box(x + 2, 4.2, z, 4.6, 0.5, 17, 0xd8d8ff);
        for (let i = 0; i < 8; i++) kPlaza.box(x - 1, 10.4, z - 10 + i * 2.6 + 1.3, 15, 0.5, 2.6, i % 2 ? 0x3ad8ff : 0xffffff, { rz: -0.14 });
        for (const dz of [-9.5, 9.5]) kPlaza.box(x + 6.5, 5.2, z + dz, 1.2, 10.4, 1.2, 0xd8d8ff, { soft: true });
        kPlaza.box(x + 2, 5.1, z - 5, 2.4, 1.4, 2.4, 0xffd23a, { soft: true }); kPlaza.box(x + 2, 5.0, z, 2.6, 1.2, 3.6, 0x3a3a48, { soft: true }); kPlaza.box(x + 2, 5.3, z + 5, 2, 2, 2, 0xff5ac0, { soft: true });
        signs.add([big('TECH SHOP', AQUA, 118, '#0a2050'), { t: 'upgrades for clicks', c: '#ffffff', s: '#0a2050', px: 40 }], 20, new V3(x, 15.5, z), false, 170);
        // the Click Speed Test: an arcade podium with a giant red button, a screen, a glowing pad to stand on
        const sx = SPEED.x, sz = SPEED.z;
        kPlaza.box(sx + 6, 5, sz - 3, 3, 10, 10, 0x2a2a3a, { soft: true });
        kPlaza.box(sx + 4, 8.5, sz - 3, 1, 5, 8, 0x1a1a2a);
        kPlaza.box(sx + 3.4, 8.5, sz - 3, 0.2, 4.2, 7, 0x3affd8, { glow: 1 });
        cylAt(kPlaza, sx, 0.5, sz - 3, 3.2, 3.6, 1, 0x3a3a48, 20);
        cylAt(kPlaza, sx, 1.6, sz - 3, 2.6, 2.8, 1.4, 0xff2a3a, 20, 1);
        kPlaza.box(SPEED.pad.x, 0.15, SPEED.pad.z, 11, 0.3, 11, 0x2a2a3a, { soft: true });
        kPlaza.box(SPEED.pad.x, 0.34, SPEED.pad.z, 9, 0.1, 9, 0xffe24a, { glow: 2 });
        signs.add([big('SPEED TEST', GOLD, 112, '#3a1a00'), { t: 'how fast can you click?', c: '#ffffff', s: '#3a1a00', px: 38 }], 20, new V3(sx, 17, sz), false, 170);
        // the Reboot terminal: a computer tower with a glowing power button
        const rx = REBOOT.x, rz = REBOOT.z;
        // (its front faces the spawn: -z)
        kPlaza.box(rx, 7, rz, 7, 14, 9, 0x2a2a3a, { soft: true });
        kPlaza.box(rx, 7, rz - 4.55, 6, 13, 0.2, 0x3a3a4a);
        kPlaza.addGeo(colorGeo(new T.CylinderGeometry(1.1, 1.1, 0.3, 16), 0x46ec50), new T.Matrix4().compose(new V3(rx, 11, rz - 4.7), new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0)), new V3(1, 1, 1)), 1);
        for (let i = 0; i < 6; i++) kPlaza.box(rx, 4 + i * 0.8, rz - 4.7, 4, 0.3, 0.2, 0x5a5a6a);
        signs.add([big('REBOOT', PINK, 112, '#3a0a2a'), { t: 'x1 more on every press, for good', c: '#ffffff', s: '#3a0a2a', px: 38 }], 16, new V3(rx, 16.5, rz), false, 150);
    }
    // ----- the leaderboards (behind the spawn, facing it) -----
    const BT = [boardTexture('TOP CLICKERS', 'clicks'), boardTexture('FASTEST FINGERS', 'speed')];
    LEADER.forEach((bd, i) => {
        kPlaza.box(bd.x, 8, bd.z, 26, 16, 2, [0xff8a1a, 0x3a7aff][i], { soft: true });
        for (const sx of [-1, 1]) kPlaza.box(bd.x + sx * 12, 2, bd.z + 1.5, 1.4, 4, 3, 0x3a3a48);
        const pl = new T.Mesh(new T.PlaneGeometry(22.5, 13.6), new T.MeshBasicMaterial({ map: BT[i].t, toneMapped: false }));
        pl.position.set(bd.x, 8.2, bd.z - 1.05); pl.rotation.y = Math.PI;
        group.add(pl);
        drawBoard(BT[i], []);
    });
    // ----- props on the desk -----
    for (const p of PROPS) {
        if (p.kind === 'mug') {
            cylAt(kProps, p.x, p.h / 2, p.z, p.r, p.r * 0.92, p.h, 0xff6a5a, 28);
            cylAt(kProps, p.x, p.h - 0.4, p.z, p.r - 1.2, p.r - 1.2, 0.6, 0x5a3218, 28);
            kProps.addGeo(colorGeo(new T.TorusGeometry(6.5, 1.8, 8, 18, Math.PI), 0xff6a5a), new T.Matrix4().compose(new V3(p.x + p.r, p.h / 2, p.z), new T.Quaternion().setFromEuler(new T.Euler(0, 0, -Math.PI / 2)), new V3(1, 1, 1)));
            kProps.box(p.x, p.h * 0.55, p.z + p.r * 0.92, 10, 7, 0.4, 0xffffff);
            kProps.box(p.x, p.h * 0.55, p.z + p.r * 0.93 + 0.1, 4.6, 4.6, 0.3, 0xff3a6a, { ry: 0 });
        } else if (p.kind === 'pencils') {
            cylAt(kProps, p.x, p.h / 2, p.z, p.r, p.r, p.h, 0x3a7aff, 24);
            for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, rr = 4.5; const c = RAINBOW[i]; kProps.box(p.x + Math.cos(a) * rr, p.h + 10, p.z + Math.sin(a) * rr, 2.2, 26, 2.2, c, { rx: Math.sin(a) * 0.12, rz: -Math.cos(a) * 0.12 }); cylAt(kProps, p.x + Math.cos(a) * (rr + 1.6), p.h + 24, p.z + Math.sin(a) * (rr + 1.6), 0.1, 1.2, 3, 0xf2d8a8, 6); }
        } else if (p.kind === 'lamp') {
            cylAt(kProps, p.x, 1.5, p.z, p.r, p.r + 1, 3, 0x2a2a30, 24);
            kProps.box(p.x + 4, 22, p.z, 1.6, 40, 1.6, 0x3a3a48, { rz: -0.35 });
            kProps.box(p.x + 20, 44, p.z, 1.6, 30, 1.6, 0x3a3a48, { rz: 1.0 });
            kProps.addGeo(colorGeo(new T.ConeGeometry(9, 12, 18, 1, true), 0x2a2a30), new T.Matrix4().compose(new V3(p.x + 34, 46, p.z), new T.Quaternion().setFromEuler(new T.Euler(0, 0, -2.3)), new V3(1, 1, 1)));
            kProps.addGeo(colorGeo(new T.SphereGeometry(4, 12, 8), 0xfff4b8), new T.Matrix4().makeTranslation(p.x + 37, 42.5, p.z), 1);
        } else if (p.kind === 'plant') {
            cylAt(kProps, p.x, p.h / 2, p.z, p.r, p.r * 0.75, p.h, 0xe8784a, 24);
            cylAt(kProps, p.x, p.h - 0.5, p.z, p.r - 1, p.r - 1, 1, 0x5a3a20, 24);
            for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; kProps.box(p.x + Math.cos(a) * 5, p.h + 12, p.z + Math.sin(a) * 5, 3.5, 24, 1.2, i % 2 ? 0x3ab84a : 0x5ad85a, { ry: -a, rz: 0.4 * Math.cos(a), rx: 0.4 * Math.sin(a), glow: 4 }); }
        } else if (p.kind === 'books') {
            const cols = [0xd8384a, 0x3a7aff, 0x46c850];
            [[0, 0, 34, 24, 0], [2, 6, 28, 20, 0.08], [-1, 12, 24, 18, -0.06]].forEach(([dx, y, w, d, r], i) => {
                kProps.box(p.x + dx, y + 3, p.z, w, 6, d, cols[i], { ry: r, soft: true });
                kProps.box(p.x + dx, y + 3, p.z + d / 2, w - 1, 5.4, 0.3, 0xfff4e0, { ry: r });
                kProps.box(p.x + dx, y + 4.4, p.z + d / 2 + 0.1, w - 6, 0.8, 0.2, 0xffd23a, { ry: r });
            });
        }
    }
    // ----- contact shadows: a soft dark patch under everything that stands on the desk (one draw), so it all sits on the wood
    // even far beyond the sun's shadow map -----
    for (const p of PROPS) soft.push([p.x - 1, p.z - 1, p.r * 2.6, p.r * 2.6, 0.45]);
    soft.push([SHOP.x, SHOP.z, 22, 26, 0.35], [SPEED.x + 3, SPEED.z - 3, 16, 16, 0.35], [REBOOT.x, REBOOT.z, 12, 14, 0.4]);
    for (const bd of LEADER) soft.push([bd.x, bd.z + 1, 30, 7, 0.32]);
    {
        const sm = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: softShadowTex(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), soft.length);
        const c = new T.Color();
        soft.forEach(([x, z, w, d, a], i) => { sm.setMatrixAt(i, m4.compose(vP.set(x, 0.035, z), qI, vS.set(w, 1, d))); sm.setColorAt(i, c.setScalar(a / 0.45)); });
        sm.renderOrder = 1; sm.castShadow = false; sm.receiveShadow = false;
        group.add(sm);
    }
    // ----- build it -----
    const propMesh = batchKits([kPlaza, ...kSet, kProps], glowVCMaterial(CU.uNow), true);
    if (propMesh) group.add(propMesh);
    const roomMesh = batchKits([kRoom], glowVCMaterial(CU.uNow), false);
    if (roomMesh) { roomMesh.receiveShadow = false; roomMesh.castShadow = false; group.add(roomMesh); }
    signs.build(group);
    // ----- the Golden Keys and the word's next letter: columns of light over their keys -----
    const colG = new T.CylinderGeometry(2.4, 2.4, 1, 16, 1, true).translate(0, 0.5, 0);
    const colMat = new T.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.42, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const golds = new T.InstancedMesh(colG, colMat, SETUPS.length);
    golds.count = 0; golds.frustumCulled = false; golds.renderOrder = 4;
    group.add(golds);
    const beaconMat = new T.MeshBasicMaterial({ color: 0x46ec50, transparent: true, opacity: 0.38, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    const beacon = new T.Mesh(colG, beaconMat);
    beacon.visible = false; beacon.renderOrder = 4; beacon.frustumCulled = false;
    group.add(beacon);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { if (o !== beacon) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the Tech Shop, the Speed Test, the Reboot terminal, the Buddy Boxes -----
    const PR = [];
    PR.push({ pos: new V3(SHOP.x + 8, 0, SHOP.z), r: SHOP.r, label: () => 'Tech Shop', act: () => opts.shop && opts.shop(), zone: 'world' });
    PR.push({ pos: new V3(SPEED.pad.x, 0, SPEED.pad.z), r: 7, label: () => (opts.speedLabel ? opts.speedLabel() : 'Speed Test'), act: () => opts.speed && opts.speed(), zone: 'world', on: () => !opts.speedBusy || !opts.speedBusy() });
    PR.push({ pos: new V3(REBOOT.x, 0, REBOOT.z - 8), r: REBOOT.r, label: () => 'Reboot', act: () => opts.reboot && opts.reboot(), zone: 'world' });
    for (const st of SETUPS) PR.push({ pos: new V3(st.box.x, 0, st.box.z + 6), r: st.box.r, label: () => BOXES[st.i].name, act: () => opts.box && opts.box(BOXES[st.i].id), zone: 'world' });
    prompts.length = 0; prompts.push(...PR);
    let goldList = [], beaconAt = null;
    const view = {
        group, keySets, setupV, monitors, live,
        setBoards(m) { drawBoard(BT[0], m.clicks); drawBoard(BT[1], m.speed); },
        // which keyboards you've got: the glass comes off, the lock sign goes, the screen wakes (instant: no pop-in)
        setTier(t, instant) {
            for (const v of setupV) {
                const open = v.st.i <= t;
                if (open === v.open) continue;
                const was = v.open;
                v.open = open;
                placeFence(v.st.i, open);
                signs.show(v.lock, !open);
                const mon = monitors[v.st.i];
                mon.locked = !open;
                if (live.at !== v.st.i) { mon.scr.material.map = mon.idle[open ? 0 : 1]; mon.scr.material.needsUpdate = true; }
                // a keyboard you've just got builds itself: its keys pop up in a wave
                if (open && was === false && !instant) { const set = v.set, t0 = keysNow(); for (let i = 0; i < KEYS.length; i++) set.born(i, t0 + (KEYS[i].x + 42) * 0.006 + KEYS[i].row * 0.03); set.flush(); }
            }
        },
        // the Golden Keys lying about ("setup:key;..."): their keys gold, a column of light over each
        setGold(str) {
            const list = String(str || '').split(';').filter(Boolean).map((s) => s.split(':').map(Number)).filter((a) => SETUPS[a[0]] && KEYS[a[1]]);
            for (const [si, k] of goldList) if (!list.some((a) => a[0] === si && a[1] === k)) keySets[si].setColor(k, keySets[si].colors[k]);
            for (const [si, k] of list) keySets[si].setColor(k, 0xffd23a);
            goldList = list;
            golds.count = list.length;
            list.forEach(([si, k], i) => golds.setMatrixAt(i, m4.compose(vP.set(SETUPS[si].x + KEYS[k].x, KB_Y, SETUPS[si].z + KEYS[k].z), qI, vS.set(KEYS[k].w * 0.45 + 0.4, 26, 0.85))));
            golds.instanceMatrix.needsUpdate = true;
        },
        isGold(si, k) { return goldList.some((a) => a[0] === si && a[1] === k); },
        // a key pressed (yours or anyone's): it lights up
        lightKey(si, k, c) { const set = keySets[si]; if (set) set.light(k, c); },
        // the word's next letter (on your screen only): a green column over its key
        setBeacon(si, k) {
            const on = si >= 0 && k >= 0;
            beacon.visible = on;
            if (!on) { beaconAt = null; return; }
            beaconAt = { si, k };
            beacon.position.set(SETUPS[si].x + KEYS[k].x, KB_Y, SETUPS[si].z + KEYS[k].z);
            beacon.scale.set(0.75, 9, 0.75);
        },
        // a MEGA CLICK: that mouse button goes down and springs back
        pressMouse(si, side) { const b = btnState[si * 2 + side]; if (b) b.t = performance.now() / 1000; },
        // the live screen goes to the monitor of the keyboard you're at
        liveAt(si) {
            if (live.at === si) return;
            if (live.at >= 0) { const m = monitors[live.at]; m.scr.material.map = m.idle[m.locked ? 1 : 0]; m.scr.material.needsUpdate = true; }
            live.at = si;
            if (si >= 0) { const m = monitors[si]; m.scr.material.map = live.tex; m.scr.material.needsUpdate = true; }
        },
        // the live screen: the word to type (what's typed in green, the next letter flashing), what you've typed, words done
        drawLive(B, word, wi, stream, words, flash) {
            const x = live.c.getContext('2d');
            screenBg(x, B, 'KeystompOS · Word Hunt');
            x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
            x.font = '700 20px Fredoka, sans-serif'; x.fillStyle = '#d8e8ff'; x.fillText('STOMP THE LETTERS IN ORDER', MW / 2, 52);
            const n = word.length, cw = Math.min(58, (MW - 40) / n), x0 = MW / 2 - n * cw / 2;
            for (let i = 0; i < n; i++) {
                const cx = x0 + i * cw + cw / 2, done = i < wi, next = i === wi;
                x.fillStyle = done ? '#2ad84a' : next ? (flash ? '#ffe24a' : '#ffb01a') : 'rgba(255,255,255,0.14)';
                x.beginPath(); x.roundRect(cx - cw / 2 + 3, 72, cw - 6, 70, 10); x.fill();
                x.font = '400 50px "Luckiest Guy", Fredoka, sans-serif';
                x.lineWidth = 7; x.strokeStyle = '#100a24'; x.strokeText(word[i], cx, 112); x.fillStyle = done || next ? '#ffffff' : '#c8d0e8'; x.fillText(word[i], cx, 112);
            }
            // the terminal line: what's been typed, a blinking cursor
            x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.roundRect(24, 162, MW - 48, 52, 10); x.fill();
            x.textAlign = 'left'; x.font = '700 28px "Courier New", monospace'; x.fillStyle = '#9affa0';
            const s = '> ' + stream.slice(-22).toLowerCase() + (flash ? '_' : ' ');
            x.fillText(s, 38, 189);
            x.textAlign = 'center'; x.font = '700 18px Fredoka, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.75)';
            x.fillText('Words typed: ' + fmtComma(words), MW / 2, 252);
            live.tex.needsUpdate = true;
        },
        // the keys are drawn only near (the case under them is coloured); the mouse buttons spring
        update(dt, t, cam) {
            for (const s of keySets) { s.lod(cam.position, keyFar, keyNear); s.flushLit(); }
            const now = performance.now() / 1000;
            let moved = false;
            btnState.forEach((b, i) => {
                const a = now - b.t;
                if (a > 0.6) { if (b.down) { b.down = false; btnMesh.setMatrixAt(i, m4.compose(vP.set(b.x, b.y, b.z), qI, vS.set(b.sx, 1.2, b.sz))); moved = true; } return; }
                b.down = true;
                const k = a < 0.05 ? a / 0.05 : Math.max(0, Math.exp(-(a - 0.05) * 9) * Math.cos((a - 0.05) * 22));
                btnMesh.setMatrixAt(i, m4.compose(vP.set(b.x, b.y - k * 0.7, b.z), qI, vS.set(b.sx, 1.2, b.sz)));
                moved = true;
            });
            if (moved) btnMesh.instanceMatrix.needsUpdate = true;
            const pulse = 0.34 + Math.sin(t * 5) * 0.1;
            colMat.opacity = pulse + 0.08; beaconMat.opacity = pulse * 0.8;
            if (beaconAt) beacon.scale.y = 8 + Math.sin(t * 4) * 1.2;
            void dt;
        },
        signs,
        dispose() {
            signs.dispose();
            for (const s of keySets) s.dispose();
            scene.remove(group);
        },
    };
    return view;
}
// the mouse buttons: plain lit plastic (instanced, coloured per instance)
let btnMat = null;
function glowlessMat() { if (!btnMat) btnMat = selfLit(new T.MeshLambertMaterial({ color: 0xffffff })); return btnMat; }
