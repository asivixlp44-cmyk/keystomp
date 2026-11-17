// The shader programs the game compiles (each one costs time while loading), listed by name. node tests/programs.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT, VITE_PORT } from './lib.mjs';
const main = async () => {
    await startServer(TEST_PORT, { QA: '1' });
    await startVite();
    const browser = await launch();
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1280, h: 720, q: 'medium' });
    await sleep(1000);
    const list = await page.evaluate(() => window.__qa.renderer().info.programs.map((p) => p.name + ' · ' + (p.cacheKey || '').split(',').slice(0, 3).join(',').slice(0, 80)));
    console.log(list.length, 'programs:'); for (const l of list) console.log('  ', l);
    await browser.close(); stopAll(); process.exit(0);
};
main().catch((e) => { console.error(e); stopAll(); process.exit(1); });
