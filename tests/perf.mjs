// Frame rates where it matters: at the spawn (the whole desk in view) and stomping a keyboard on the autopilot, with the bots about,
// on a desktop (Medium), a simulated weak laptop (Low, 1366x768, CPU throttled 4x) and a phone in portrait (Low). LOW_GPU=1 runs
// Chrome on the integrated chip. ONLY=desktop,laptop picks profiles. node tests/perf.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT, VITE_PORT } from './lib.mjs';

const PROFILES = [
    { name: 'desktop Medium', o: { w: 1600, h: 900, q: 'medium' } },
    { name: 'weak laptop Low, 4x CPU', o: { w: 1366, h: 768, q: 'low', cpu: 4 } },
    { name: 'phone portrait Low', o: { w: 390, h: 844, dpr: 2, touch: true, q: 'low' } },
];
const main = async () => {
    await startServer(TEST_PORT, { QA: '1' });
    await startVite();
    const browser = await launch();
    // ONLY=desktop,phone: just those profiles
    for (const P of PROFILES.filter((p) => !process.env.ONLY || process.env.ONLY.split(',').some((s) => p.name.includes(s)))) {
        const page = await open(browser, `http://localhost:${VITE_PORT}/`, P.o);
        await qa(page, (phone) => { window.__qa.noWatch(true); if (!phone) window.__qa.noPace(); }, /phone/.test(P.name));
        await sleep(2500);
        const spawn = await measure(page, 5);
        await qa(page, () => { window.__qa.close(); window.__qa.give({ clicks: 5000 }); window.__qa.auto(true); });
        await sleep(6000);
        const stomp = await measure(page, 8);
        const sec = await qa(page, () => window.__qa.sections());
        const st = await qa(page, () => window.__qa.state());
        console.log(`${P.name.padEnd(26)} load ${page.loadSecs.toFixed(1)} s | spawn ${spawn.fps} fps (p95 ${spawn.p95} ms, calls ${spawn.calls}, tris ${spawn.tris}) | stomping ${stomp.fps} fps (p95 ${stomp.p95} ms, >50ms ${stomp.over50}, work ${stomp.avgMs} ms, calls ${stomp.calls}, tris ${stomp.tris}) | ${JSON.stringify(sec)} | presses ${st.presses}`);
        console.log('   errors', JSON.stringify(page.errors));
        await page.browserContext().close();
    }
    await browser.close();
    stopAll();
    process.exit(0);
};
main().catch((e) => { console.error(e); stopAll(); process.exit(1); });
