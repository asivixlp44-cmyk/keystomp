// What makes stomping slow on a desktop (Medium): the autopilot stomping, the frame rate with each thing switched off in turn (the HUD,
// the keys lighting up, the floating numbers, the big words), and the long frames' own work. node tests/stompcost.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT, VITE_PORT } from './lib.mjs';

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1600, h: 900, q: process.env.Q || 'medium' });
    await qa(page, () => { const q = window.__qa; q.noWatch(true); q.noPace(); q.close(); q.give({ clicks: 5000, tut: 9 }); q.auto(true); });
    await sleep(6000);
    const run = async (name, on, off) => {
        await page.evaluate(on);
        await sleep(800);
        await qa(page, () => window.__qa.spikes());
        const m = await measure(page, 4);
        const sp = await qa(page, () => window.__qa.spikes());
        await page.evaluate(off);
        const work = sp.map((s) => s.work).sort((a, b) => b - a).slice(0, 5);
        console.log(name.padEnd(22), m.fps, 'fps · p95', m.p95, 'ms · >50ms', m.over50, '· long frames\' own work (ms):', JSON.stringify(work));
    };
    await run('everything', () => {}, () => {});
    await run('no HUD', () => window.__qa.hud(false), () => window.__qa.hud(true));
    await run('no key lighting', () => { const v = window.__qa.view(); window.__lk = v.lightKey; v.lightKey = () => {}; }, () => { window.__qa.view().lightKey = window.__lk; });
    await run('no floating numbers', () => { window.__noFloat = true; }, () => { window.__noFloat = false; });
    await run('no autopilot (still)', () => window.__qa.auto(false), () => window.__qa.auto(true));
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
