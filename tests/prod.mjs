// The production build, real input only (no QA hooks in it): the game server serves client/dist; walk from the spawn onto the first
// keyboard with the keys (the Clicks counter must climb as you stomp across it), click to press, jump, open and close a panel with the
// keyboard, check the console. Build first: npm run build. node tests/prod.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopAll, launch, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';

const main = async () => {
    if (!fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) throw new Error('build the client first (npm run build)');
    await startServer(TEST_PORT, {});
    const browser = await launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|net::|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
    await page.setViewport({ width: 1280, height: 720 });
    const t0 = Date.now();
    await page.goto(`http://localhost:${TEST_PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#start').hidden, { timeout: 120000, polling: 200 });
    console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's; QA hooks present:', await page.evaluate(() => !!window.__qa));
    await sleep(1500);
    const clicks = () => page.evaluate(() => +(document.querySelector('#clickVal').textContent || '0').replace(/,/g, ''));
    const c0 = await clicks();
    await page.click('#view');
    // north-east from the spawn onto the Office Classic keyboard, then across it
    await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
    await sleep(4300);
    await page.keyboard.up('KeyW');
    await sleep(1800);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyA');
    await sleep(1500);
    await page.keyboard.up('KeyA');
    await sleep(500);
    const c1 = await clicks();
    console.log('Clicks walking across the keyboard', c0, '->', c1, c1 > c0 + 5 ? 'OK (the keys press)' : 'FAIL');
    // a click presses the key under you; a jump stomps
    for (let i = 0; i < 10; i++) { await page.mouse.click(640, 400); await sleep(90); }
    await page.keyboard.press('Space');
    await sleep(1400);
    const c2 = await clicks();
    console.log('Clicks after clicking and a stomp', c1, '->', c2, c2 > c1 ? 'OK' : 'FAIL');
    const hud = await page.evaluate(() => ({ bar: document.querySelector('#kbNum').textContent, quest: document.querySelector('#questLine').textContent, word: document.querySelector('#wordLetters').textContent }));
    console.log('hud', JSON.stringify(hud));
    await shot(page, 'prod-keyboard');
    // open and close a panel with the keyboard (U: the Tech Shop)
    await page.keyboard.press('KeyU');
    await sleep(500);
    const open = await page.evaluate(() => !document.querySelector('#modal').hidden);
    await page.keyboard.press('Escape');
    await sleep(300);
    console.log('Tech Shop opens with U:', open ? 'OK' : 'FAIL', '· closes with Esc:', await page.evaluate(() => document.querySelector('#modal').hidden) ? 'OK' : 'FAIL');
    console.log('errors', JSON.stringify(errors));
    await browser.close();
    stopAll();
    process.exit(errors.length || !(c1 > c0 + 5) || !(c2 > c1) || !open ? 1 : 0);
};
main().catch((e) => { console.error(e); stopAll(); process.exit(1); });
