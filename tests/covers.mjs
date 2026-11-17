// The two store covers (1920x1080, 800x800), rendered from the game itself at High: you mid-stomp on the RGB Gamer keyboard (the combo
// burning, Desk Buddies hopping behind, a Golden Key glowing, the monitor showing the word), the frame held, the HUD hidden; then the
// title and the tagline over it in the game's own lettering.
// Run: node tests/covers.mjs   (TEST_PORT / VITE_PORT move it)
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, ROOT, TEST_PORT, VITE_PORT } from './lib.mjs';
import { SETUPS, KEYS, keyOfChar, KB_Y } from '../shared/world.js';

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });

const N = '#0e0a30', F = "'Luckiest Guy', 'Arial Black', sans-serif";
let gid = 0;
// one line of words, centred: spans [{ t, c: [top, bottom] }], baseline y, outline width
const words = (spans, size, y, stroke, ls) => {
    const id = 'w' + (gid++);
    const grads = spans.map((s, i) => `<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.c[0]}"/><stop offset="1" stop-color="${s.c[1]}"/></linearGradient>`).join('');
    const line = (fill, extra) => `<text x="50%" y="${y}" text-anchor="middle" font-family="${F}" font-size="${size}" letter-spacing="${ls}" ${extra}>${spans.map((s, i) => `<tspan fill="${fill || `url(#${id}${i})`}">${s.t}</tspan>`).join('')}</text>`;
    const out = `stroke="${N}" stroke-width="${stroke * 2}" stroke-linejoin="round"`;
    return `<defs>${grads}</defs>${line(N, out + ` transform="translate(0 ${Math.round(size * 0.075)})"`)}${line(N, out)}${line('', '')}`;
};
function lettering(w) {
    const sq = w < 1000, T = sq ? 150 : 190, top = sq ? 18 : 24;
    const WHITE = ['#ffffff', '#d8e8ff'], LIME = ['#d8ff8a', '#3ee03a'], BOLT = ['#fff6a0', '#ffc21e'];
    const y1 = top + T * 0.86, H = sq ? y1 + T * 0.95 + 30 : y1 + 40;
    const title = sq ? words([{ t: '⚡KEY', c: WHITE }], T, y1, 12, 3) + words([{ t: 'STOMP!', c: LIME }], T, y1 + T * 0.92, 12, 3) : words([{ t: '⚡', c: BOLT }, { t: 'KEY', c: WHITE }, { t: 'STOMP!', c: LIME }], T, y1, 13, 4);
    const tag = sq ? 48 : 62;
    return `<div id="cover" style="position:fixed;inset:0;z-index:99;pointer-events:none;overflow:hidden">`
        + `<svg style="position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(0 10px 18px rgba(0,0,40,.45))" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${title}</svg>`
        + `<div style="position:absolute;left:50%;bottom:${sq ? 26 : 38}px;transform:translateX(-50%) rotate(-1.5deg);white-space:nowrap;font-family:${F};font-size:${tag}px;line-height:1;padding:${tag * 0.26}px ${tag * 0.6}px ${tag * 0.14}px;border-radius:${tag * 0.4}px;background:linear-gradient(#a8ff7a,#22c73a);color:#fff;border:${sq ? 5 : 6}px solid ${N};box-shadow:0 ${sq ? 6 : 8}px 0 ${N};text-shadow:0 4px 0 ${N},-3px -3px 0 ${N},3px -3px 0 ${N},-3px 3px 0 ${N},3px 3px 0 ${N}">STOMP THE GIANT KEYS!</div>`
        + '</div>';
}

const SHOTS = [{ w: 1920, h: 1080, name: 'cover-1920x1080.png', look: [0.55, 0.42, 30] }, { w: 800, h: 800, name: 'cover-800x800.png', look: [0.5, 0.48, 34] }];
const st = SETUPS[4], kG = keyOfChar('G'), kN = keyOfChar('H');
try {
    for (const s of SHOTS) {
        const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: s.w, h: s.h, dpr: 1, q: 'high', uid: 'cover' + s.w + Date.now() });
        await qa(page, (o) => {
            const q = window.__qa; q.noWatch(true);
            q.give({ tier: 4, clicks: 1e7, word: 'GAMER', team: ['cab', 'coin', 'robo', 'cube', 'ghost', 'joy'] });
            q.give({ gold: { si: 4, k: o.kG } });
        }, { kG });
        await sleep(1200);
        await qa(page, () => { const q = window.__qa; q.close(); q.hud(false); for (const sel of ['#toasts', '#bigText', '#popup', '#fps', '#tips', '#flyLayer', '#promptBtn']) { const e = document.querySelector(sel); if (e) e.style.display = 'none'; } });
        // onto the RGB Gamer keyboard, a combo going (the autopilot stomping), then a jump
        await qa(page, (o) => window.__qa.teleport(o.x, o.y, o.z, Math.PI), { x: st.x + KEYS[kN].x + 4, y: KB_Y, z: st.z + KEYS[kN].z + 3 });
        await sleep(600);
        await qa(page, () => window.__qa.auto(true));
        await sleep(5200);
        await qa(page, (o) => { const q = window.__qa; q.auto(false); q.teleport(o.x, o.y, o.z, Math.PI * 1.15); q.look(o.look[0], o.look[1], o.look[2]); }, { x: st.x + KEYS[kN].x + 2, y: KB_Y, z: st.z + KEYS[kN].z + 2, look: s.look });
        await sleep(700);
        // a few presses in a row (the combo's fire), then a jump: the frame is held at the top of it
        await qa(page, () => { const q = window.__qa; for (let i = 0; i < 6; i++) setTimeout(() => q.click(), i * 90); });
        await sleep(700);
        await qa(page, () => window.__qa.jump());
        await sleep(330);
        await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
        await sleep(150);
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d.firstChild); }, lettering(s.w));
        await page.evaluate(() => document.fonts.ready);
        await sleep(300);
        await page.screenshot({ path: path.join(dir, s.name), type: 'png' });
        console.log('wrote', s.name, page.errors);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
