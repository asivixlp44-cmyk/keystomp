// The keyboard layout, checked: every row is 15 keys wide (a 60% ANSI board), every key's middle maps back to that key on the server's
// grid, neighbours never overlap and every key sits inside the case, every letter and digit a word can ask for has a key, the space bar
// is the space. node tests/layout.mjs
import { KEYS, COLS, NROWS, P, KB_W, KB_D, SETUPS, keyAt, keyOfChar, SPACE_KEY } from '../shared/world.js';
import { wordFor } from '../shared/config.js';

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL', m); };
const EXPECT = [
    'Esc 1 2 3 4 5 6 7 8 9 0 - = BACK', 'Tab Q W E R T Y U I O P [ ] \\',"Caps A S D F G H J K L ; ' ENTER", 'SHIFT Z X C V B N M , . / SHIFT',
    'Ctrl Win Alt _ Alt Fn Menu Ctrl',
];
for (let r = 0; r < NROWS; r++) {
    const row = KEYS.filter((k) => k.row === r);
    const width = row.reduce((s, k) => s + k.w, 0);
    if (Math.abs(width - COLS) > 1e-9) fail(`row ${r} is ${width} units wide, not ${COLS}`);
    const legends = row.map((k) => k.t || '_').join(' ');
    if (legends !== EXPECT[r]) fail(`row ${r}: "${legends}" (want "${EXPECT[r]}")`);
    for (let i = 1; i < row.length; i++) { const a = row[i - 1], b = row[i]; const gap = (b.x - b.w * P / 2) - (a.x + a.w * P / 2); if (gap < -1e-9) fail(`row ${r}: ${a.t} and ${b.t} overlap by ${-gap}`); }
}
for (const st of SETUPS) {
    KEYS.forEach((k, i) => {
        const got = keyAt(st.i, st.x + k.x, st.z + k.z);
        if (got !== i) fail(`board ${st.i}: the middle of ${k.t || 'space'} (#${i}) maps to #${got}`);
        // its edges (just inside) map to it too
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const g = keyAt(st.i, st.x + k.x + dx * (k.w * P / 2 - 0.2), st.z + k.z + dz * (P / 2 - 0.2)); if (g !== i) fail(`board ${st.i}: just inside ${k.t || 'space'}'s edge maps to #${g}`); }
        if (Math.abs(k.x) + k.w * P / 2 > KB_W / 2 - 1.6 + 0.2 || Math.abs(k.z) + P / 2 > KB_D / 2 - 1.6 + 0.2) fail(`${k.t} pokes into the bezel`);
    });
}
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') if (keyOfChar(ch) < 0) fail(`no key types ${ch}`);
if (KEYS[SPACE_KEY].ch !== ' ' || KEYS[SPACE_KEY].w !== 6.25) fail('the space bar is wrong');
// every word on every keyboard can be typed
let words = 0;
for (let t = 0; t < SETUPS.length; t++) for (let n = 0; n < 400; n++) { const w = wordFor(t, n); words++; for (const ch of w) if (keyOfChar(ch) < 0) { fail(`"${w}" on board ${t} needs ${ch}`); break; } }
console.log(bad ? `${bad} problems` : `layout ok: ${KEYS.length} keys in ${NROWS} rows of ${COLS} units, ${SETUPS.length} boards, ${words} words typeable`);
process.exit(bad ? 1 : 0);
