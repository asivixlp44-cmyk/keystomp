// The first session, simulated a second at a time with the real formulas (shared/config.js): a typical player running across the
// keys of their best keyboard and clicking (about 8 presses a second, the combo breaking now and then), typing a word now and then,
// grabbing half the Golden Keys, a Mega Click every so often, the Auto Typer, and spending greedily (upgrades, Buddy Boxes). It prints
// when each keyboard, the first Buddy Box, upgrades and Reboots come. node tests/economy.mjs [minutes] [presses a second]
import {
    CFG, BOARDS, tierFor, perPress, comboMult, comboCap, autoRate, UPGRADES, upgradeCost, rebootNeed, BOXES, buddyById, teamSize, wordFor, GIFTS, rewardFor,
} from '../shared/config.js';

const MINS = Number(process.argv[2]) || 90, PPS = Number(process.argv[3]) || 8;
const p = { clicks: 0, total: 0, boot: 0, tier: 0, bestTier: 0, reboots: 0, ups: {}, buds: {}, team: [], upgrades: 0, boxes: 0, words: 0 };
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const log = [];
const at = (t, what) => log.push(String(Math.floor(t / 60)).padStart(3) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '  ' + what);
const fmt = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v) + '');
let combo = 0, comboBreakAt = 20, wordT = 0, goldT = 0, megaT = 0, giftI = 0;
const earn = (n, boot) => { p.clicks += n; p.total += n; if (boot !== false) { p.boot += n; const t = tierFor(p.boot); if (t > p.tier) { p.tier = t; p.bestTier = Math.max(p.bestTier, t); return t; } } return -1; };
for (let s = 1; s <= MINS * 60; s++) {
    // stomping: presses this second, the combo climbing until it breaks (moving to a letter, a jump gone wrong)
    let got = 0;
    for (let k = 0; k < PPS; k++) { combo++; got += perPress(p, p.tier) * comboMult(combo, p); }
    if (s >= comboBreakAt) { combo = 0; comboBreakAt = s + 12 + Math.floor(rnd() * 25); }
    // the Auto Typer
    got += autoRate(p) * perPress(p, p.tier);
    // a word every ~25 s, a Golden Key every ~20 s (half of them grabbed), a Mega Click every ~45 s
    if (s >= wordT) { wordT = s + 20 + rnd() * 12; got += perPress(p, p.tier) * CFG.wordMult * wordFor(p.tier, p.words, 3).length; p.words++; }
    if (s >= goldT) { goldT = s + 17 + rnd() * 8; if (rnd() < 0.5) got += perPress(p, p.tier) * CFG.goldMult * comboMult(combo, p); }
    if (s >= megaT) { megaT = s + 35 + rnd() * 20; got += perPress(p, p.tier) * CFG.megaMult * comboMult(combo, p); }
    const nt = earn(got);
    if (nt > 0) at(s, `KEYBOARD ${nt}: ${BOARDS[nt].name} (x${BOARDS[nt].mult})  · ${fmt(perPress(p, nt))} a press`);
    // the playtime gifts
    if (giftI < GIFTS.length && s >= GIFTS[giftI].min * 60) { const r = rewardFor(p, GIFTS[giftI]); if (r.clicks) earn(r.clicks, false); giftI++; }
    // spending, greedily: the cheapest upgrade worth having, a Buddy Box when the team could be better
    for (let guard = 0; guard < 20; guard++) {
        const opts = [];
        for (const u of UPGRADES) { const n = p.ups[u.id] || 0; if (n < u.max) opts.push({ cost: upgradeCost(u, n), go: () => { p.ups[u.id] = n + 1; p.upgrades++; if (p.upgrades === 1 || u.id === 'auto' && n === 0) at(s, `bought ${u.name} ${n + 1}`); } }); }
        const box = BOXES[p.tier];
        const worst = p.team.length < teamSize(p) ? 0 : Math.min(...p.team.map((id) => buddyById[id].mult));
        if (worst < buddyById[box.buds[0]].mult * 1.05) opts.push({ cost: box.cost, go: () => { const r = rnd() * 100; const j = r < 60 ? 0 : r < 88 ? 1 : r < 98 ? 2 : 3; const id = box.buds[j]; p.buds[id] = (p.buds[id] || 0) + 1; p.boxes++; if (p.team.length < teamSize(p)) p.team.push(id); else { const wi = p.team.findIndex((x) => buddyById[x].mult === worst); if (buddyById[id].mult > worst) p.team[wi] = id; } if (p.boxes === 1) at(s, `first Buddy Box: ${buddyById[id].name}`); } });
        opts.sort((a, b) => a.cost - b.cost);
        const o = opts[0];
        if (!o || o.cost > p.clicks * 0.9) break;
        p.clicks -= o.cost;
        o.go();
    }
    // Reboot as soon as it's allowed (upgrades back to nothing but Buddy Slots)
    if (p.boot >= rebootNeed(p.reboots)) { p.reboots++; p.clicks = 0; p.boot = 0; p.tier = 0; combo = 0; for (const u of UPGRADES) if (!u.keep) p.ups[u.id] = 0; at(s, `REBOOT ${p.reboots} (now x${1 + p.reboots})`); }
}
console.log(`first ${MINS} min at ${PPS} presses a second (combo cap x${comboCap(p)}):`);
for (const l of log) console.log(l);
console.log(`end: keyboard ${p.tier} (${BOARDS[p.tier].name}), best ${p.bestTier}, ${p.reboots} reboots, ${p.upgrades} upgrades, ${p.boxes} boxes, ${fmt(perPress(p, p.tier))} a press, total ${fmt(p.total)}`);
