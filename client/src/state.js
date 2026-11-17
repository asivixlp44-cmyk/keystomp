// Local mirror of this player's progress. The server owns the real values: everyone's position arrives through the room state,
// private progress in "profile" messages (and "lite" ones, four times a second while you stomp).
export const S = {
    clicks: 0, total: 0, boot: 0, tier: 0, bestTier: 0, gems: 0, reboots: 0,
    presses: 0, words: 0, word: '', wi: 0, golds: 0, megas: 0, speeds: 0, bestSpeed: 0, bestCombo: 0,
    ups: {}, upgrades: 0, buds: {}, team: [], index: {}, boxes: 0, spins: 0, spinIn: 0, spinsUsed: 0, x2Until: 0, x2: false,
    qi: 0, qv: 0, jq: { day: '', list: [] }, daily: {}, codes: {}, gifts: {}, seen: {}, tut: 0,
    sessionSecs: 0, playtime: 0, firstPlay: Date.now(),
    joinedAt: Date.now(), profileAt: 0, name: '',
    // this device only: the keyboard under you (-1: none), your combo, the Auto Typer on or off
    onBoard: -1, combo: 0, autoOn: true,
};

// Game actions that world objects and panels trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    rtt: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms (corrected for the round trip, smooth.js), so timers line up for everyone
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};

// QA: where a slow frame's time went (sections marked as the frame runs)
export const prof = { t: 0, parts: [], on: true, mark(name) { const n = performance.now(); this.parts.push(name, n - this.t); this.t = n; }, start() { this.parts.length = 0; this.t = performance.now(); } };
