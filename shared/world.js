// The Mega Desk: where everything stands. Both sides build from these numbers: the client draws it and moves you on it, the server
// checks where you say you are, which key you pressed and whether you're on a giant mouse's button.
// North is -z. You land on the mousepad at the south end; an aisle runs north between two rows of computer setups (a keyboard, its
// monitor behind it, a giant mouse on the outer side, a Buddy Box in front), each keyboard fancier than the last; the Galaxy setup
// closes the aisle at the far end.
import { BOARDS, BOXES } from './config.js';

export const P = 5.4;              // a key's pitch (one unit)
export const KB_Y = 1.0;           // a keyboard's case top: you stand on its keys here (a small step up from the desk)
export const DESK = { x0: -148, x1: 148, z0: -384, z1: 138 };
export const SPAWN = { x: 0, z: 98 };

// ----- a keyboard's keys: a 60% layout, 15 units by 5 rows. x, z from its middle (studs), w wide (units), t its legend, ch what it types -----
const ROWS = [
    [['Esc', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['BACK', 2]],
    [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
    [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['ENTER', 2.25]],
    [['SHIFT', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['SHIFT', 2.75]],
    [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]],
];
export const COLS = 15, NROWS = 5;
export const KB_W = COLS * P + 3.4, KB_D = NROWS * P + 3.4;
const ROW_SPANS = [];
export const KEYS = (() => {
    const keys = [];
    ROWS.forEach((row, r) => {
        let u = 0;
        const spans = [];
        for (const [t, w] of row) {
            const ch = /^[A-Z0-9]$/.test(t) ? t : t === '' ? ' ' : '';
            spans.push([u, u + w, keys.length]);
            keys.push({ x: (u + w / 2 - COLS / 2) * P, z: (r - (NROWS - 1) / 2) * P, w, t, ch, row: r });
            u += w;
        }
        ROW_SPANS.push(spans);
    });
    return keys;
})();
// the key whose letter is ch (the monitor's word glows its next letter)
export const keyOfChar = (ch) => KEYS.findIndex((k) => k.ch === ch);
export const SPACE_KEY = KEYS.findIndex((k) => k.ch === ' ');

// ----- the setups: one per keyboard -----
export const SETUPS = BOARDS.map((B, i) => {
    const last = i === BOARDS.length - 1, side = last ? 0 : i % 2 === 0 ? 1 : -1;
    const x = side * 66, z = 18 - Math.floor(i / 2) * 86;
    // the giant mouse lies on the outer side, its buttons toward the monitor (north); the Galaxy's to the east
    const mx = last ? 62 : x + side * 60;
    // the Buddy Box machine stands in front of the keyboard, on its outer half
    const bx = last ? -30 : x + side * 24;
    return {
        i, b: B, x, z, side,
        mon: { x, z: z - 38, w: 56, h: 32, y0: 6 },
        mouse: { x: mx, z: z + 3, hx: 9, hz: 14, top: 4 },
        box: { x: bx, z: z + KB_D / 2 + 10, r: 9, id: BOXES[i].id },
        sign: { x, z: z + KB_D / 2 + 3 },
    };
});
// the setup whose keyboard is under (x, z), or -1
export function boardAt(x, z) {
    for (const s of SETUPS) if (Math.abs(x - s.x) <= KB_W / 2 && Math.abs(z - s.z) <= KB_D / 2) return s.i;
    return -1;
}
// the key under (x, z) on setup si's keyboard, or -1
export function keyAt(si, x, z) {
    const s = SETUPS[si];
    if (!s) return -1;
    const dx = x - s.x, dz = z - s.z;
    if (Math.abs(dx) > COLS * P / 2 || Math.abs(dz) > NROWS * P / 2) return -1;
    const row = Math.floor((dz + NROWS * P / 2) / P);
    if (row < 0 || row >= NROWS) return -1;
    const u = dx / P + COLS / 2;
    for (const [a, b, k] of ROW_SPANS[row]) if (u >= a && u < b) return k;
    return -1;
}
// where key k of setup si is
export const keyPos = (si, k) => ({ x: SETUPS[si].x + KEYS[k].x, z: SETUPS[si].z + KEYS[k].z });
// a giant mouse's button under (x, z): 0 left, 1 right, -1 none (the buttons are its north half)
export function mouseButton(si, x, z) {
    const m = SETUPS[si] && SETUPS[si].mouse;
    if (!m) return -1;
    const dx = x - m.x, dz = z - m.z;
    if (Math.abs(dx) > m.hx || dz < -m.hz || dz > -1.5) return -1;
    if (Math.abs(dx) < 0.5) return -1;
    return dx < 0 ? 0 : 1;
}
// the setup whose mouse is under (x, z), or -1
export function mouseAt(x, z) {
    for (const s of SETUPS) { const m = s.mouse; if (Math.abs(x - m.x) <= m.hx && Math.abs(z - m.z) <= m.hz) return s.i; }
    return -1;
}

// ----- the plaza round the spawn -----
export const SHOP = { x: -58, z: 84, r: 13 };
export const SPEED = { x: 58, z: 84, r: 7, pad: { x: 58, z: 90 } };
export const REBOOT = { x: 0, z: 128, r: 10 };
export const LEADER = [{ x: -44, z: 130, id: 'clicks' }, { x: 44, z: 130, id: 'speed' }];
// standing on the Click Speed Test's pad
export const onSpeedPad = (x, z) => Math.abs(x - SPEED.pad.x) < 5.5 && Math.abs(z - SPEED.pad.z) < 5.5;
// the props on the desk you bump into (the client draws them): a coffee mug, a pencil cup, a lamp, a plant, a pile of books
export const PROPS = [
    { kind: 'mug', x: 118, z: 106, r: 13, h: 26 },
    { kind: 'pencils', x: -120, z: 108, r: 10, h: 30 },
    { kind: 'lamp', x: -126, z: -112, r: 11, h: 3 },
    { kind: 'plant', x: 128, z: -296, r: 13, h: 22 },
    { kind: 'books', x: -124, z: -300, r: 16, h: 18 },
];

// ----- the solids you can't walk through (and the tops you can stand on) -----
const box = (x, y, z, sx, sy, sz, o) => ({ min: [x - sx / 2, y, z - sz / 2], max: [x + sx / 2, y + sy, z + sz / 2], ...(o || {}) });
export function deskSolids() {
    const out = [];
    for (const s of SETUPS) {
        // the keyboard's case: a step up, its keys on top
        out.push(box(s.x, 0, s.z, KB_W, KB_Y, KB_D));
        // the monitor's stand: a flat base (a step) and its neck; the screen itself is high enough to walk under
        out.push(box(s.mon.x, 0, s.mon.z + 1, 26, 0.9, 12));
        out.push(box(s.mon.x, 0, s.mon.z, 6, s.mon.y0 + 2, 4, { noStep: true }));
        // the giant mouse: you can jump up on it (its buttons are its north half)
        out.push(box(s.mouse.x, 0, s.mouse.z, s.mouse.hx * 2, s.mouse.top, s.mouse.hz * 2, { noStep: true }));
        // the Buddy Box machine
        out.push(box(s.box.x, 0, s.box.z, 8, 9, 8, { noStep: true }));
    }
    out.push(box(SHOP.x - 6, 0, SHOP.z, 3, 10, 20, { noStep: true }));
    out.push(box(SPEED.x + 6, 0, SPEED.z - 3, 3, 12, 10, { noStep: true }));
    out.push(box(REBOOT.x, 0, REBOOT.z, 7, 14, 9, { noStep: true }));
    for (const b of LEADER) out.push(box(b.x, 0, b.z, 26, 16, 2, { noStep: true }));
    for (const p of PROPS) {
        if (p.kind === 'books') { out.push(box(p.x, 0, p.z, 34, 6, 24)); out.push(box(p.x + 2, 6, p.z - 1, 28, 6, 20)); out.push(box(p.x - 1, 12, p.z + 1, 24, 6, 18)); }
        else if (p.kind === 'lamp') out.push(box(p.x, 0, p.z, p.r * 1.6, p.h, p.r * 1.6));
        else out.push(box(p.x, 0, p.z, p.r * 1.7, p.h, p.r * 1.7, { noStep: true }));
    }
    return out;
}
// the desk's edge: you can't walk off it
export function clampDesk(b) {
    if (b.x < DESK.x0 + 1) { b.x = DESK.x0 + 1; if (b.vx < 0) b.vx = 0; } else if (b.x > DESK.x1 - 1) { b.x = DESK.x1 - 1; if (b.vx > 0) b.vx = 0; }
    if (b.z < DESK.z0 + 1) { b.z = DESK.z0 + 1; if (b.vz < 0) b.vz = 0; } else if (b.z > DESK.z1 - 1) { b.z = DESK.z1 - 1; if (b.vz > 0) b.vz = 0; }
}
// a locked keyboard has a glass fence round it (on your screen): you can't walk onto it yet
export function fenceOf(si) {
    const s = SETUPS[si], w = KB_W + 2, d = KB_D + 2, h = 9, t = 0.8;
    return [box(s.x, 0, s.z - d / 2, w, h, t, { noStep: true }), box(s.x, 0, s.z + d / 2, w, h, t, { noStep: true }), box(s.x - w / 2, 0, s.z, t, h, d, { noStep: true }), box(s.x + w / 2, 0, s.z, t, h, d, { noStep: true })];
}
// the physics world: the desk's floor, its solids, its edge
export function deskWorld() {
    return { solids: deskSolids(), floor: 0, clamp: clampDesk };
}
