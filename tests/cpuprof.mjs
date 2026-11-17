// A CPU profile of ten seconds stomping a keyboard (the autopilot) on the simulated weak laptop (the dev build: unminified names),
// summed by function (self time), and the frames over 45 ms with what they were doing. node tests/cpuprof.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT, VITE_PORT } from './lib.mjs';

const main = async () => {
    await startServer(TEST_PORT, { QA: '1' });
    await startVite();
    const browser = await launch();
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1366, h: 768, q: 'low', cpu: 4 });
    const cdp = await page.createCDPSession();
    await qa(page, () => window.__qa.noWatch(true));
    await sleep(2000);
    await qa(page, () => { window.__qa.close(); window.__qa.give({ clicks: 5000 }); window.__qa.spikes(); });
    await sleep(1200);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    await qa(page, () => window.__qa.auto(true));
    await sleep(10000);
    const { profile } = await cdp.send('Profiler.stop');
    const spikes = await qa(page, () => window.__qa.spikes());
    const slow = await qa(page, () => window.__qa.slow());
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas, total = dt.reduce((a, b) => a + b, 0) / 1000;
    profile.samples.forEach((id, k) => {
        const n = byId.get(id), f = n.callFrame, key = (f.functionName || '(anon)') + ' ' + (f.url.split('/').pop().split('?')[0] || f.url) + ':' + (f.lineNumber + 1);
        self.set(key, (self.get(key) || 0) + (dt[k] || 0) / 1000);
    });
    const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
    console.log('profile', total.toFixed(0), 'ms; top self time:');
    for (const [k, v] of rows) console.log(' ', v.toFixed(0).padStart(6), 'ms', (v / total * 100).toFixed(1).padStart(5) + '%', k);
    console.log('frames over 45 ms:', JSON.stringify(spikes.slice(0, 12)));
    console.log('slow frames (our work over 25 ms):'); for (const s of slow) console.log('  ', JSON.stringify(s));
    await browser.close();
    stopAll();
    process.exit(0);
};
main().catch((e) => { console.error(e); stopAll(); process.exit(1); });
