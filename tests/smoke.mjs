// A quick look at the whole loop in a browser: the desk from the spawn, a walk onto the first keyboard, the autopilot stomping keys
// and typing the word, a new keyboard, a Golden Key, a Mega Click, the Speed Test, the panels, with screenshots and console errors.
// node tests/smoke.mjs [portrait]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, TEST_PORT, VITE_PORT, OUT } from './lib.mjs';

const portrait = process.argv.includes('portrait');
const main = async () => {
    await startServer(TEST_PORT, { QA: '1' });
    await startVite();
    const browser = await launch();
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, portrait ? { w: 390, h: 844, dpr: 2, touch: true } : { w: 1280, h: 720 });
    console.log('loaded in', page.loadSecs.toFixed(1), 's');
    const tag = portrait ? 'p-' : '';
    await sleep(1500);
    console.log('state', JSON.stringify(await qa(page, () => window.__qa.state())));
    await shot(page, tag + '01-spawn');
    await qa(page, () => window.__qa.look(Math.PI, 0.3, 26));
    await sleep(600);
    await shot(page, tag + '02-spawn-back');
    await qa(page, () => window.__qa.look(0, 0.36, 19));
    // the autopilot: stomp keys, type the word
    await qa(page, () => window.__qa.auto(true));
    for (let k = 0; k < 6; k++) {
        await sleep(2500);
        const st = await qa(page, () => window.__qa.state());
        console.log('auto', JSON.stringify({ x: st.x, z: st.z, clicks: Math.round(st.clicks), presses: st.presses, combo: st.combo, word: st.word, wi: st.wi, words: st.words }));
        if (k === 1) await shot(page, tag + '03-keyboard');
        if (k === 4) await shot(page, tag + '04-typing');
    }
    // a full bar: the next keyboard
    await qa(page, () => window.__qa.give({ boot: 2000 }));
    await sleep(1800);
    await shot(page, tag + '05-new-keyboard');
    console.log('tier', (await qa(page, () => window.__qa.state())).tier);
    await qa(page, () => window.__qa.auto(false));
    // a Golden Key under you
    await qa(page, () => { const q = window.__qa; q.give({ gold: { si: 0, k: 30 } }); });
    await sleep(500);
    await shot(page, tag + '06-golden-key');
    // KEY FRENZY
    await qa(page, () => { window.__qa.give({ frenzy: 1 }); window.__qa.auto(true); });
    await sleep(2600);
    await shot(page, tag + '06b-frenzy');
    await qa(page, () => window.__qa.auto(false));
    // the giant mouse: jump onto its button
    await qa(page, () => { const st = window.__qa.view().monitors && null; void st; window.__qa.teleport(66 + 60 - 4, 4, 18 + 3 - 6, Math.PI); });
    await sleep(400);
    await qa(page, () => window.__qa.jump());
    await sleep(1500);
    console.log('megas', (await qa(page, () => window.__qa.state())).megas);
    await shot(page, tag + '07-mouse');
    // the Speed Test
    await qa(page, () => window.__qa.teleport(58, 0, 90, Math.PI));
    await sleep(500);
    await qa(page, () => window.__qa.speed());
    await sleep(3300);
    for (let i = 0; i < 60; i++) { await qa(page, () => window.__qa.tap()); await sleep(80); }
    await shot(page, tag + '08-speed');
    await sleep(6000);
    await shot(page, tag + '09-speed-result');
    await qa(page, () => window.__qa.close());
    // the panels
    for (const p of ['buddies', 'tech', 'keys', 'quests', 'spin', 'reboot', 'shop', 'daily', 'ranks', 'settings']) {
        await qa(page, (k) => window.__qa.panel(k), p);
        await sleep(450);
        await shot(page, tag + '10-panel-' + p);
        await qa(page, () => window.__qa.close());
    }
    await qa(page, () => window.__qa.give({ clicks: 5000 }));
    await qa(page, () => window.__qa.teleport(90, 0, 50, Math.PI));
    await sleep(500);
    await qa(page, () => window.__qa.hatch('b1', 3));
    await sleep(1600);
    await shot(page, tag + '11-hatch');
    await qa(page, () => window.__qa.close());
    await sleep(1000);
    await qa(page, () => window.__qa.look(Math.PI * 0.85, 0.25, 16));
    await sleep(800);
    await shot(page, tag + '12-buddies');
    console.log('perf', JSON.stringify(await qa(page, () => window.__qa.perf())));
    console.log('diag', JSON.stringify(await qa(page, () => window.__qa.diag())));
    console.log('errors', JSON.stringify(page.errors.concat(await qa(page, () => window.__qa.errors()))));
    console.log('shots in', OUT);
    await browser.close();
    stopAll();
    process.exit(0);
};
main().catch((e) => { console.error(e); stopAll(); process.exit(1); });
