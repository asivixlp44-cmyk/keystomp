// What the frame's time goes on, at the spawn on a desktop (Medium): the frame rate with each part of the scene switched off in turn
// (the contact shadows, the batched desk props, the room, the keys, the sun's shadows, the HUD). node tests/gpucost.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, TEST_PORT, VITE_PORT } from './lib.mjs';

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, `http://localhost:${VITE_PORT}/`, { w: 1600, h: 900, q: process.env.Q || 'medium' });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.noPace(); window.__qa.close(); });
    await sleep(2500);
    const run = async (name, on, off) => {
        await page.evaluate(on);
        await sleep(600);
        const m = await measure(page, 3);
        await page.evaluate(off);
        console.log(name.padEnd(26), m.fps, 'fps · p95', m.p95, 'ms · calls', m.calls, '· tris', m.tris);
    };
    const find = `(() => { const q = window.__qa, v = q.view(), out = { soft: null, props: [], room: null, keys: v.keySets.map((s) => s.mesh) }; v.group.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.map && o.material.transparent && o.count > 30 && o.material.polygonOffset) out.soft = o; if (o.isBatchedMesh || (o.isMesh && o.geometry && o.geometry.attributes.aGlow && !o.isInstancedMesh)) out.props.push(o); }); return out; })()`;
    await run('everything', () => {}, () => {});
    await run('no contact shadows', new Function(`const f = ${find}; if (f.soft) f.soft.visible = false;`), new Function(`const f = ${find}; if (f.soft) f.soft.visible = true;`));
    await run('no batched props/room', new Function(`const f = ${find}; for (const p of f.props) p.visible = false;`), new Function(`const f = ${find}; for (const p of f.props) p.visible = true;`));
    await run('no keys', new Function(`const f = ${find}; for (const k of f.keys) k.visible = false;`), new Function(`const f = ${find}; for (const k of f.keys) k.visible = true;`));
    await run('no sun shadows', () => { const r = window.__qa.renderer(); r.shadowMap.enabled = false; }, () => { const r = window.__qa.renderer(); r.shadowMap.enabled = true; });
    await run('no HUD', () => window.__qa.hud(false), () => window.__qa.hud(true));
    await run('half resolution', () => window.__qa.res(0.5), () => window.__qa.res(1));
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
