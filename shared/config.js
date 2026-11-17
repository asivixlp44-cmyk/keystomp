// Keystomp: the game's data and formulas, shared by the client and the server.
// The loop: you're tiny on a giant desk. Run and jump across giant keyboards: every key you land on is a click. Clicks fill the bar at
// the top of the screen, and a full bar gets you a NEW KEYBOARD (a fancier one further down the desk, every press on it worth more).
// Spend clicks on upgrades and Buddy Boxes (Desk Buddies multiply every press), type the word on the monitor, stomp the Golden Key,
// jump on the giant mouse's buttons for a MEGA CLICK, race the Click Speed Test, and Reboot for a multiplier that stays.
// Everything is bought with Clicks or Gems, both earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // moving: walk speed, gravity, the fastest fall, a jump's power
    walk: 24, grav: 110, fallMax: 210, airDash: 46, hopV: 22, power: 62,
    // presses the server counts: at most this many a second, a few saved for a hiccup in the network
    clickRate: 16, clickBurst: 24,
    // a tap (not walking onto a new key) repeats no faster than this on your screen
    tapGap: 0.07,
    // the combo: presses less than this apart keep it going (seconds; the server allows a little more for the network)
    comboGap: 1.0, comboSlack: 0.8,
    // the server keeps this many bots on the first keyboards when it's quiet (one leaves per player who joins)
    bots: 3,
    boostX2Gems: 25, boostX2Mins: 15, adX2Mins: 10,
    spinMins: 7, spinMax: 3,
    // a Golden Key: one at a time on each keyboard someone stands on, every so often, for a while; stomping it pays this many presses
    goldEvery: [12, 22], goldLife: 12, goldMult: 25,
    // the giant mouse's buttons: a MEGA CLICK, this many presses, once in this long
    megaMult: 20, megaGap: 1.4,
    // KEY FRENZY: every few minutes (while someone real is on the desk), every press on the server is worth this much more, for a while
    frenzyEvery: [150, 240], frenzySecs: 20, frenzyMult: 3,
    // combo milestones: a combo reaching one pays that many presses' worth (once a combo)
    comboMiles: [[50, 25], [100, 60], [200, 150], [300, 250], [500, 500]],
    // a word typed on the monitor: this many presses for each of its letters
    wordMult: 20,
    // the Click Speed Test: how long, the most clicks a second it counts, each click worth this many presses at your best keyboard
    speedSecs: 10, speedRate: 20, speedBurst: 6, speedWorth: 3, speedGap: 15,
    // offline: your Auto Typer keeps typing while you're away (presses a second, at most this long)
    offlineRate: 0.2, offlineAuto: 0.15, offlineHours: 2,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));

// ----- the keyboards: down the desk, each fancier than the last. A full bar (clicks this boot) gets you the next one -----
// sound: its switch (client/src/asmr.js); cap: its two key colours; acc: the glowing rim; edge: the case; ink: the legends
export const BOARDS = [
    { id: 'office', name: 'Office Classic', mult: 1, need: 0, sound: 'membrane', cap: [0xece6d8, 0xdcd4c2], acc: 0x8ad8ff, edge: 0xc8c0ae, ink: '#3a3a48', screen: 0x2a6ad8 },
    { id: 'bubble', name: 'Bubblegum', mult: 3, need: 2500, sound: 'pop', cap: [0xff9ad6, 0xffc8ec], acc: 0xff4ab0, edge: 0xf478c0, ink: '#7a0a58', screen: 0xff5ab8 },
    { id: 'mech', name: 'Midnight Mech', mult: 8, need: 25000, sound: 'thock', cap: [0x2c2e3c, 0x3a3d50], acc: 0xb45aff, edge: 0x1a1b26, ink: '#e8e0ff', screen: 0x7a3aff },
    { id: 'type', name: 'Retro Typewriter', mult: 20, need: 200000, sound: 'clack', cap: [0x24242a, 0x2e2e36], acc: 0xe0b050, edge: 0x6a4420, ink: '#fff0c8', screen: 0x3a8a3a, round: true },
    { id: 'rgb', name: 'RGB Gamer', mult: 50, need: 1500000, sound: 'clicky', cap: [0x16181f, 0x20232e], acc: 0x3affd8, edge: 0x0c0d12, ink: '#3affd8', screen: 0x1ad8b0, rgb: true },
    { id: 'frost', name: 'Frostbyte', mult: 125, need: 12000000, sound: 'crystal', cap: [0xe2f6ff, 0xbce6ff], acc: 0x5ac8ff, edge: 0x8ab8d8, ink: '#1a5a8a', screen: 0x4ab4ff },
    { id: 'lava', name: 'Lava Forge', mult: 300, need: 150000000, sound: 'lava', cap: [0x2e1e1a, 0x3e2620], acc: 0xff6a1a, edge: 0x1a1210, ink: '#ffb04a', screen: 0xff5a1a },
    { id: 'gold', name: 'Royal Gold', mult: 800, need: 2500000000, sound: 'gold', cap: [0xffd23a, 0xffe88a], acc: 0xfff4c8, edge: 0xb8860b, ink: '#6a3a00', screen: 0xffb01a },
    { id: 'galaxy', name: 'Galaxy', mult: 2000, need: 40000000000, sound: 'galaxy', cap: [0x2a1a5a, 0x3a2472], acc: 0xff8af0, edge: 0x120a2a, ink: '#ffe8ff', screen: 0x8a4aff, stars: true },
];
// the best keyboard a boot's clicks have got you
export function tierFor(boot) { let t = 0; for (let i = 1; i < BOARDS.length; i++) if (boot >= BOARDS[i].need) t = i; return t; }

// ----- what a press gives -----
export const upLevel = (p, id) => (p.ups && p.ups[id]) || 0;
export const rebootMult = (r) => 1 + 1.0 * (r || 0);
export const buddyMult = (p) => { let m = 1; for (const id of p.team || []) { const k = buddyById[id]; if (k) m += k.mult - 1; } return m; };
export const powerMult = (p) => 1 + 0.25 * upLevel(p, 'power');
// clicks for one press on keyboard b (before the combo and luck)
export function perPress(p, b, x2) {
    const B = BOARDS[b] || BOARDS[0];
    return Math.round(B.mult * powerMult(p) * rebootMult(p.reboots) * buddyMult(p) * (x2 ? 2 : 1) * 10) / 10;
}
// the combo: every 10 presses in a row is +0.1, up to x2 (Combo Keeper: higher, and slower to fade)
export const comboCap = (p) => 2 + 0.25 * upLevel(p, 'combo');
export const comboGap = (p) => CFG.comboGap + 0.15 * upLevel(p, 'combo');
export const comboMult = (n, p) => Math.min(comboCap(p), 1 + 0.1 * Math.floor((n || 0) / 10));
export const walkOf = (p) => CFG.walk * (1 + 0.06 * upLevel(p, 'speed'));
export const luckOf = (p) => 0.01 + 0.012 * upLevel(p, 'luck');
export const LUCK_MULT = 10;
export const autoRate = (p) => upLevel(p, 'auto');
// a stomp (a landing on a keyboard) presses the key under you and this many round it, this far out
export const stompKeys = (p) => 2 + upLevel(p, 'stomp');
export const stompReach = (p) => 6 + 0.7 * upLevel(p, 'stomp');
export const teamSize = (p) => 3 + upLevel(p, 'slots');

// ----- the Tech Shop: upgrades for Clicks (a Reboot takes them back to nothing, but Buddy Slots) -----
export const UPGRADES = [
    { id: 'power', name: 'Click Power', icon: '⚡', text: '+25% clicks on every press', base: 60, grow: 1.75, max: 40, stat: (n) => 'x' + (1 + n * 0.25).toFixed(2).replace(/\.?0+$/, '') },
    { id: 'speed', name: 'Turbo Sneakers', icon: '👟', text: '+6% run speed: more keys a second', base: 200, grow: 2.4, max: 10, stat: (n) => '+' + n * 6 + '%' },
    { id: 'auto', name: 'Auto Typer', icon: '🤖', text: 'Presses keys for you on a keyboard', base: 600, grow: 4.2, max: 8, stat: (n) => n + ' a second' },
    { id: 'luck', name: 'Lucky Keys', icon: '🍀', text: 'A press may CRIT for x10', base: 400, grow: 2.8, max: 10, stat: (n) => Math.round((0.01 + 0.012 * n) * 1000) / 10 + '%' },
    { id: 'combo', name: 'Combo Keeper', icon: '🔥', text: 'A bigger combo that fades slower', base: 1500, grow: 5, max: 6, stat: (n) => 'up to x' + (2 + 0.25 * n) },
    { id: 'stomp', name: 'Spring Shoes', icon: '🦘', text: 'A landing stomps more keys', base: 900, grow: 3.4, max: 6, stat: (n) => 2 + n + ' extra keys' },
    { id: 'slots', name: 'Buddy Slots', icon: '🐾', text: '+1 Desk Buddy on your team', base: 30000, grow: 25, max: 3, keep: true, stat: (n) => 3 + n + ' buddies' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));

// ----- Reboot: back to the first keyboard with no clicks or upgrades, x1 more on every press for good, Gems. The first needs the RGB
// Gamer's bar full, each next one the keyboard after, then the Galaxy's bar five times over each time -----
export const rebootNeed = (r) => { r = r || 0; return r < 5 ? BOARDS[4 + r].need : Math.round(BOARDS[8].need * Math.pow(5, r - 4)); };
export const REBOOT_GEMS = 6;

// ----- Desk Buddies: little desk things with faces, out of the Buddy Boxes (one box by each keyboard) -----
// shape and feat say how a buddy is built (client/src/buddies.js)
export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' }, legendary: { name: 'Legendary', color: '#ffc42a' },
});
const RAR = ['common', 'rare', 'epic', 'legendary'];
const bud = (id, name, shape, c1, c2, feat) => ({ id, name, shape, c1, c2, feat });
const BOX_LIST = [
    { id: 'b1', name: 'Stationery Box', cost: 200, color: 0x4ac8ff, mults: [1.05, 1.1, 1.2, 1.4], buds: [bud('eraser', 'Eraser Ed', 'block', 0xff8ab0, 0x5ab4ff, ''), bud('sticky', 'Sticky', 'flat', 0xffe24a, 0xffc81a, 'curl'), bud('pencil', 'Pencil Pete', 'tall', 0xffc83a, 0xff8a9a, 'tip'), bud('floppy', 'Floppy', 'square', 0x3a5aff, 0xd8dce8, 'label')] },
    { id: 'b2', name: 'Snack Box', cost: 3000, color: 0xff9a3a, mults: [1.2, 1.3, 1.5, 1.9], buds: [bud('cookie', 'Cookie', 'disc', 0xd8a060, 0x5a3a20, 'chips'), bud('milk', 'Milky', 'carton', 0xffffff, 0x5ab4ff, 'roof'), bud('donut', 'Donut', 'disc', 0xf0c890, 0xff8ad0, 'sprinkles'), bud('cupcake', 'Cuppy', 'cup', 0xff8ad0, 0xffffff, 'cherry')] },
    { id: 'b3', name: 'Gadget Box', cost: 30000, color: 0x3affd8, mults: [1.4, 1.6, 1.9, 2.5], buds: [bud('mousey', 'Mousey', 'dome', 0xe8e8f0, 0x3a3a48, 'cable'), bud('usb', 'USB Stick', 'tall', 0x3a3a48, 0xc8ccd8, 'plug'), bud('joypad', 'Joypad', 'wide', 0x5a5aff, 0xff4a6a, 'buttons'), bud('phones', 'Headphones', 'block', 0xff4a6a, 0x222228, 'phones')] },
    { id: 'b4', name: 'Retro Box', cost: 250000, color: 0xffb02a, mults: [1.7, 2, 2.4, 3.2], buds: [bud('tape', 'Cassette', 'wide', 0x3a3a48, 0xff8a3a, 'reels'), bud('cart', 'Game Cart', 'square', 0x8a8a98, 0xff4a4a, 'label'), bud('cube', 'Puzzle Cube', 'cube', 0xff3a3a, 0x3a8aff, 'cube'), bud('robo', 'Robo', 'block', 0xb8c0d0, 0x3ad8ff, 'antenna')] },
    { id: 'b5', name: 'Arcade Box', cost: 2000000, color: 0xff3aff, mults: [2.1, 2.5, 3, 4.2], buds: [bud('ghost', 'Pixel Ghost', 'ghost', 0x8ae8ff, 0xffffff, ''), bud('coin', 'Coiny', 'coin', 0xffd23a, 0xffa81a, 'star'), bud('joy', 'Joystick', 'cube', 0x2a2a3a, 0xff3a3a, 'stick'), bud('cab', 'Arcade Cab', 'tall', 0x5a2aff, 0x3affd8, 'screen')] },
    { id: 'b6', name: 'Frost Box', cost: 16000000, color: 0x8ae8ff, mults: [2.6, 3.1, 3.8, 5.5], buds: [bud('ice', 'Ice Cube', 'cube', 0xc8f0ff, 0x8ad8ff, ''), bud('snow', 'Snowball', 'ball', 0xffffff, 0xff4a4a, 'hat'), bud('pengy', 'Pengy', 'egg', 0x2a2a3a, 0xffffff, 'beak'), bud('frosty', 'Frost Gem', 'gem', 0x8ad8ff, 0xffffff, 'halo')] },
    { id: 'b7', name: 'Lava Box', cost: 200000000, color: 0xff6a1a, mults: [3.2, 3.9, 4.8, 7], buds: [bud('rock', 'Lava Rock', 'ball', 0x3a2a2a, 0xff6a1a, 'cracks'), bud('sprite', 'Fire Sprite', 'cone', 0xff8a1a, 0xffe24a, 'flame'), bud('mug', 'Hot Mug', 'cyl', 0xff5a3a, 0xffffff, 'handle'), bud('phoenix', 'Phoenix', 'egg', 0xff4a1a, 0xffc81a, 'wings')] },
    { id: 'b8', name: 'Royal Box', cost: 3000000000, color: 0xffd23a, mults: [4, 4.8, 6, 9], buds: [bud('crowny', 'Crowny', 'cyl', 0xffd23a, 0xff3a6a, 'crown'), bud('trophy', 'Trophy', 'cup', 0xffd23a, 0xb8860b, 'handles'), bud('ruby', 'Ruby', 'gem', 0xff3a6a, 0xffb0c8, ''), bud('kingkey', 'King Key', 'key', 0xfff0a8, 0xffd23a, 'crown')] },
    { id: 'b9', name: 'Galaxy Box', cost: 50000000000, color: 0xb45aff, mults: [5, 6, 7.5, 12], buds: [bud('planet', 'Planetoid', 'ball', 0x8a6aff, 0xffc88a, 'ring'), bud('ufo', 'UFO', 'disc', 0xb8c0d0, 0x3affd8, 'dome'), bud('starry', 'Starry', 'star', 0xffe24a, 0xffffff, ''), bud('hole', 'Black Hole', 'ball', 0x1a1030, 0xff8af0, 'ring')] },
];
export const ODDS = [60, 28, 10, 2];
export const BOXES = BOX_LIST.map((b, i) => ({ id: b.id, name: b.name, cost: b.cost, color: b.color, tier: i, buds: b.buds.map((x) => x.id), odds: ODDS }));
export const BUDDIES = BOX_LIST.flatMap((b, i) => b.buds.map((x, j) => ({ ...x, mult: b.mults[j], rarity: RAR[j], box: b.id, tier: i })));
export const buddyById = lookup(Object.fromEntries(BUDDIES.map((k) => [k.id, k])));
export const boxById = lookup(Object.fromEntries(BOXES.map((c) => [c.id, c])));
// every buddy of a box found: Gems, once
export const INDEX_GEMS = [5, 8, 12, 18, 25, 35, 50, 70, 100];

// ----- the monitor's word: type it by stomping its letters in order (the next letter's key glows) -----
const WORDS = [
    ['CAT', 'DOG', 'SUN', 'KEY', 'FUN', 'BOX', 'JAM', 'ZIP', 'WOW', 'HOP', 'MIX', 'JOY', 'FOX', 'BUG', 'CUP', 'HAT', 'PIG', 'YES'],
    ['TYPE', 'JUMP', 'GAME', 'STAR', 'CAKE', 'FAST', 'BOOM', 'DESK', 'GOLD', 'COOL', 'WAVE', 'FROG', 'LAVA', 'ZOOM', 'PLAY', 'KING', 'NOVA'],
    ['CLICK', 'STOMP', 'MOUSE', 'SPEED', 'PIXEL', 'TOAST', 'LASER', 'ROBOT', 'CANDY', 'QUEST', 'TIGER', 'SPACE', 'MAGIC', 'TURBO', 'COMBO'],
    ['ROCKET', 'BUDDY', 'SCREEN', 'PLANET', 'GOLDEN', 'JUMPER', 'WIZARD', 'BANANA', 'GALAXY', 'DRAGON', 'CASTLE', 'ZOMBIE', 'FROZEN'],
    ['KEYSTOMP', 'KEYBOARD', 'RAINBOW', 'MONSTER', 'CAPTAIN', 'SNOWBALL', 'DINOSAUR', 'VOLCANO', 'UNICORN', 'TREASURE', 'SPACESHIP'],
];
// the word for your n-th word on keyboard tier t (longer on the later keyboards)
export function wordFor(t, n, seed) {
    const list = WORDS[Math.min(WORDS.length - 1, Math.floor((t + 1) / 2))];
    const r = rngFrom(((seed || 1) * 31 + n * 7919 + t * 104729) >>> 0);
    r(); r();
    return list[Math.floor(r() * list.length)];
}

// ----- titles over your head: lifetime clicks -----
export const TITLES = [[0, 'Keyboard Newbie'], [1e3, 'Key Tapper'], [1e4, 'Fast Fingers'], [1e5, 'Type Machine'], [1e6, 'Keystomper'], [1e7, 'Clack Master'], [1e8, 'Keyboard Legend'], [1e9, 'Key Overlord'], [1e10, 'Typing Titan'], [1e12, 'Keyboard God']];
export function titleOf(total) { let t = TITLES[0][1]; for (const [n, name] of TITLES) if (total >= n) t = name; return t; }

// ----- the Prize Wheel: one spin's prizes (weights); taps: that many presses' worth of clicks at your best keyboard -----
export const SPIN = [
    { w: 24, taps: 60, text: 'Clicks', color: '#3ab4ff' }, { w: 15, gems: 5, text: '5 Gems', color: '#b45aff' }, { w: 13, taps: 180, text: 'Big Clicks', color: '#2ad8e8' },
    { w: 11, x2: 10, text: 'x2 Clicks', color: '#46ec50' }, { w: 9, gems: 12, text: '12 Gems', color: '#7a4aff' }, { w: 14, taps: 100, text: 'Clicks', color: '#ffd028' },
    { w: 8, taps: 600, text: 'Huge Clicks', color: '#ff5a8a' }, { w: 6, gems: 25, text: '25 Gems', color: '#ff9a1a' },
];

// ----- daily tasks -----
export const TASKS = lookup({
    press: { text: 'Stomp keys', icon: '⌨️', n: 2000, gems: 5, taps: 300 },
    words: { text: 'Type words', icon: '🖥️', n: 5, gems: 6, taps: 300 },
    gold: { text: 'Stomp Golden Keys', icon: '🔑', n: 3, gems: 6, taps: 400 },
    mega: { text: 'Mega Clicks', icon: '🖱️', n: 10, gems: 5, taps: 300 },
    boxes: { text: 'Open Buddy Boxes', icon: '📦', n: 3, gems: 5, taps: 300 },
    speed: { text: 'Do a Speed Test', icon: '⏱️', n: 1, gems: 4, taps: 200 },
    spins: { text: 'Spin the Prize Wheel', icon: '🎡', n: 2, gems: 5, taps: 200 },
    combo: { text: 'Reach a 100 combo', icon: '🔥', n: 1, gems: 6, taps: 300 },
});
const TASK_POOL = ['words', 'gold', 'mega', 'boxes', 'speed', 'spins', 'combo'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['press'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen) -----
export const QUESTS = [
    { kind: 'presses', n: 25, text: 'Stomp 25 keys', gems: 2 },
    { kind: 'words', n: 1, text: 'Type the word on the monitor', gems: 3 },
    { kind: 'bestTier', n: 1, text: 'Get the Bubblegum keyboard', taps: 100 },
    { kind: 'upgrades', n: 1, text: 'Buy an upgrade at the Tech Shop', gems: 3 },
    { kind: 'boxes', n: 1, text: 'Open a Buddy Box', gems: 3 },
    { kind: 'golds', n: 1, text: 'Stomp a Golden Key', taps: 150 },
    { kind: 'megas', n: 1, text: 'Jump on a giant mouse button', gems: 3 },
    { kind: 'speeds', n: 1, text: 'Try the Click Speed Test', gems: 4 },
    { kind: 'bestTier', n: 2, text: 'Get the Midnight Mech keyboard', gems: 5 },
    { kind: 'presses', n: 1000, text: 'Stomp 1,000 keys', taps: 300 },
    { kind: 'words', n: 10, text: 'Type 10 words', gems: 5 },
    { kind: 'bestCombo', n: 100, text: 'Reach a 100 combo', gems: 5 },
    { kind: 'auto', n: 1, text: 'Get the Auto Typer', taps: 400 },
    { kind: 'bestTier', n: 3, text: 'Get the Retro Typewriter', gems: 8 },
    { kind: 'boxes', n: 5, text: 'Open 5 Buddy Boxes', gems: 6 },
    { kind: 'reboots', n: 1, text: 'Reboot once', gems: 12 },
    { kind: 'spinsUsed', n: 3, text: 'Spin the Prize Wheel 3 times', gems: 6 },
    { kind: 'bestTier', n: 4, text: 'Get the RGB Gamer keyboard', gems: 10 },
    { kind: 'golds', n: 15, text: 'Stomp 15 Golden Keys', taps: 1500 },
    { kind: 'presses', n: 10000, text: 'Stomp 10,000 keys', gems: 12 },
    { kind: 'upgrades', n: 15, text: 'Own 15 upgrades', taps: 2500 },
    { kind: 'reboots', n: 2, text: 'Reboot twice', gems: 15 },
    { kind: 'bestTier', n: 5, text: 'Get the Frostbyte keyboard', gems: 15 },
    { kind: 'words', n: 50, text: 'Type 50 words', gems: 15 },
    { kind: 'boxes', n: 25, text: 'Open 25 Buddy Boxes', gems: 20 },
    { kind: 'bestTier', n: 6, text: 'Get the Lava Forge keyboard', gems: 25 },
    { kind: 'reboots', n: 5, text: 'Reboot 5 times', gems: 30 },
    { kind: 'bestTier', n: 7, text: 'Get the Royal Gold keyboard', gems: 40 },
    { kind: 'bestTier', n: 8, text: 'Get the Galaxy keyboard', gems: 60 },
    { kind: 'reboots', n: 10, text: 'Reboot 10 times', gems: 80 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
export const DAILY = [{ taps: 200 }, { spins: 1 }, { gems: 8 }, { taps: 800 }, { x2: 15 }, { gems: 15 }, { taps: 3000, gems: 25 }];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [{ min: 2, taps: 150 }, { min: 5, gems: 5 }, { min: 9, spins: 1 }, { min: 14, taps: 600 }, { min: 20, gems: 10 }, { min: 30, x2: 15 }, { min: 45, taps: 2500, gems: 15 }];
export const CODES = lookup({ KEYSTOMP: { gems: 10 }, CLACK: { taps: 300 }, QWERTY: { spins: 1 }, BLOXITY: { gems: 5 }, LEGION: { gems: 5 }, TYPEFAST: { x2: 10 } });
// Gems for clicks (that many presses' worth at your best keyboard)
export const PACKS = [{ id: 'p1', gems: 10, taps: 400 }, { id: 'p2', gems: 30, taps: 1500 }, { id: 'p3', gems: 80, taps: 5000 }];
// a reward's clicks for you now: presses' worth at your best keyboard
export function rewardFor(p, r) {
    const out = {};
    if (r.taps) out.clicks = Math.round(r.taps * perPress(p, p.tier || 0));
    if (r.clicks) out.clicks = (out.clicks || 0) + Math.round(r.clicks);
    for (const k of ['gems', 'spins', 'x2']) if (r[k]) out[k] = r[k];
    return out;
}
// HTML: a click is drawn (class "cc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.clicks ? fmt(r.clicks) + (plain ? ' Clicks' : ' <i class="cc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Clicks ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

// ----- the leaderboards on Boxity (the server reports them; declared on the client too) -----
export const LEADERBOARDS = [
    { id: 'clicks', label: 'Total clicks', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
    { id: 'speed', label: 'Click speed (clicks in 10 s)', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
    { id: 'playtime', label: 'Playtime (min)', order: 'desc', mode: 'sum', format: 'number', reset: 'none' },
    { id: 'keyboards', label: 'Keyboards unlocked', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
];

export const BOT_NAMES = [
    'ClackAttack', 'QwertyQueen', 'SpaceBarry', 'EnterKey99', 'xXCtrlAltXx', 'ShiftySam', 'TapDancer', 'KeyMasher', 'TypoTim', 'WASDwizard',
    'CapsLockKid', 'F5Frenzy', 'NumPadNia', 'BackspaceBen', 'ThockTheory', 'ModKeyMo', 'DeskGoblin', 'KeebKing', 'ClickyKate', 'TabHoarder',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10) + u[i];
}
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
