// Every keyboard from above (its layout, legends, plate and bezel), and the desk from the spawn (the far keyboards): for checking the
// layout by eye. node tests/boards.mjs [low|medium|high]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, TEST_PORT, VITE_PORT, OUT } from './lib.mjs';
import { SETUPS } from '../shared/world.js';

const q = process.argv[2] || 'medium';
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1600, h: 900, q });
    await qa(page, () => { const a = window.__qa; a.noWatch(true); a.close(); a.give({ tier: 8, tut: 9 }); a.hud(false); });
    await sleep(2500);
    for (const st of SETUPS) {
        // stand just in front of the keyboard (off it, so no key is pressed), look down at it from the front
        await qa(page, (p) => { window.__qa.teleport(p[0], 0, p[1], 0); window.__qa.look(0, 1.25, 62); }, [st.x, st.z + 26]);
        await sleep(1100);
        await shot(page, `board-${q}-${st.i}-${st.b.id}`);
    }
    await qa(page, () => { window.__qa.teleport(0, 0, 98, 0); window.__qa.look(0, 0.32, 26); });
    await sleep(1200);
    await shot(page, `board-${q}-spawn-view`);
    console.log('errors', JSON.stringify(page.errors));
    console.log('shots in', OUT);
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
