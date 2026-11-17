import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile, topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken, verifyAdReward, queueScore } from './bloxity.js';
import {
    CFG, BOARDS, tierFor, perPress, comboMult, comboGap, walkOf, luckOf, LUCK_MULT, autoRate, stompReach, teamSize, jumpH,
    UPGRADES, upgradeById, upgradeCost, rebootNeed, REBOOT_GEMS, BUDDIES, buddyById, BOXES, boxById, INDEX_GEMS, wordFor, titleOf,
    SPIN, TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, PACKS, rewardFor, rewardText, clamp, BOT_NAMES,
} from '../../shared/config.js';
import { P as KEYP, KB_Y, KB_D, SPAWN, SETUPS, KEYS, mouseButton, onSpeedPad, deskWorld } from '../../shared/world.js';
import { newBody, stepBody, moveBudget } from '../../shared/physics.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Typist' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// a bucket that fills at rate a second, up to burst saved (presses bunched by a hiccup in the network still count)
function takeToken(o, key, now, rate, burst) {
    const k = key + 'T', at = key + 'At';
    o[k] = Math.min(burst, (o[k] ?? burst) + (now - (o[at] || now)) / 1000 * rate);
    o[at] = now;
    if (o[k] < 1) return false;
    o[k] -= 1;
    return true;
}
// the highest you can be: on the pile of books, jumping
const MAX_Y = 18 + jumpH(CFG.power) + 4;

export const liveRooms = new Set();

// One desk: up to 16 typists stomping the same keyboards (a few bots keep it lively when it's quiet). Moving is on each player's own
// screen; every press, every Golden Key, every Mega Click, every word and everything that earns or costs anything is counted and
// checked here.
export class DeskRoom extends Room {
    maxClients = CFG.maxPlayers;
    maxMessagesPerSecond = 120;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.bots = [];
        this.golds = new Map();      // setup -> { k, until }
        this.goldNext = new Map();   // setup -> when the next one may come
        this.world = deskWorld();
        this.frenzyAt = Date.now() + rnd(60, 120) * 1000;   // the first KEY FRENZY comes sooner
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('press', this.onPress);
        on('mega', this.onMega);
        on('speedgo', this.onSpeedGo);
        on('tap', this.onTap);
        on('warp', this.onWarp);
        on('upgrade', this.onUpgrade);
        on('box', this.onBox);
        on('equip', this.onEquip);
        on('equipbest', this.onEquipBest);
        on('reboot', this.onReboot);
        on('spin', this.onSpin);
        on('pack', this.onPack);
        on('x2', this.onX2);
        on('adx2', this.onAdX2);
        on('qclaim', this.onQuestClaim);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        on('want', (client) => { const s = this.sessions.get(client.sessionId), now = Date.now(); if (s && now - (s.wantAt || 0) > 1000) { s.wantAt = now; this.sendProfile(s); } });
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        // QA only (QA=1, never on Legion): give yourself Clicks, Gems, keyboards...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.fillBots();
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name, auth.legion.carriedFrom);
        }
        await loadProfile(uid);
        if (uid !== guest && !isOnline(guest)) releaseProfile(guest, isOnline);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        player.bx = auth && auth.legion ? auth.legion.id : '';
        const now = Date.now();
        Object.assign(player, { x: SPAWN.x + rnd(-5, 5), y: 0, z: SPAWN.z + rnd(-2, 2), ry: Math.PI, t: now });
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, minAcc: 0, ack: 0,
            gifts: {}, last: { x: player.x, y: 0, z: player.z }, lastAt: now, snapAt: 0, homeAt: 0, spinSecs: 0, warpAt: 0, megaAt: 0,
            combo: { n: 0, at: 0, eff: 0, mi: 0 }, speed: null, speedEnd: 0, lbClicks: 0,
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, presses: 0, clicks: 0, words: 0, golds: 0, megas: 0, speeds: 0, boxes: 0, ups: 0, buys: 0, reboots: 0,
                tier0: profile.tier, touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstTierAt: 0,
            },
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_') });
        this.payAway(client, profile, now);
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        this.fillBots();
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['clicks', 'total', 'boot', 'tier', 'bestTier', 'gems', 'reboots', 'presses', 'words', 'wordN', 'wi', 'golds', 'megas', 'speeds', 'bestSpeed', 'bestCombo', 'upgrades', 'boxes', 'spins', 'spinsUsed', 'x2Until', 'qi', 'tut', 'playtime', 'lastSeen']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.tier = clamp(Math.floor(p.tier), 0, BOARDS.length - 1);
        p.tier = Math.max(p.tier, tierFor(p.boot));
        p.bestTier = clamp(Math.max(Math.floor(p.bestTier), p.tier), 0, BOARDS.length - 1);
        for (const k of ['daily', 'codes', 'seen', 'jq', 'ups', 'buds', 'index']) p[k] = obj(p[k]);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.buds)) if (!buddyById[id] || !(p.buds[id] > 0)) delete p.buds[id];
        p.team = arr(p.team).filter((id) => buddyById[id] && p.buds[id] > 0).slice(0, teamSize(p));
        p.jq = { day: String(p.jq.day || ''), list: arr(p.jq.list).slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) };
        if (!finite(p.wseed) || p.wseed <= 0) p.wseed = 1 + Math.floor(Math.random() * 1e6);
        if (typeof p.word !== 'string' || !/^[A-Z]{3,10}$/.test(p.word)) { p.word = wordFor(p.tier, p.wordN, p.wseed); p.wi = 0; }
        p.wi = clamp(Math.floor(p.wi), 0, p.word.length - 1);
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
    }

    // A dropped connection has 30 seconds to come back
    onDrop(client) {
        const r = this.allowReconnection(client, 30), s = this.sessions.get(client.sessionId);
        r.catch(() => {});
        if (s) { s.recon = r; s.dropAt = Date.now(); }
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client; s.recon = null;
        kickOthers(s.profile.uid, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        this.fillBots();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        this.flushBoards(s);
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            presses: st.presses, clicks: Math.round(st.clicks), words: st.words, golds: st.golds, megas: st.megas, speeds: st.speeds, boxes: st.boxes, ups: st.ups, buys: st.buys,
            reboots: st.reboots, tier0: st.tier0, tier: p.tier, squad: this.sessions.size + 1,
            firstTier: st.firstTierAt ? Math.round((st.firstTierAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) { s.profile.lastSeen = Date.now(); this.flushBoards(s); }
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name; pl.tier = p.tier; pl.tc = Math.floor(p.total); pl.title = titleOf(p.total);
        const cb = Math.min(255, Math.floor((s.combo.eff || 0) / 20));
        if (pl.cb !== cb) pl.cb = cb;
        const team = p.team.join(',');
        if (pl.team !== team) pl.team = team;
    }
    x2On(p, now) { return (p.x2Until || 0) > (now || Date.now()); }
    // The player's private progress: straight away for anything they clicked on; while stomping, four times a second, only what
    // changes then (lite)
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            clicks: r1(p.clicks), total: r1(p.total), boot: r1(p.boot), tier: p.tier, bestTier: p.bestTier, gems: p.gems, reboots: p.reboots, ack: s.ack,
            presses: p.presses, words: p.words, word: p.word, wi: p.wi, golds: p.golds, megas: p.megas, speeds: p.speeds, bestSpeed: p.bestSpeed, bestCombo: p.bestCombo,
            ups: p.ups, upgrades: p.upgrades, buds: p.buds, team: p.team, index: p.index, boxes: p.boxes,
            spins: p.spins, spinIn: Math.max(0, CFG.spinMins * 60 - s.spinSecs), spinsUsed: p.spinsUsed, x2Until: p.x2Until,
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile;
        s.dirtyAt = 0;
        this.checkQuests(s);
        const m = { clicks: r1(p.clicks), total: r1(p.total), boot: r1(p.boot), tier: p.tier, ack: s.ack, presses: p.presses, word: p.word, wi: p.wi, words: p.words, golds: p.golds, megas: p.megas, bestCombo: p.bestCombo };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    payClicks(s, n, name) { const p = s.profile; if (p.clicks < n) { this.broke(s, n - p.clicks, name, 'clicks'); return false; } p.clicks -= n; s.stats.buys++; return true; }
    payGems(s, n, name) { const p = s.profile; if (p.gems < n) { this.broke(s, n - p.gems, name, 'gems'); return false; } p.gems -= n; s.stats.buys++; return true; }
    // clicks earned: they count toward your next keyboard, your total and the boards
    addClicks(s, n, boot) {
        const p = s.profile;
        n = Math.max(0, n);
        p.clicks += n; p.total += n; s.stats.clicks += n; s.lbClicks += n;
        if (boot !== false) {
            p.boot += n;
            const t = tierFor(p.boot);
            if (t > p.tier) {
                p.tier = t;
                if (t > p.bestTier) { p.bestTier = t; queueScore(p.uid, 'keyboards', t + 1); }
                if (!s.stats.firstTierAt) s.stats.firstTierAt = Date.now();
                this.sendTo(s, 'tier', { t });
                this.changed(s);
            }
        }
    }
    giveReward(s, r, why) {
        const p = s.profile, got = rewardFor(p, r);
        if (got.clicks) this.addClicks(s, got.clicks, false);
        if (got.gems) p.gems += got.gems;
        if (got.spins) p.spins += got.spins;
        if (got.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + got.x2 * 60000;
        if (why) this.sendTo(s, 'reward', { text: rewardText(got), why, gems: got.gems || 0 });
        return got;
    }
    // what's been earned toward the boards since the last report
    flushBoards(s) {
        const p = s.profile;
        if (s.lbClicks > 0) { queueScore(p.uid, 'clicks', Math.round(s.lbClicks)); s.lbClicks = 0; }
    }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'auto') return (p.ups.auto || 0) > 0 ? 1 : 0;
        return Math.floor(p[kind] || 0);
    }
    checkQuests(s) {
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) >= Q.n && s.questAnnounced !== p.qi) { s.questAnnounced = p.qi; this.sendTo(s, 'questdone', { qi: p.qi }); }
    }
    onQuestClaim(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) < Q.n) return;
        p.qi++;
        this.giveReward(s, Q, 'Quest complete!');
        this.changed(s);
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: the bots, the Golden Keys, the Speed Tests; every second: playtime, free spins -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        for (const b of this.bots) this.driveBot(b, now, dt);
        this.updateGolds(now);
        this.updateFrenzy(now);
        for (const s of this.sessions.values()) {
            if (s.speed && now > s.speed.end + 700) this.finishSpeed(s, now);
            // a combo left alone fades (its flames go out for everyone)
            if (s.combo.eff && now - s.combo.at > (comboGap(s.profile) + CFG.comboSlack) * 1000) { s.combo.n = 0; s.combo.eff = 0; this.syncPublic(s); }
        }
        this.secAcc += dt;
        if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
        for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            s.minAcc++;
            if (s.minAcc >= 60) { s.minAcc = 0; queueScore(p.uid, 'playtime', 1); }
            if (s.playSecs % 10 === 0) this.flushBoards(s);
            if (p.spins < CFG.spinMax) { s.spinSecs++; if (s.spinSecs >= CFG.spinMins * 60) { s.spinSecs = 0; p.spins++; this.toast(s, '🎡 A free spin is ready!', GOLD); this.changed(s); } } else s.spinSecs = 0;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }
    // KEY FRENZY: every few minutes while someone real is here, every press x3 for a while (everyone sees the keys flash)
    frenzyOn(now) { return this.state.frenzy > (now || Date.now()); }
    updateFrenzy(now) {
        if (this.state.frenzy && now > this.state.frenzy) this.state.frenzy = 0;
        if (this.state.frenzy || now < this.frenzyAt) return;
        this.frenzyAt = now + (CFG.frenzySecs + rnd(CFG.frenzyEvery[0], CFG.frenzyEvery[1])) * 1000;
        if (!this.sessions.size) return;
        this.state.frenzy = now + CFG.frenzySecs * 1000;
        this.broadcast('frenzy', { until: this.state.frenzy });
    }
    // a Golden Key now and then on every keyboard someone's standing on (bots don't count)
    updateGolds(now) {
        let changed = false;
        const occupied = new Set();
        for (const s of this.sessions.values()) {
            const L = s.last;
            for (const st of SETUPS) if (st.i <= s.profile.tier && Math.abs(L.x - st.x) < 60 && Math.abs(L.z - st.z) < 34) occupied.add(st.i);
        }
        for (const st of SETUPS) {
            const g = this.golds.get(st.i);
            if (g && now > g.until) { this.golds.delete(st.i); this.goldNext.set(st.i, now + rnd(CFG.goldEvery[0], CFG.goldEvery[1]) * 1000); changed = true; continue; }
            if (g || !occupied.has(st.i)) continue;
            const next = this.goldNext.get(st.i);
            if (next === undefined) { this.goldNext.set(st.i, now + rnd(4, 9) * 1000); continue; }
            if (now < next) continue;
            // any key but the spacebar (too easy) and the one someone's standing on
            let k = 0;
            for (let i = 0; i < 8; i++) { k = Math.floor(Math.random() * KEYS.length); if (KEYS[k].ch !== ' ') break; }
            this.golds.set(st.i, { k, until: now + CFG.goldLife * 1000 });
            changed = true;
        }
        if (changed) this.state.gold = [...this.golds.entries()].map(([si, g]) => si + ':' + g.k).join(';');
    }

    // ----- moving -----
    // where a player says they are: checked against how far they could have moved and how high they can be
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now(), p = s.profile, L = s.last;
        const dt = (now - s.lastAt) / 1000;
        s.lastAt = now;
        // just sent somewhere (a warp, a reboot): the moves still on their way from where they were are dropped (no snap) until they arrive
        if (s.homeAt) {
            if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 6) return;
            s.homeAt = 0;
        }
        const bad = !moveBudget(s, Math.hypot(m.x - L.x, m.z - L.z), walkOf(p) * 1.25 + 4, dt) || m.y > MAX_Y || m.y < -10;
        if (bad) {
            if (now - s.snapAt > 300) { s.snapAt = now; this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z }); }
            return;
        }
        L.x = m.x; L.y = m.y; L.z = m.z;
        const pl = s.player;
        pl.x = m.x; pl.y = m.y; pl.z = m.z; pl.ry = finite(m.ry) ? m.ry : 0; pl.anim = finite(m.a) ? clamp(m.a | 0, 0, 2) : 0;
        pl.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    // a key pressed under your feet (walking onto it, a tap, a stomp, the Auto Typer): clicks. On a keyboard you've got, near where you
    // are, not too fast. The combo counts presses in a row; your screen says how long yours is and the server never believes more than
    // it saw itself.
    onPress(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile, si = m.si | 0, k = m.k | 0, st = SETUPS[si], key = KEYS[k], auto = !!m.a;
        if (finite(m.s)) s.ack = Math.max(s.ack, m.s | 0);
        if (!st || !key || si > p.tier) return;
        const L = s.last, dx = L.x - (st.x + key.x), dz = L.z - (st.z + key.z);
        const slack = walkOf(p) * 0.5 + 6 + key.w * KEYP / 2 + (m.st ? stompReach(p) : 0);
        if (Math.hypot(dx, dz) > slack) return;
        // the Auto Typer has its own allowance (its level's rate); your own presses theirs (the client keeps to it too)
        if (auto) { if (!autoRate(p) || !takeToken(s, 'auto', now, autoRate(p), autoRate(p) + 2)) return; }
        else if (!takeToken(s, 'press', now, CFG.clickRate, CFG.clickBurst)) return;
        let eff = 0;
        if (!auto) {
            const c = s.combo;
            c.n = now - c.at <= (comboGap(p) + CFG.comboSlack) * 1000 ? c.n + 1 : 1;
            if (c.n === 1) c.mi = 0;
            c.at = now;
            eff = finite(m.c) ? clamp(Math.floor(m.c), 0, c.n) : c.n;
            // the player's combo restarted (it lapses sooner on their screen than here): this count restarts with it, so its
            // milestones pay again, each after as many real presses
            if (eff < (c.eff || 0)) { c.n = Math.max(1, eff); c.mi = 0; }
            c.eff = eff;
            // a combo milestone (once a combo): its presses' worth
            const mile = CFG.comboMiles[c.mi || 0];
            if (mile && eff >= mile[0]) {
                c.mi = (c.mi || 0) + 1;
                const bonus = perPress(p, si, this.x2On(p, now)) * mile[1] * (this.frenzyOn(now) ? CFG.frenzyMult : 1);
                this.addClicks(s, bonus);
                this.sendTo(s, 'combo', { n: mile[0], got: r1(bonus) });
            }
            if (eff > p.bestCombo) p.bestCombo = eff;
            // the daily task counts any 100 combo, not only a new best (once a day is enough: it needs one)
            if (eff >= 100 && s.comboTask !== dayKey(now)) { s.comboTask = dayKey(now); this.task(s, 'combo', 1); }
        }
        const fz = this.frenzyOn(now) ? CFG.frenzyMult : 1;
        let got = perPress(p, si, this.x2On(p, now)) * (auto ? 1 : comboMult(eff, p)) * fz;
        if (Math.random() < luckOf(p)) { got *= LUCK_MULT; this.sendTo(s, 'lucky', { got: r1(got) }); }
        // a Golden Key
        const g = this.golds.get(si);
        if (g && g.k === k && now <= g.until) {
            const bonus = perPress(p, si, this.x2On(p, now)) * CFG.goldMult * comboMult(eff, p) * fz;
            got += bonus;
            this.golds.delete(si); this.goldNext.set(si, now + rnd(CFG.goldEvery[0], CFG.goldEvery[1]) * 1000);
            this.state.gold = [...this.golds.entries()].map(([i, x]) => i + ':' + x.k).join(';');
            p.golds++; s.stats.golds++;
            this.task(s, 'gold', 1);
            this.sendTo(s, 'golden', { got: r1(bonus), si, k });
            this.broadcast('goldfx', { s: client.sessionId, si, k }, { except: client });
        }
        p.presses++; s.stats.presses++;
        this.addClicks(s, got);
        this.task(s, 'press', 1);
        // the monitor's word: its next letter
        if (key.ch && key.ch === p.word[p.wi]) {
            p.wi++;
            if (p.wi >= p.word.length) this.wordDone(s, si, now);
        }
        this.dirty(s);
    }
    wordDone(s, si, now) {
        const p = s.profile, word = p.word;
        const got = perPress(p, si, this.x2On(p, now)) * CFG.wordMult * word.length;
        p.words++; p.wordN++; s.stats.words++;
        let gems = 0;
        if (p.words % 5 === 0) { gems = 2; p.gems += gems; }
        p.word = wordFor(p.tier, p.wordN, p.wseed); p.wi = 0;
        this.addClicks(s, got);
        this.task(s, 'words', 1);
        this.sendTo(s, 'word', { word, got: r1(got), gems, next: p.word });
        this.changed(s);
    }
    // a landing on a giant mouse's button: a MEGA CLICK
    onMega(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile, si = m.si | 0, st = SETUPS[si], L = s.last;
        if (!st || si > p.tier || now - s.megaAt < CFG.megaGap * 1000) return;
        if (mouseButton(si, L.x, L.z) < 0 || L.y < st.mouse.top - 0.6 || L.y > st.mouse.top + 3) return;
        s.megaAt = now;
        const eff = now - s.combo.at <= (comboGap(p) + CFG.comboSlack) * 1000 ? s.combo.eff : 0;
        const got = perPress(p, si, this.x2On(p, now)) * CFG.megaMult * comboMult(eff, p) * (this.frenzyOn(now) ? CFG.frenzyMult : 1);
        p.megas++; s.stats.megas++;
        this.addClicks(s, got);
        this.task(s, 'mega', 1);
        this.sendTo(s, 'mega', { got: r1(got), si, side: mouseButton(si, L.x, L.z) });
        this.broadcast('megafx', { s: client.sessionId, si, side: mouseButton(si, L.x, L.z) }, { except: client });
        this.dirty(s);
    }
    // ----- the Click Speed Test: 3, 2, 1, then ten seconds of clicking as fast as you can -----
    onSpeedGo(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.speed) return;
        const now = Date.now(), L = s.last;
        if (!onSpeedPad(L.x, L.z)) { this.toast(s, 'Stand on the Speed Test pad', RED); return; }
        if (now - s.speedEnd < CFG.speedGap * 1000) { this.toast(s, '⏱️ The test is ready again in ' + Math.ceil((CFG.speedGap * 1000 - (now - s.speedEnd)) / 1000) + 's', RED); return; }
        const at = now + 3000;
        s.speed = { at, end: at + CFG.speedSecs * 1000, n: 0 };
        this.sendTo(s, 'speedgo', { at, end: s.speed.end });
    }
    onTap(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !s.speed) return;
        const now = Date.now(), sp = s.speed;
        // (a click that left your screen in time may arrive a little late)
        if (now < sp.at - 150 || now > sp.end + 600) return;
        if (sp.n >= CFG.speedRate * CFG.speedSecs) return;
        if (!takeToken(sp, 'tap', now, CFG.speedRate, CFG.speedBurst)) return;
        sp.n++;
    }
    finishSpeed(s, now) {
        const p = s.profile, n = s.speed.n;
        s.speed = null; s.speedEnd = now;
        const got = Math.round(n * CFG.speedWorth * perPress(p, p.tier));
        const best = n > p.bestSpeed;
        let gems = 0;
        if (best && n >= 20) { gems = 5; p.gems += gems; }
        if (best) p.bestSpeed = n;
        p.speeds++; s.stats.speeds++;
        if (got) this.addClicks(s, got, false);
        this.task(s, 'speed', 1);
        if (n > 0) queueScore(p.uid, 'speed', n);
        this.sendTo(s, 'speeddone', { n, got, best, bestSpeed: p.bestSpeed, gems });
        this.changed(s);
        if (best) this.broadcastBoards();
    }
    // the quick ways round: to a keyboard you've got (m.i; your best one if none), to the spawn
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile;
        if (now - s.warpAt < 700 || s.speed) return;
        s.warpAt = now;
        let to;
        if (m.to === 'board') {
            const i = Number.isInteger(m.i) && m.i >= 0 && m.i <= p.tier ? m.i : p.tier, st = SETUPS[i];
            to = { x: st.x + rnd(-12, 12), y: KB_Y, z: st.z + KB_D / 2 - 4 };
        } else to = { x: SPAWN.x + rnd(-4, 4), y: 0, z: SPAWN.z };
        s.last = { x: to.x, y: to.y, z: to.z }; s.homeAt = now;
        this.sendTo(s, 'warped', to);
    }

    // ----- spending: upgrades, Buddy Boxes, Reboot, the wheel, the Gem shop -----
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId), u = upgradeById[m.id];
        if (!s || !u) return;
        const p = s.profile, n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (!this.payClicks(s, upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++; s.stats.ups++;
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    // a Buddy Box: you have to be at its machine, by a keyboard you've got
    onBox(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = boxById[m.id], n = m.n === 3 ? 3 : 1;
        if (!c) return;
        const at = SETUPS[c.tier].box;
        if (c.tier > p.tier) { this.toast(s, '🔒 Get the ' + BOARDS[c.tier].name + ' keyboard first', RED); return; }
        if (Math.hypot(s.last.x - at.x, s.last.z - at.z) > at.r + 9) { this.toast(s, 'Walk up to the Buddy Box', RED); return; }
        if (!this.payClicks(s, c.cost * n, c.name)) return;
        const out = [];
        for (let i = 0; i < n; i++) {
            let r = Math.random() * c.odds.reduce((a, x) => a + x, 0), j = 0;
            for (; j < c.buds.length - 1; j++) { r -= c.odds[j]; if (r < 0) break; }
            const id = c.buds[j];
            p.buds[id] = (p.buds[id] || 0) + 1;
            p.boxes++; s.stats.boxes++;
            this.task(s, 'boxes', 1);
            out.push({ id, isNew: p.buds[id] === 1 });
            this.autoEquip(p, id);
        }
        // every buddy of a box found: Gems, once
        if (!p.index[c.id] && c.buds.every((id) => p.buds[id] > 0)) { p.index[c.id] = 1; const g = INDEX_GEMS[c.tier] || 10; p.gems += g; this.sendTo(s, 'toastreward', { text: 'Collection complete: ' + c.name + '! +' + g + ' 💎' }); }
        this.sendTo(s, 'hatched', { c: c.id, out });
        this.changed(s);
    }
    autoEquip(p, id) {
        const max = teamSize(p), inTeam = p.team.filter((x) => x === id).length;
        if (inTeam >= p.buds[id]) return;
        if (p.team.length < max) { p.team.push(id); return; }
        let worst = 0;
        p.team.forEach((x, i) => { if (buddyById[x].mult < buddyById[p.team[worst]].mult) worst = i; });
        if (buddyById[id].mult > buddyById[p.team[worst]].mult) p.team[worst] = id;
    }
    onEquip(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || '');
        if (!buddyById[id] || !(p.buds[id] > 0)) return;
        const inTeam = p.team.filter((x) => x === id).length;
        if (m.off) { const i = p.team.indexOf(id); if (i >= 0) p.team.splice(i, 1); } else if (inTeam < p.buds[id] && p.team.length < teamSize(p)) p.team.push(id);
        else if (p.team.length >= teamSize(p)) this.toast(s, 'Your team is full: take one off first', RED);
        this.changed(s);
    }
    onEquipBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, all = [];
        for (const k of BUDDIES) for (let i = 0; i < Math.min(p.buds[k.id] || 0, 6); i++) all.push(k);
        all.sort((a, b) => b.mult - a.mult);
        p.team = all.slice(0, teamSize(p)).map((k) => k.id);
        this.changed(s);
    }
    onReboot(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, need = rebootNeed(p.reboots);
        if (p.boot < need) { this.toast(s, '🔄 Reboot needs ' + need.toLocaleString('en-US') + ' clicks this boot', RED); return; }
        p.reboots++; p.clicks = 0; p.boot = 0; p.tier = 0; p.gems += REBOOT_GEMS;
        // the upgrades go too (all but Buddy Slots): the climb back is a real one, with x1 more on every press for good
        for (const u of UPGRADES) if (!u.keep) delete p.ups[u.id];
        p.team = p.team.slice(0, teamSize(p));
        p.word = wordFor(0, p.wordN, p.wseed); p.wi = 0;
        s.stats.reboots++;
        const sx = SPAWN.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: SPAWN.z }; s.homeAt = Date.now();
        this.sendTo(s, 'rebooted', { r: p.reboots, x: sx, z: SPAWN.z, gems: REBOOT_GEMS });
        this.changed(s);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins < 1) return;
        p.spins--; p.spinsUsed++;
        let r = Math.random() * SPIN.reduce((a, x) => a + x.w, 0), i = 0;
        for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; }
        const got = this.giveReward(s, SPIN[i]);
        this.task(s, 'spins', 1);
        this.sendTo(s, 'spun', { i, text: rewardText(got) });
        this.changed(s);
    }
    onPack(client, m) {
        const s = this.sessions.get(client.sessionId), k = s && PACKS.find((x) => x.id === m.id);
        if (!k || !this.payGems(s, k.gems, 'a Click Pack')) return;
        const got = this.giveReward(s, { taps: k.taps });
        this.toast(s, '+' + rewardText(got, true) + '!', GOLD);
        this.changed(s);
    }
    onX2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostX2Gems, 'x2 Clicks')) return;
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.boostX2Mins * 60000;
        this.toast(s, '⚡ x2 Clicks for ' + CFG.boostX2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    // the FREE x2 Clicks: a rewarded ad watched, checked with Boxity (the token works once, for this game)
    async onAdX2(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.adAsking || typeof m.token !== 'string') return;
        s.adAsking = true;
        const ok = await verifyAdReward(m.token);
        s.adAsking = false;
        if (!this.sessions.has(client.sessionId)) return;
        if (!ok) { this.sendTo(s, 'adx2', { ok: false }); return; }
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.adX2Mins * 60000;
        this.sendTo(s, 'adx2', { ok: true, mins: CFG.adX2Mins });
        this.changed(s);
    }

    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        const got = this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(got, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        // only the marks the game sets (a keyboard visited: kb1..kb8), never anything a client makes up (its save would grow without end)
        if (typeof m.seen === 'string' && /^kb[1-8]$/.test(m.seen)) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        for (const e of arr(m.errs).slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key) => topProfiles(key).filter((p) => (p[key] || 0) > 0).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const m = { clicks: row('total'), speed: row('bestSpeed') };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.clicks)) { p.clicks += m.clicks; p.total += Math.max(0, m.clicks); }
        if (finite(m.boot)) this.addClicks(s, m.boot);
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.tier)) { p.tier = clamp(m.tier | 0, 0, BOARDS.length - 1); p.boot = Math.max(p.boot, BOARDS[p.tier].need); p.bestTier = Math.max(p.bestTier, p.tier); }
        if (finite(m.reboots)) p.reboots = clamp(m.reboots | 0, 0, 99);
        if (finite(m.spins)) p.spins = clamp(m.spins | 0, 0, 99);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.ups && typeof m.ups === 'object') for (const id of Object.keys(m.ups)) { const u = upgradeById[id]; if (u) p.ups[id] = clamp(m.ups[id] | 0, 0, u.max); }
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (typeof m.word === 'string' && /^[A-Z]{3,10}$/.test(m.word)) { p.word = m.word; p.wi = 0; }
        if (m.gold) { const si = clamp(m.gold.si | 0, 0, SETUPS.length - 1); this.golds.set(si, { k: clamp(m.gold.k | 0, 0, KEYS.length - 1), until: Date.now() + 15000 }); this.state.gold = [...this.golds.entries()].map(([i, x]) => i + ':' + x.k).join(';'); }
        if (Array.isArray(m.team)) { const ids = m.team.filter((id) => buddyById[id]).slice(0, 6); for (const id of ids) p.buds[id] = Math.max(1, p.buds[id] || 0); if (ids.length > teamSize(p)) p.ups.slots = Math.min(3, ids.length - 3); p.team = ids; }
        if (m.frenzy) { this.state.frenzy = Date.now() + CFG.frenzySecs * 1000; this.broadcast('frenzy', { until: this.state.frenzy }); }
        if (finite(m.tut)) p.tut = m.tut | 0;
        // a QA teleport: where the next move is checked from
        if (Array.isArray(m.tp) && m.tp.every(finite)) { s.last = { x: m.tp[0], y: m.tp[1], z: m.tp[2] }; s.lastAt = Date.now(); s.homeAt = 0; s.moveB = undefined; }
        this.changed(s);
    }

    // ----- the bots: a few typists on the first keyboards when it's quiet (each real player sends one home) -----
    fillBots() {
        const want = Math.max(0, CFG.bots - this.sessions.size);
        while (this.bots.length > want) { const b = this.bots.pop(); this.state.players.delete(b.id); }
        const used = new Set([...this.state.players.values()].map((p) => p.name));
        while (this.bots.length < want) {
            const id = 'bot' + Math.floor(Math.random() * 1e9);
            let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            for (let i = 0; used.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (i > 10 ? i : '');
            used.add(name);
            const tier = Math.floor(Math.random() * 3), st = SETUPS[tier], pl = new PlayerState(), tc = Math.floor(Math.pow(10, rnd(2.5, 6)));
            Object.assign(pl, { name, bot: true, pid: this.freePid(), tier, tc, title: titleOf(tc), x: st.x + rnd(-25, 25), y: KB_Y, z: st.z + rnd(-8, 8), t: Date.now() });
            pl.team = Math.random() < 0.6 ? BUDDIES[Math.floor(Math.random() * 8)].id : '';
            pl.av = botAvatar();
            this.state.players.set(id, pl);
            this.bots.push({ id, pl, body: newBody(pl.x, KB_Y, pl.z), goal: null, until: 0, next: 0, st });
        }
    }
    // back and forth over the keys, with a hop now and then; on to another keyboard after a while
    driveBot(b, now, dt) {
        const body = b.body, pl = b.pl;
        const inp = { mx: 0, mz: 0, jump: false, hold: true, power: CFG.power, double: false, speed: 0.85 };
        if (!b.goal || now > b.until) {
            if (Math.random() < 0.12) b.st = SETUPS[Math.floor(Math.random() * 3)];
            b.goal = { x: b.st.x + rnd(-36, 36), z: b.st.z + rnd(-11, 11) };
            b.until = now + rnd(1200, 3500);
        }
        const dx = b.goal.x - body.x, dz = b.goal.z - body.z, d = Math.hypot(dx, dz);
        if (d > 1.2) { inp.mx = dx / d; inp.mz = dz / d; } else b.goal = null;
        if (body.onGround && now >= b.next) { if (Math.random() < 0.3) inp.jump = true; b.next = now + rnd(700, 2200); }
        stepBody(body, inp, dt, this.world);
        pl.x = body.x; pl.y = body.y; pl.z = body.z; pl.t = now;
        if (Math.abs(body.vx) + Math.abs(body.vz) > 1) pl.ry = Math.atan2(body.vx, body.vz);
        pl.anim = !body.onGround ? 2 : Math.abs(body.vx) + Math.abs(body.vz) > 2 ? 1 : 0;
    }

    // your Auto Typer kept typing while you were away (on joining, and on signing in to your account mid-game)
    payAway(client, profile, now) {
        const away = profile.lastSeen ? (now - profile.lastSeen) / 1000 : 0;
        if (away > 300 && profile.presses > 20) {
            const secs = Math.min(away, CFG.offlineHours * 3600), rate = CFG.offlineRate + CFG.offlineAuto * autoRate(profile);
            const got = Math.round(secs * rate * perPress(profile, profile.tier));
            if (got > 0) { profile.clicks += got; profile.total += got; client.send('offline', { got, mins: Math.round(secs / 60) }); }
        }
        profile.lastSeen = now;
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        guestProfile.lastSeen = Date.now();
        this.flushBoards(s);
        await adoptGuestProgress(uid, guestProfile.uid, name, legion.carriedFrom);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        this.payAway(client, s.profile, Date.now());
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        s.player.bx = legion.id;
        s.ack = 0;
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !m || now - (s.avAt || 0) < 500) return;
        s.avAt = now;
        s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40 || now - (s.emoteAt || 0) < 700) return;
        s.emoteAt = now;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    // (only when the page has no Boxity chat: Boxity relays and draws chat itself)
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { if (o.recon) o.recon.reject(false); else o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
