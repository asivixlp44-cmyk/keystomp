// Headless server test: the whole loop and its guards, against a running QA server (QA=1).
// Run: start the server with QA=1 PORT=3163 (cd server && set QA=1 && set PORT=3163 && node src/index.js), then: node tests/server.test.mjs [port]
import { Client } from '../client/node_modules/@colyseus/sdk/build/index.mjs';
import { SETUPS, KEYS, KB_Y, keyOfChar, SPEED, SPAWN } from '../shared/world.js';
import { CFG, BOARDS, UPGRADES, upgradeCost, BOXES, perPress, comboMult, rebootNeed, QUESTS } from '../shared/config.js';

const PORT = Number(process.argv[2]) || 3163;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) { pass++; console.log('  ok  ', what); } else { fail++; console.log('  FAIL', what); } };

async function join(name, uid) {
    const c = new Client('ws://localhost:' + PORT);
    const room = await c.joinOrCreate('desk', { uid: uid || 'test-' + Math.random().toString(36).slice(2), name });
    const st = { profile: null, lite: null, toasts: [], snaps: 0, hello: null, msgs: {}, last: {} };
    room.onMessage('*', (type, m) => { st.msgs[type] = (st.msgs[type] || 0) + 1; st.last[type] = m; });
    room.onMessage('hello', (m) => { st.hello = m; });
    room.onMessage('profile', (m) => { st.profile = m; });
    room.onMessage('lite', (m) => { st.lite = m; if (st.profile) Object.assign(st.profile, m); });
    room.onMessage('toast', (m) => st.toasts.push(m.text));
    room.onMessage('snap', () => st.snaps++);
    for (const t of ['frenzy', 'combo', 'pong', 'boards', 'reward', 'bought', 'taskdone', 'questdone', 'warped', 'broke', 'code', 'emote', 'chat', 'authed', 'tier', 'word', 'golden', 'goldfx', 'mega', 'megafx', 'lucky', 'speedgo', 'speeddone', 'hatched', 'rebooted', 'spun', 'toastreward', 'offline', 'adx2']) room.onMessage(t, (m) => { st.msgs[t] = (st.msgs[t] || 0) + 1; st.last[t] = m; });
    for (let i = 0; i < 50 && !st.profile; i++) await sleep(50);
    return { room, st };
}
// stand somewhere: a QA teleport (where the server checks the next move from) and a move there
async function standAt(room, x, y, z) {
    room.send('qa', { tp: [x, y, z] });
    await sleep(60);
    room.send('move', { x, y, z, ry: 0, a: 0, ts: Date.now() });
    await sleep(60);
}
const keyXZ = (si, k) => ({ x: SETUPS[si].x + KEYS[k].x, z: SETUPS[si].z + KEYS[k].z });
async function want(o) { o.room.send('want', {}); await sleep(1100); o.room.send('want', {}); await sleep(250); return o.st.profile; }

const main = async () => {
    console.log('server test on port', PORT);
    // ----- join -----
    const A = await join('Alice');
    ok(A.st.profile && A.st.profile.clicks === 0 && A.st.profile.tier === 0, 'joined with a fresh profile on the first keyboard');
    ok(typeof A.st.profile.word === 'string' && A.st.profile.word.length >= 3, 'got a word to type: ' + A.st.profile.word);
    const me = () => A.room.state.players.get(A.room.sessionId);
    ok(me() && Math.abs(me().z - SPAWN.z) < 6, 'standing on the spawn');
    // ----- a press far from the key is refused -----
    A.room.send('press', { si: 0, k: 20, s: 1, c: 1 });
    await sleep(400);
    ok((await want(A)).clicks === 0, 'a press from across the desk gives nothing');
    // ----- walk onto keyboard 0, press keys -----
    const k0 = keyOfChar('Q'), p0 = keyXZ(0, k0);
    await standAt(A.room, p0.x, KB_Y, p0.z);
    for (let i = 0; i < 10; i++) { A.room.send('press', { si: 0, k: k0, s: 2 + i, c: i + 1 }); await sleep(90); }
    await sleep(400);
    let pr = await want(A);
    ok(pr.presses === 10, '10 presses counted (' + pr.presses + ')');
    // (a press may be a lucky x10: 9 more)
    // 1 click a press, the 10th in a row x1.1 (the combo); any lucky one x10 (a whole number of 9s more)
    const base10 = [...Array(10)].reduce((a, _, i) => a + comboMult(i + 1, {}), 0), extra = pr.clicks - base10;
    ok(extra > -0.05 && Math.abs(extra / 9 - Math.round(extra / 9)) < 0.03, 'a press on the Office keyboard is 1 click, the combo on top (' + pr.clicks + ' for 10, ' + base10.toFixed(1) + ' expected)');
    ok(pr.ack >= 11, 'presses acknowledged up to ' + pr.ack);
    // ----- the token bucket: 100 presses at once count at most a burst -----
    const before = pr.presses;
    for (let i = 0; i < 100; i++) A.room.send('press', { si: 0, k: k0, s: 100 + i, c: 0 });
    await sleep(500);
    pr = await want(A);
    ok(pr.presses - before <= CFG.clickBurst + 6, '100 presses sent at once: ' + (pr.presses - before) + ' counted (burst ' + CFG.clickBurst + ')');
    // ----- the combo: the server never believes more than it saw -----
    await sleep(1500);
    const c0 = pr.clicks;
    for (let i = 0; i < 30; i++) { A.room.send('press', { si: 0, k: k0, s: 300 + i, c: 9999 }); await sleep(70); }
    await sleep(400);
    pr = await want(A);
    const gotC = pr.clicks - c0, maxC = [...Array(30)].reduce((a, _, i) => a + comboMult(i + 1, pr) * 1, 0);
    ok(gotC <= maxC * CFG.clickBurst + 1 && gotC <= maxC + 10 * 9 + 1, 'a claimed 9999 combo pays as the server counted (' + gotC.toFixed(1) + ' clicks for 30 presses)');
    ok(pr.bestCombo <= 30, 'best combo is what the server saw (' + pr.bestCombo + ')');
    // ----- a locked keyboard: refused -----
    const k1 = keyOfChar('A'), p1 = keyXZ(1, k1);
    await standAt(A.room, p1.x, KB_Y, p1.z);
    const pBefore = pr.presses;
    for (let i = 0; i < 5; i++) { A.room.send('press', { si: 1, k: k1, s: 400 + i, c: 1 }); await sleep(80); }
    await sleep(300);
    pr = await want(A);
    ok(pr.presses === pBefore, 'presses on the locked Bubblegum keyboard give nothing');
    // ----- the word: stomp its letters in order -----
    A.room.send('qa', { word: 'CAT' });
    await sleep(150);
    const wordsBefore = (await want(A)).words;
    let s = 500;
    for (const ch of 'CAT') { const k = keyOfChar(ch), p = keyXZ(0, k); await standAt(A.room, p.x, KB_Y, p.z); A.room.send('press', { si: 0, k, s: s++, c: 1 }); await sleep(120); }
    await sleep(400);
    pr = await want(A);
    ok(pr.words === wordsBefore + 1, 'typed CAT: words ' + pr.words);
    ok(A.st.last.word && A.st.last.word.word === 'CAT' && A.st.last.word.got >= CFG.wordMult * 3 * 0.99, 'the word paid ' + (A.st.last.word && A.st.last.word.got) + ' clicks');
    ok(pr.word && pr.word !== 'CAT' && pr.wi === 0, 'a new word to type: ' + pr.word);
    // ----- a Golden Key -----
    const kg = keyOfChar('G'), pg = keyXZ(0, kg);
    A.room.send('qa', { gold: { si: 0, k: kg } });
    await sleep(150);
    ok(A.room.state.gold.includes('0:' + kg), 'the Golden Key is in the room state (' + A.room.state.gold + ')');
    await standAt(A.room, pg.x, KB_Y, pg.z);
    const gBefore = (await want(A)).golds;
    A.room.send('press', { si: 0, k: kg, s: s++, c: 1 });
    await sleep(400);
    pr = await want(A);
    ok(pr.golds === gBefore + 1, 'stomped the Golden Key');
    ok(!A.room.state.gold.includes('0:' + kg), 'it is gone from the room state');
    // ----- a combo milestone: 50 presses in a row pay a bonus once -----
    await sleep(1800);
    for (let i = 0; i < 55; i++) { A.room.send('press', { si: 0, k: kg, s: s++, c: i + 1 }); await sleep(68); }
    await sleep(400);
    ok(A.st.last.combo && A.st.last.combo.n === 50 && A.st.last.combo.got > 0, '50 presses in a row: the 50 COMBO bonus (' + (A.st.last.combo && A.st.last.combo.got) + ' clicks)');
    ok((A.st.msgs.combo || 0) === 1, 'the milestone pays once a combo (' + (A.st.msgs.combo || 0) + ')');
    // the player's combo lapsed on their screen (sooner than here) and climbs again: its 50 pays again, after 50 more presses
    for (let i = 0; i < 52; i++) { A.room.send('press', { si: 0, k: kg, s: s++, c: i + 1 }); await sleep(68); }
    await sleep(400);
    ok((A.st.msgs.combo || 0) === 2, 'a combo started again pays its 50 again (' + (A.st.msgs.combo || 0) + ')');
    // ...but claiming a restart and then 50 straight away pays nothing (the count restarted too)
    A.room.send('press', { si: 0, k: kg, s: s++, c: 1 }); await sleep(70);
    A.room.send('press', { si: 0, k: kg, s: s++, c: 50 }); await sleep(70);
    A.room.send('press', { si: 0, k: kg, s: s++, c: 51 }); await sleep(400);
    ok((A.st.msgs.combo || 0) === 2, 'a faked restart cannot farm the milestone (' + (A.st.msgs.combo || 0) + ')');
    // ----- KEY FRENZY: every press x3 -----
    await sleep(1800);
    let fr = await want(A);
    const f0 = fr.clicks;
    A.room.send('press', { si: 0, k: kg, s: s++, c: 1 });
    await sleep(400);
    fr = await want(A);
    const plain = fr.clicks - f0;
    A.room.send('qa', { frenzy: 1 });
    await sleep(300);
    ok(A.room.state.frenzy > Date.now() - 5000 && !!A.st.last.frenzy, 'KEY FRENZY started (in the room state, announced)');
    await sleep(1800);
    fr = await want(A);
    const f1 = fr.clicks;
    A.room.send('press', { si: 0, k: kg, s: s++, c: 1 });
    await sleep(400);
    fr = await want(A);
    const boosted = fr.clicks - f1;
    ok(Math.abs(boosted - plain * 3) < 0.6 || boosted === plain * 30 || plain * 3 === boosted / 10, 'a press in a frenzy pays x3 (' + plain.toFixed(1) + ' -> ' + boosted.toFixed(1) + ')');
    // ----- the giant mouse: a MEGA CLICK, only standing on its button -----
    const m = SETUPS[0].mouse;
    await standAt(A.room, m.x - 4, 0, m.z - 6);
    A.room.send('mega', { si: 0, side: 0 });
    await sleep(300);
    ok(((await want(A)).megas || 0) === 0, 'a Mega Click from the desk beside the mouse is refused');
    await standAt(A.room, m.x - 4, m.top, m.z - 6);
    A.room.send('mega', { si: 0, side: 0 });
    A.room.send('mega', { si: 0, side: 0 });
    await sleep(300);
    pr = await want(A);
    ok(pr.megas === 1, 'standing on the left button: one Mega Click (the second waits ' + CFG.megaGap + ' s)');
    // ----- moving too fast: snapped back -----
    const snaps0 = A.st.snaps;
    A.room.send('move', { x: m.x - 4 + 200, y: 0, z: m.z, ry: 0, a: 0, ts: Date.now() });
    await sleep(300);
    ok(A.st.snaps > snaps0, 'a 200-stud jump in one move is snapped back');
    // ----- the Speed Test -----
    await standAt(A.room, SPEED.pad.x, 0, SPEED.pad.z);
    A.room.send('speedgo', {});
    await sleep(200);
    ok(!!A.st.last.speedgo, 'the Speed Test started');
    const at = A.st.last.speedgo.at, end = A.st.last.speedgo.end, off = Date.now() - (A.st.hello.now + 0);
    void off;
    await sleep(Math.max(0, at - Date.now() + 50));
    // 30 clicks a second for the whole test: no more than 20 a second count
    const t0 = Date.now();
    while (Date.now() < end - 50) { A.room.send('tap', {}); await sleep(33); }
    void t0;
    for (let i = 0; i < 40 && !A.st.last.speeddone; i++) await sleep(100);
    const sd = A.st.last.speeddone;
    ok(sd && sd.n > 50 && sd.n <= CFG.speedRate * CFG.speedSecs + CFG.speedBurst, 'Speed Test: ' + (sd && sd.n) + ' clicks counted (30 a second sent, at most ' + CFG.speedRate + ' a second count)');
    ok(sd && sd.best && sd.got > 0, 'a new best and its clicks (' + (sd && sd.got) + ')');
    // ----- the next keyboard: a full bar -----
    A.room.send('qa', { boot: BOARDS[1].need });
    await sleep(300);
    pr = await want(A);
    ok(pr.tier === 1 && pr.bestTier === 1, 'a full bar: the Bubblegum keyboard (tier ' + pr.tier + ')');
    // the quick way back to a keyboard you've got: the server moves you there (and not to one you haven't)
    await sleep(800);
    A.st.last.warped = null; A.room.send('warp', { to: 'board', i: 0 }); await sleep(400);
    const w0 = A.st.last.warped;
    ok(w0 && Math.abs(w0.x - SETUPS[0].x) < 14 && Math.abs(w0.z - SETUPS[0].z) < 20, 'warped back to the Office keyboard (' + (w0 && [Math.round(w0.x), Math.round(w0.z)]) + ')');
    await sleep(800);
    A.st.last.warped = null; A.room.send('warp', { to: 'board', i: 6 }); await sleep(400);
    const w6 = A.st.last.warped;
    ok(w6 && Math.abs(w6.x - SETUPS[1].x) < 14 && Math.abs(w6.z - SETUPS[1].z) < 20, 'a warp to a locked keyboard goes to your best one instead');
    // made-up marks are never saved (the save would grow without end); the real ones are
    A.room.send('tut', { seen: 'junk' + Math.random() }); A.room.send('tut', { seen: 'kb1' }); await sleep(200);
    pr = await want(A);
    ok(pr.seen && pr.seen.kb1 === 1 && Object.keys(pr.seen).every((k) => /^kb[1-8]$/.test(k)), 'only real marks saved (' + Object.keys(pr.seen || {}).join(',') + ')');
    await standAt(A.room, p1.x, KB_Y, p1.z);
    const cB = pr.clicks;
    await sleep(1600);
    A.room.send('press', { si: 1, k: k1, s: s++, c: 1 });
    await sleep(400);
    pr = await want(A);
    ok(Math.abs(pr.clicks - cB - perPress(pr, 1)) < 0.6 || pr.clicks - cB >= perPress(pr, 1), 'a press on Bubblegum pays x' + BOARDS[1].mult + ' (' + (pr.clicks - cB).toFixed(1) + ')');
    // ----- the Tech Shop -----
    A.room.send('qa', { clicks: 100000 });
    await sleep(150);
    const up = UPGRADES[0];
    A.room.send('upgrade', { id: up.id });
    await sleep(300);
    pr = await want(A);
    ok(pr.ups.power === 1, 'bought Click Power (' + upgradeCost(up, 0) + ' clicks)');
    // ----- a Buddy Box: only at its machine -----
    A.room.send('box', { id: BOXES[0].id, n: 1 });
    await sleep(300);
    pr = await want(A);
    ok(pr.boxes === 0, 'a Buddy Box from across the desk is refused');
    const bx = SETUPS[0].box;
    await standAt(A.room, bx.x, 0, bx.z + 6);
    A.room.send('box', { id: BOXES[0].id, n: 3 });
    await sleep(400);
    pr = await want(A);
    ok(pr.boxes === 3 && pr.team.length === 3, 'opened 3 Stationery Boxes: a team of ' + pr.team.length);
    // ----- Reboot -----
    A.room.send('reboot', {});
    await sleep(300);
    pr = await want(A);
    ok(pr.reboots === 0, 'Reboot is refused before ' + rebootNeed(0) + ' clicks this boot');
    A.room.send('qa', { boot: rebootNeed(0) });
    await sleep(200);
    A.room.send('reboot', {});
    await sleep(400);
    pr = await want(A);
    ok(pr.reboots === 1 && pr.tier === 0 && pr.clicks === 0 && pr.boot === 0, 'rebooted: back to the Office keyboard with no clicks');
    ok(!(pr.ups.power > 0) && pr.team.length === 3 && pr.bestTier >= 4, 'upgrades gone, the buddies and the best keyboard kept (' + pr.bestTier + ')');
    // ----- quests, codes, daily -----
    A.room.send('code', { code: 'KEYSTOMP' });
    await sleep(250);
    A.room.send('code', { code: 'KEYSTOMP' });
    await sleep(250);
    pr = await want(A);
    ok(pr.codes.KEYSTOMP && A.st.last.code && A.st.last.code.ok === false, 'a code works once');
    const qi0 = pr.qi;
    A.room.send('qclaim', {});
    await sleep(300);
    pr = await want(A);
    ok(pr.qi === qi0 + 1, 'claimed the quest "' + QUESTS[qi0].text + '"');
    A.room.send('daily', {});
    A.room.send('daily', {});
    await sleep(300);
    pr = await want(A);
    ok(pr.daily && pr.daily.streak === 1, 'the daily reward, once a day');
    // ----- a second player sees the first -----
    const B = await join('Bob');
    await sleep(300);
    ok(B.room.state.players.has(A.room.sessionId), 'Bob sees Alice on the desk');
    const humans = [...B.room.state.players.values()].filter((p) => !p.bot).length;
    ok(humans === 2, 'two players on the desk (' + humans + ', plus ' + ([...B.room.state.players.values()].length - humans) + ' bots)');
    A.room.leave(); B.room.leave();
    await sleep(300);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(1); });
