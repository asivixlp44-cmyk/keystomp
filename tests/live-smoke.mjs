// Live check: opens the hosted game (prod), waits for it to join, reports errors and takes a screenshot.
// Run: node tests/live-smoke.mjs [url] [portrait]   (portrait: a 390x844 touch phone)
import { launch, shot, sleep } from './lib.mjs';
const url = process.argv[2] || 'https://keystomp.play.bloxity.io/';
const phone = process.argv[3] === 'portrait';
const b = await launch();
const page = await b.newPage();
await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url().slice(0, 160)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
let state = null;
for (let i = 0; i < 40; i++) {
    await sleep(1000);
    // the game may sit in the page itself or in a frame inside the Bloxity page
    for (const f of page.frames()) {
        state = await f.evaluate(() => {
            const c = document.querySelector('canvas'), hud = document.querySelector('#hud'), start = document.querySelector('#start');
            return c ? { frame: location.href.slice(0, 80), canvas: c.width + 'x' + c.height, joined: !!hud && !hud.hidden, loading: !!start && !start.hidden, clicks: (document.querySelector('#clickVal') || {}).textContent || null } : null;
        }).catch(() => null);
        if (state) break;
    }
    if (state && state.joined && !state.loading && i > 8) break;
}
console.log('state', JSON.stringify(state));
console.log('frames', page.frames().map((f) => f.url().slice(0, 80)).join(' | '));
console.log('shot', await shot(page, phone ? 'live-prod-phone' : 'live-prod'));
console.log('errors', JSON.stringify(errors));
await b.close();
process.exit(state && state.joined && !state.loading && !errors.length ? 0 : 1);
