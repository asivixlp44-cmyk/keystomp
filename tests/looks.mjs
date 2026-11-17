// Close-ups for judging the look: the keys from a player's height and from above, a later keyboard, the desk top round a setup, the
// spawn, the room floor past the desk's edge; on Medium and on Low. node tests/looks.mjs [tag] [medium|low]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, TEST_PORT, VITE_PORT, OUT } from './lib.mjs';

const tag = process.argv[2] || 'now', only = process.argv[3];
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    for (const q of only ? [only] : ['medium', 'low']) {
        const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1280, h: 720, q });
        await qa(page, () => { const a = window.__qa; a.noWatch(true); a.close(); a.give({ tier: 4, tut: 9 }); a.hud(false); });
        await sleep(2500);
        const at = async (name, x, z, yaw, pitch, dist) => {
            await qa(page, (p) => { window.__qa.teleport(p[0], 1, p[1], p[2]); window.__qa.look(p[2], p[3], p[4]); }, [x, z, yaw, pitch, dist]);
            await sleep(900);
            await shot(page, `look-${tag}-${q}-${name}`);
        };
        await at('keys-low', 66 - 10, 18 + 4, Math.PI * 0.12, 0.12, 12);
        await at('keys-top', 66, 18, 0.25, 0.9, 30);
        await at('keys-rgb', 66, -154, Math.PI * 0.15, 0.22, 16);
        await at('keys-type', -66, -68, -Math.PI * 0.12, 0.2, 15);
        await at('keys-mech', 66, -68, Math.PI * 0.1, 0.5, 22);
        await at('desk-setup', 66, 18 + 40, Math.PI * 0.8, 0.3, 46);
        await at('spawn', 0, 98, 0, 0.32, 26);
        await at('desk-edge', 140, 60, -Math.PI / 2, 0.45, 30);
        console.log(q, 'errors', JSON.stringify(page.errors));
        await page.browserContext().close();
    }
    console.log('shots in', OUT);
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
