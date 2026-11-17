// The HUD (Gems and the menu on the left, the bar to your next keyboard, the word to type and your quest at the top, the FREE gift,
// 2x Clicks, Auto Typer and TO KEYS on the right, your combo and Clicks at the bottom), the Buddy Box reveal, the Speed Test's clock and
// result, and every panel: Desk Buddies, a Buddy Box, the Tech Shop, the Prize Wheel, Reboot, Keyboards, the Shop (Gems, codes),
// Quests, the daily reward, gifts, leaderboards, settings. Prices are Clicks or Gems only.
import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume, playAsmr } from './audio.js';
import { setQuality, getQuality } from './fx.js';
import { buddyIcon } from './buddies.js';
import {
    CFG, BOARDS, RARITIES, SPIN, UPGRADES, upgradeCost, BUDDIES, buddyById, BOXES, boxById, rebootNeed, rebootMult, buddyMult, perPress, teamSize, tierFor,
    TASKS, QUESTS, DAILY, dailyStatus, dayLeft, GIFTS, PACKS, rewardText, clock, fmtComma, fmt, comboMult, REBOOT_GEMS, ODDS, LEADERBOARDS,
} from '../../shared/config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const rar = (r) => `<span class="rar" style="color:${RARITIES[r].color}">${RARITIES[r].name}</span>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const CC = '<i class="cc"></i>';
// a drawn icon (icons.js) for a panel's title
const IC = (k) => '<i class="ic ic-' + k + ' pic"></i>';
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
const fmt1 = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
const img = (id, cls) => `<img src="${buddyIcon(id)}" alt="" class="buddyImg ${cls || ''}">`;

// =====================================================================================
// Small things: toasts, big words, pop-ups
// =====================================================================================
// starts a CSS animation over without asking the page for its layout: the class comes back on the next frame
function replay(el) { el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); }
// (the same line twice within a few seconds shows once; never more than three at a time)
const toastSeen = new Map();
export function toast(text, color) {
    const now = performance.now();
    if (now - (toastSeen.get(text) || -1e9) < 3500) return;
    toastSeen.set(text, now);
    if (toastSeen.size > 40) for (const [k, v] of toastSeen) if (now - v > 3500) toastSeen.delete(k);
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast o1'; el.textContent = text; el.style.color = color || '#fff';
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
}
// The big words in the middle of the screen: one at a time, each held a moment, never on top of a pop-up (they wait for it)
const bigQueue = [];
let bigBusyUntil = 0, popupUntil = 0;
export function bigText(text, color) {
    if (bigQueue.length && bigQueue[bigQueue.length - 1][0] === text) return;
    bigQueue.push([text, color]);
    if (bigQueue.length > 3) bigQueue.shift();
    pumpBig();
}
function pumpBig() {
    const now = performance.now();
    if (!bigQueue.length) return;
    const wait = Math.max(bigBusyUntil, popupUntil) - now;
    if (wait > 0) { clearTimeout(pumpBig.t); pumpBig.t = setTimeout(pumpBig, wait + 30); return; }
    const [text, color] = bigQueue.shift(), el = $('#bigText');
    el.textContent = text; el.style.color = color || '#ffe24a';
    el.hidden = false; replay(el);
    bigBusyUntil = now + 1500;
    clearTimeout(bigText.t); bigText.t = setTimeout(() => { el.hidden = true; }, 2300);
    if (bigQueue.length) { clearTimeout(pumpBig.t); pumpBig.t = setTimeout(pumpBig, 1530); }
}
// sub may hold the drawn icons (html)
export function popup(icon, title, sub, color, html) {
    const el = $('#popup');
    // (the big words make way)
    $('#bigText').hidden = true; popupUntil = performance.now() + 2700;
    $('#popIc').textContent = icon; $('#popT').textContent = title; $('#popT').style.color = color || '#ffe24a';
    if (html) $('#popS').innerHTML = sub || ''; else $('#popS').textContent = sub || '';
    el.hidden = false; replay(el);
    clearTimeout(popup.t); popup.t = setTimeout(() => { el.hidden = true; }, 3000);
}
export function notEnough(m) {
    sfx('denied');
    const gems = m.cur === 'gems';
    askConfirm(gems ? '💎' : '🖱️', 'Not enough ' + (gems ? 'Gems' : 'Clicks'), `You need ${fmtComma(m.need)} more ${gems ? 'Gems' : 'Clicks'} for ${esc(m.name)}.` + (gems ? '<br><small>Gems come from quests, daily tasks, gifts, the wheel, words and the daily reward.</small>' : '<br><small>Stomp more keys: run across them, jump on them, type the word, grab the Golden Key.</small>'),
        gems ? 'Quests' : 'OK', () => { if (gems) openPanel('quests'); });
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); if (m.ok) sfx('reward'); else sfx('denied'); }

// =====================================================================================
// The HUD (written only when a value changes; the bars move with transforms)
// =====================================================================================
const shown = { c: 0, g: 0 }, shownTxt = { c: '', g: '' };
let barShown = -1, comboShown = -1, comboKey = '';
export function animateCounters(dt) {
    // Clicks and Gems count up quickly
    const kf = Math.min(1, dt * 14);
    for (const [key, v, sel, f] of [['c', S.clicks, '#clickVal', fmtClicks], ['g', S.gems, '#gemVal', fmtComma]]) {
        const target = v || 0;
        shown[key] += (target - shown[key]) * kf;
        if (Math.abs(target - shown[key]) < 0.05) shown[key] = target;
        const txt = f(shown[key]);
        if (txt !== shownTxt[key]) { shownTxt[key] = txt; $(sel).textContent = txt; }
    }
    // the bar to the next keyboard
    const t = S.tier || 0, next = BOARDS[t + 1], boot = S.boot || 0;
    const f = next ? Math.min(1, Math.max(0, (boot - BOARDS[t].need) / (next.need - BOARDS[t].need))) : 1;
    if (Math.abs(f - barShown) > 0.002) { barShown = f; $('#kbFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; }
    put('#kbNum', next ? fmtComma(Math.floor(boot)) + ' / ' + fmtComma(next.need) : fmtComma(Math.floor(boot)) + ' clicks');
}
const fmtClicks = (v) => (v < 100000 ? fmtComma(Math.floor(v)) : fmt(v));
// the combo meter: its multiplier, how far to the next step, it fades out when it drops
export function setComboHud(n, frac) {
    const on = n >= 3;
    const k = on ? 'x' + comboMult(n, S).toFixed(2).replace(/\.?0+$/, '') + ' · ' + n : '';
    if (k !== comboKey) {
        comboKey = k;
        $('#combo').classList.toggle('on', on);
        if (on) { const m = comboMult(n, S); put('#comboTxt', 'COMBO ' + k); $('#comboTxt').classList.toggle('hot', m >= 2); }
    }
    const f = on ? Math.max(0, Math.min(1, frac)) : 0;
    if (Math.abs(f - comboShown) > 0.01) { comboShown = f; $('#comboFill').style.transform = 'scaleX(' + f.toFixed(2) + ')'; }
}
// a springy pop (an animation of its own: no class toggling, so no layout read)
const POP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }];
export function bump(sel) { const el = $(sel); if (el && el.animate) el.animate(POP, { duration: 420, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' }); }
// every press: the Clicks counter ticks
const TICK = [{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.4 }, { transform: 'scale(1)' }];
let tickAt = 0;
export function pressTick() { const now = performance.now(); if (now - tickAt < 110) return; tickAt = now; const el = $('#clickTxt'); if (el.animate) el.animate(TICK, { duration: 160, easing: 'ease-out' }); }
// a big win: little cursors burst out of the middle of the screen and stream into the Clicks counter
let clicksAt = null, flying = 0;
export function flyClicks(n) {
    if (!clicksAt || flying > 24) return;
    const box = $('#flyLayer'), k = Math.min(6, Math.max(3, n));
    const fx = innerWidth / 2, fy = innerHeight * 0.42;
    for (let i = 0; i < k; i++) {
        const el = document.createElement('i');
        el.className = 'cc';
        box.appendChild(el);
        flying++;
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80, sx = fx + Math.cos(a) * r, sy = fy + Math.sin(a) * r * 0.7;
        const at = (x, y, sc) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) translate(-50%,-50%) scale(' + sc + ')';
        const anim = el.animate([
            { transform: at(fx, fy, 0.2), opacity: 0 },
            { transform: at(sx, sy, 1.3), opacity: 1, offset: 0.3 },
            { transform: at(clicksAt.x, clicksAt.y, 0.75), opacity: 1 },
        ], { duration: 760 + i * 55, delay: i * 45, easing: 'cubic-bezier(0.45, 0, 0.65, 1)', fill: 'both' });
        anim.onfinish = () => { el.remove(); flying--; bump('#clickTxt'); playAsmr('step', 0.12, 1.4 + i * 0.05); };
    }
}
// the guide for someone new: one step at a time, in the quest's place (text, step, steps, what to light up on the HUD)
let tutorial = null;
export function setTutorial(t) { tutorial = t; updateHud(); }
// KEY FRENZY: seconds left (0: none)
let frenzyLeft = 0;
export function setFrenzy(left) { const l = Math.ceil(left); if (l === frenzyLeft) return; frenzyLeft = l; updateHud(); }
const put = (sel, v, html) => { const el = $(sel); if (!el) return; if (html) { if (el.innerHTML !== v) el.innerHTML = v; } else if (el.textContent !== v) el.textContent = v; };
let wordKey = '';
export function updateHud() {
    // the keyboard bar's words
    const t = S.tier || 0, next = BOARDS[t + 1];
    put('#barTitle', frenzyLeft > 0 ? '⚡ KEY FRENZY! x3 CLICKS · ' + frenzyLeft + 's' : next ? 'Stomp keys to get a new keyboard!' : 'Every keyboard is yours!');
    $('#barTitle').classList.toggle('frenzy', frenzyLeft > 0);
    put('#kbNext', next ? 'Next: ' + next.name + ' x' + fmt(next.mult) : (S.boot >= rebootNeed(S.reboots) ? '🔄 Ready to Reboot!' : 'Reboot for x' + rebootMult((S.reboots || 0) + 1) + ' at ' + fmt(rebootNeed(S.reboots))));
    $('#kbBar').classList.toggle('max', !next);
    // the word to type
    const w = S.word || '', k = w + ':' + (S.wi || 0);
    if (k !== wordKey) {
        wordKey = k;
        put('#wordLetters', w.split('').map((ch, i) => `<i class="wl2${i < S.wi ? ' d' : i === S.wi ? ' n' : ''}">${ch}</i>`).join(''), true);
    }
    // the quest
    const Q = QUESTS[S.qi], ql = $('#questLine');
    ql.classList.toggle('tut', !!tutorial);
    $('#kbBar').classList.toggle('hl', !!tutorial && tutorial.hl === 'bar');
    $('#wordChip').classList.toggle('hl', !!tutorial && tutorial.hl === 'word');
    $('#wordChip').classList.toggle('early', !!tutorial && tutorial.step < 3);
    if (tutorial) {
        put('#questLine', 'STEP ' + (tutorial.step + 1) + '/' + tutorial.of + ' · ' + tutorial.text);
        ql.classList.remove('ready');
        ql.hidden = false;
    } else if (Q) {
        const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
        put('#questLine', ready ? '✅ ' + Q.text + ' · Claim!' : '🎯 ' + Q.text + ' ' + fmt(p) + '/' + fmt(Q.n));
        $('#questLine').classList.toggle('ready', ready);
        $('#questLine').hidden = false;
    } else $('#questLine').hidden = true;
    // FOR FREE: the next playtime gift
    const secs = sessionSecs(), gi = GIFTS.findIndex((g, i) => !S.gifts[i]);
    const gb = $('#bGift');
    if (gi < 0) gb.hidden = true;
    else {
        gb.hidden = false;
        const left = GIFTS[gi].min * 60 - secs;
        gb.classList.toggle('ready', left <= 0);
        put('#giftTxt', left <= 0 ? 'CLAIM!' : clock(left));
        put('#giftWhat', rewardText(giftShown(GIFTS[gi])), true);
    }
    // x2 (Gems, or FREE for an ad), the Auto Typer
    const x2 = (S.x2Until || 0) > net.now();
    put('#x2Txt', x2 ? clock(((S.x2Until || 0) - net.now()) / 1000) + ' left' : '💎 ' + CFG.boostX2Gems + ' for ' + CFG.boostX2Mins + ' min');
    $('#bX2').classList.toggle('on', x2);
    const adOk = !!(actions.adsOk && actions.adsOk());
    $('#bAdX2').hidden = !adOk;
    put('#adX2Txt', 'FREE · ' + CFG.adX2Mins + ' min, watch an ad');
    const auto = (S.ups && S.ups.auto) || 0, ab = $('#bAuto');
    ab.classList.toggle('buy', !auto);
    ab.classList.toggle('on', !!auto && !!S.autoOn);
    put('#autoTxt', !auto ? fmt(upgradeCost(UPGRADES.find((u) => u.id === 'auto'), 0)) + ' Clicks' : S.autoOn ? 'ON · ' + auto + ' a second' : 'OFF · tap to start');
    // what a press gives
    const b = S.onBoard >= 0 && S.onBoard <= t ? S.onBoard : t, got = perPress(S, b, x2);
    put('#mClick', '+' + fmt1(got) + ' a press');
    put('#mReb', S.reboots ? 'x' + rebootMult(S.reboots) + ' Reboot' : '');
    const pm = buddyMult(S);
    put('#mPals', pm > 1 ? 'x' + (Math.round(pm * 100) / 100) + ' Buddies' : '');
    put('#mX2', x2 ? 'x2!' : '');
    put('#goBoardTxt', BOARDS[t].name + ' x' + fmt(BOARDS[t].mult));
    // badges: something to do
    const ds = dailyStatus(S.daily, net.now());
    setBadge('#bDaily', ds.can ? '!' : '');
    const list = (S.jq && S.jq.list) || [];
    setBadge('#bQuests', (list.some((q) => !q.c && TASKS[q.k] && q.p >= TASKS[q.k].n) || (Q && (S.qv || 0) >= Q.n)) ? '!' : '');
    setBadge('#bSpin', S.spins > 0 ? String(S.spins) : '');
    setBadge('#bReboot', S.boot >= rebootNeed(S.reboots) ? '!' : '');
    const canUp = UPGRADES.some((u) => { const n = (S.ups && S.ups[u.id]) || 0; return n < u.max && S.clicks >= upgradeCost(u, n); });
    setBadge('#bTech', canUp ? '!' : '');
    const box = BOXES[t];
    setBadge('#bBuddies', !S.boxes && S.clicks >= BOXES[0].cost ? 'NEW' : '');
    void box;
    tickPanel();
}
// a gift named in presses, in clicks for you now (what the server will give)
function giftShown(g) { return g.taps ? { ...g, clicks: Math.round(g.taps * perPress(S, S.tier || 0)), taps: 0 } : g; }
// The open panel's timers, written once a second on their own: a panel rebuilt under a finger loses the tap, and a rebuild
// from the frame loop means a layout. It's rebuilt only when what it shows changes (a gift's time comes).
function tickPanel() {
    const m = $('#modal');
    if (m.hidden || !panelKind) return;
    const set = (sel, text) => { const el = m.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    if (panelKind === 'quests') set('[data-t="day"]', 'Resets in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'daily') set('[data-t="daily"]', 'Next reward in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'spin' && !spinning) {
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        set('[data-t="spin"]', S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left));
    } else if (panelKind === 'gifts') {
        const secs = sessionSecs();
        for (let i = 0; i < GIFTS.length; i++) {
            if (S.gifts[i]) continue;
            const left = GIFTS[i].min * 60 - secs, b = m.querySelector('[data-act="gift"][data-i="' + i + '"]');
            if (!b) continue;
            if (left <= 0 && b.disabled) { renderPanel(); return; }
            if (left > 0) set('[data-act="gift"][data-i="' + i + '"]', clock(left));
        }
    }
}
function setBadge(sel, text) {
    const el = $(sel);
    let b = el.querySelector('.badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
    if (b.textContent !== text) b.textContent = text;
}
export function measureHud() {
    const w = $('#clickTxt .cc').getBoundingClientRect(); if (w.width > 0) clicksAt = { x: w.left + w.width / 2, y: w.top + w.height / 2 };
}

// =====================================================================================
// The Speed Test: 3, 2, 1, GO, the clock and your count; the result card
// =====================================================================================
export function speedHud(on, big, sub, go) {
    const el = $('#speedHud');
    el.hidden = !on;
    if (!on) return;
    if ($('#speedBig').textContent !== big) { $('#speedBig').textContent = big; if (go) replay($('#speedBig')); }
    put('#speedSub', sub);
}
export function speedResult(m, onClose) {
    const el = $('#speedRes');
    el.innerHTML = `<div class="panel"><header><h2 class="o">⏱️ Speed Test</h2><div class="hx"><button class="btn g-red o x" data-close>✕</button></div></header><div></div>
        <div class="srBody"><span class="srN o">${m.n}</span><span class="srS o1">clicks in ${CFG.speedSecs} seconds · ${(m.n / CFG.speedSecs).toFixed(1)} a second</span>
        ${m.best ? '<span class="srBest o">NEW BEST!' + (m.gems ? ' +' + m.gems + ' 💎' : '') + '</span>' : `<span class="srS o1">Your best: ${m.bestSpeed}</span>`}
        <span class="srS o1">+${fmt(m.got)} ${CC}</span>
        <div class="btns" style="display:flex;gap:.6rem;margin-top:.4rem"><button class="btn g-green o" data-again style="min-width:8rem;height:2.8rem;font-size:1.2rem">Again</button><button class="btn g-blue o" data-ranks style="min-width:8rem;height:2.8rem;font-size:1.2rem">Ranks</button></div></div><div></div></div>`;
    el.hidden = false;
    const close = () => { el.hidden = true; if (onClose) onClose(); };
    el.querySelector('[data-close]').onclick = () => { sfx('close'); close(); };
    el.querySelector('[data-again]').onclick = () => { sfx('click'); close(); if (actions.speed) actions.speed(); };
    el.querySelector('[data-ranks]').onclick = () => { sfx('click'); close(); openPanel('ranks'); };
    el.onclick = (e) => { if (e.target === el) close(); };
}
export const speedResultOpen = () => !$('#speedRes').hidden;

// =====================================================================================
// A Buddy Box opening: they shake, they burst, your buddies
// =====================================================================================
let hatchT = 0;
export function showHatch(boxId, out, auto) {
    const c = boxById[boxId], box = $('#hatchCaps'), H = $('#hatch');
    clearTimeout(hatchT);
    box.innerHTML = out.map(() => `<div class="hc"><div class="cap" style="--cc:${hex(c.color)};border-radius:1rem;background:linear-gradient(#e8b878 0 46%, ${hex(c.color)} 46% 58%, #d8a868 58%)"></div></div>`).join('');
    $('#hatchOk').hidden = true;
    H.hidden = false;
    sfx('shake');
    hatchT = setTimeout(() => {
        sfx('crack');
        box.innerHTML = out.map((o) => { const k = buddyById[o.id]; return `<div class="hc">${o.isNew ? '<span class="newb o1">NEW!</span>' : ''}<img src="${buddyIcon(k.id)}" alt=""><b class="o">${esc(k.name)}</b><small class="o1">${rar(k.rarity)} · x${k.mult}</small></div>`; }).join('');
        $('#hatchOk').hidden = false;
        if (actions.onHatched) actions.onHatched(out);
        if (auto) hatchT = setTimeout(closeHatch, 1300);
    }, 720);
}
export function closeHatch() { clearTimeout(hatchT); $('#hatch').hidden = true; if (actions.afterHatch) actions.afterHatch(); }
export const hatchOpen = () => !$('#hatch').hidden;
$('#hatchOk').addEventListener('click', () => { sfx('click'); closeHatch(); });

// =====================================================================================
// Panels
// =====================================================================================
let panelKind = null, panelTab = null, panelArg = null, spinning = false, wheelAngle = 0;
export function openPanel(kind, tab) {
    panelKind = kind; panelTab = tab || null;
    if (kind === 'box') { panelArg = tab; panelTab = null; }
    $('#modal').hidden = false;
    renderPanel();
    sfx('open');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true, kind);
}
export function closePanel() {
    if ($('#modal').hidden) return false;
    $('#modal').hidden = true; panelKind = null; renderedKind = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setMusicDuck(false);
    if (actions.onPanel) actions.onPanel(false);
    sfx('close');
    return true;
}
export const panelIs = (k) => !$('#modal').hidden && panelKind === k;
export function refreshPanels() { if (!$('#modal').hidden && !(panelKind === 'spin' && spinning)) renderPanel(); }
function frame(title, icon, body, opts) {
    opts = opts || {};
    return `<div class="panel ${opts.cls || ''}"${opts.w ? ` style="width:min(${opts.w}rem,94vw)"` : ''}>
        <header><h2 class="o">${icon} ${title}</h2><div class="hx">${opts.hx || ''}<button class="btn g-red o x" data-close>✕</button></div></header>
        ${opts.tabs ? `<div class="tabs">${opts.tabs.map(([k, l]) => `<button class="tab o1${k === opts.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '<div></div>'}
        <div class="body">${body}</div>${opts.foot ? `<div class="foot">${opts.foot}</div>` : '<div></div>'}</div>`;
}
let renderedKind = null, renderedHtml = '';
function renderPanel() {
    const m = $('#modal');
    const again = renderedKind === panelKind && !m.hidden && m.firstElementChild;
    const html = PANELS[panelKind] ? PANELS[panelKind]() : '';
    if (again && html === renderedHtml) return;
    renderedHtml = html;
    const scroller = again && m.querySelector('.body'), keep = scroller ? scroller.scrollTop : 0;
    m.innerHTML = html;
    renderedKind = panelKind;
    // a refresh of the open panel (a timer, a new value): no pop-in again, the scroll stays where it was
    if (again && m.firstElementChild) { m.firstElementChild.classList.add('still'); const b2 = m.querySelector('.body'); if (b2 && keep) b2.scrollTop = keep; }
    const x = m.querySelector('[data-close]');
    if (x) x.onclick = () => closePanel();
    m.onclick = (e) => { if (e.target === m) closePanel(); };
    for (const b of m.querySelectorAll('[data-tab]')) b.onclick = () => { panelTab = b.dataset.tab; sfx('click'); renderPanel(); };
    for (const b of m.querySelectorAll('[data-act]')) b.onclick = (e) => { e.stopPropagation(); doAct(b.dataset.act, b.dataset); };
    const code = m.querySelector('#codeIn');
    if (code) code.onkeydown = (e) => { if (e.key === 'Enter') doAct('code', {}); };
    for (const r of m.querySelectorAll('input[type=range]')) { r.oninput = () => setVolume(r.dataset.vol, r.value / 100); r.onchange = () => { if (r.dataset.vol === 'music' && actions.saveSetting) actions.saveSetting({ music_volume: +r.value }); }; }
}
// a wheel prize's label
const spinLabel = (s) => (s.taps ? CC + ' ' + (s.taps >= 600 ? 'HUGE' : s.taps >= 180 ? 'BIG' : 'Clicks') : s.gems ? '💎 ' + s.gems : s.x2 ? 'x2 ' + s.x2 + 'm' : '');
const budCard = (k, inTeam, count) => `<div class="card${inTeam ? ' on' : ''}">${count > 1 ? `<span class="palN o1">x${count}</span>` : ''}<div class="ci">${img(k.id)}</div><b class="o1">${esc(k.name)}</b><small>${rar(k.rarity)}</small><span class="palX o1">x${k.mult}</span>
    ${inTeam ? `<button class="btn g-red o1" data-act="unequip" data-id="${k.id}">Take off</button>` : `<button class="btn g-green o1" data-act="equip" data-id="${k.id}">Equip</button>`}</div>`;
const PANELS = {
    buddies() {
        const tab = panelTab || 'team', team = S.team || [], mult = Math.round(buddyMult(S) * 100) / 100;
        let body = '';
        if (tab === 'team') {
            const owned = BUDDIES.filter((k) => (S.buds || {})[k.id] > 0).sort((a, b) => b.mult - a.mult);
            body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">Team: ${team.length} / ${teamSize(S)} · every press x${mult} <button class="btn g-blue o1" data-act="equipbest" style="margin-left:.5rem;padding:.15rem .7rem;font-size:.95rem">Equip best</button></p>`;
            body += owned.length ? '<div class="grid">' + owned.map((k) => budCard(k, team.includes(k.id), S.buds[k.id])).join('') + '</div>' : '<p class="o1" style="font-weight:700">No Desk Buddies yet. Walk up to the Buddy Box in front of a keyboard and open one!</p>';
        } else {
            body = BOXES.map((c) => {
                const seen = c.buds.filter((id) => (S.buds || {})[id] > 0).length;
                return `<div class="row"><div class="rt"><b class="o1">${esc(c.name)} ${seen === c.buds.length ? '✅' : ''}</b><small>${seen} / ${c.buds.length} found${S.index && S.index[c.id] ? ' · collection reward claimed' : ' · find them all for Gems'} · by the ${esc(BOARDS[c.tier].name)} keyboard</small></div><div class="rb">${c.buds.map((id) => { const k = buddyById[id], got = (S.buds || {})[id] > 0; return `<span style="width:3rem;height:3rem;display:inline-block" title="${esc(got ? k.name : '???')}">${img(id, got ? '' : 'dim')}</span>`; }).join('')}</div></div>`;
            }).join('');
        }
        return frame('Desk Buddies', IC('pals'), body, { tabs: [['team', 'My Team'], ['index', 'Index']], tab, foot: 'Desk Buddies multiply every press. Each keyboard has its own Buddy Box in front of it.' });
    },
    box() {
        const c = boxById[panelArg];
        if (!c) return '';
        const total = ODDS.reduce((a, x) => a + x, 0), locked = c.tier > (S.tier || 0);
        const odds = c.buds.map((id, j) => { const k = buddyById[id], got = (S.buds || {})[id] > 0; return `<div class="card"><div class="ci">${img(id, got ? '' : 'dim')}</div><b class="o1">${got ? esc(k.name) : '???'}</b><small>${rar(k.rarity)}</small><span class="palX o1">x${k.mult} · ${Math.round(c.odds[j] / total * 1000) / 10}%</span></div>`; }).join('');
        const can1 = S.clicks >= c.cost && !locked, can3 = S.clicks >= c.cost * 3 && !locked;
        const body = `<div class="capOdds">${odds}</div>${locked ? `<p class="o1" style="text-align:center;font-weight:700;color:#ffb0a0">🔒 Get the ${esc(BOARDS[c.tier].name)} keyboard to open this box</p>` : `<div class="capBtns"><button class="btn ${can1 ? 'g-green' : 'g-grey'} o" data-act="hatch" data-n="1">Open 1 · ${CC} ${fmt(c.cost)}</button><button class="btn ${can3 ? 'g-yellow' : 'g-grey'} o" data-act="hatch" data-n="3">Open 3 · ${CC} ${fmt(c.cost * 3)}</button></div>`}
            <p class="o1" style="margin:.6rem 0 0;text-align:center;font-weight:700">You have ${CC} ${fmtComma(S.clicks)}</p>`;
        return frame(esc(c.name), IC('pals'), body, { w: 38 });
    },
    tech() {
        const body = UPGRADES.map((u) => {
            const n = (S.ups && S.ups[u.id]) || 0, max = n >= u.max, cost = upgradeCost(u, n), can = !max && S.clicks >= cost;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${u.icon}</span></div><div class="rt"><b class="o1">${esc(u.name)} <small style="display:inline;font-weight:700;color:#7dff6b">${u.stat(n)}</small></b><small>${esc(u.text)}</small><div class="prog"><i style="width:${(n / u.max * 100).toFixed(0)}%"></i></div></div><div class="rb"><button class="btn ${max ? 'g-grey' : can ? 'g-green' : 'g-grey'} o1" data-act="upgrade" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? 'MAX' : CC + ' ' + fmt(cost)}</button></div></div>`;
        }).join('');
        return frame('Tech Shop', IC('work'), body, { hx: `<span class="o1">${CC} ${fmtComma(S.clicks)}</span>`, foot: 'A Reboot takes your upgrades back to nothing (Buddy Slots stay).' });
    },
    spin() {
        const n = SPIN.length, seg = 360 / n;
        const grad = SPIN.map((s, i) => `${s.color} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`).join(',');
        const labels = SPIN.map((s, i) => `<span class="wl" style="transform:rotate(${((i + 0.5) * seg).toFixed(2)}deg)"><b class="o1">${spinLabel(s)}</b></span>`).join('');
        const left = Math.max(0, (S.spinIn || 0) - (Date.now() - S.profileAt) / 1000);
        const body = `<div class="wheelWrap"><div class="wptr"></div><div class="wheel" id="wheel" style="background:conic-gradient(${grad});transform:rotate(${wheelAngle}deg)">${labels}</div><div class="whub o">SPIN</div></div>
            <div style="text-align:center;margin-top:.8rem"><button class="btn ${S.spins > 0 ? 'g-green' : 'g-grey'} o" data-act="spin" ${S.spins > 0 && !spinning ? '' : 'disabled'} style="min-width:12rem;height:3.2rem;font-size:1.5rem">${S.spins > 0 ? 'Spin! (' + S.spins + ')' : 'No spins left'}</button>
            <p class="o1" data-t="spin" style="margin:.5rem 0 0;font-weight:700">${S.spins >= CFG.spinMax ? 'Spins full: use one!' : 'Next free spin in ' + clock(left)}</p></div>`;
        return frame('Prize Wheel', IC('spin'), body, { w: 30, foot: 'A free spin every ' + CFG.spinMins + ' minutes of play (up to ' + CFG.spinMax + ' saved). Click prizes grow with your keyboard.' });
    },
    reboot() {
        const r = S.reboots || 0, need = rebootNeed(r), can = (S.boot || 0) >= need;
        const body = `<div class="rebBox"><div class="rebRow"><span>Reboots</span><b>${r}</b><i>→</i><b class="g">${r + 1}</b></div>
            <div class="rebRow"><span>Every press</span><b>x${rebootMult(r)}</b><i>→</i><b class="g">x${rebootMult(r + 1)}</b></div>
            <div class="rebNew o1">+${REBOOT_GEMS} 💎 every Reboot</div>
            <div class="prog" style="width:min(22rem,80vw);height:1rem"><i style="width:${Math.min(100, (S.boot || 0) / need * 100).toFixed(1)}%"></i></div>
            <small class="o1" style="font-weight:700">${fmtComma(Math.floor(S.boot || 0))} / ${fmtComma(need)} clicks this boot</small>
            <p class="rebWarn">Your Clicks and upgrades go back to nothing and you start again on the Office keyboard (the keyboards come back fast). You keep your Desk Buddies, Buddy Slots, Gems and your total.</p>
            <button class="btn ${can ? 'g-pink' : 'g-grey'} o" data-act="reboot" style="min-width:14rem;height:3.4rem;font-size:1.5rem">${can ? 'REBOOT!' : '🔒 ' + fmt(need) + ' clicks'}</button></div>`;
        return frame('Reboot', IC('rebirth'), body, { w: 32 });
    },
    keys() {
        const t = S.tier || 0;
        const body = '<div class="grid wgrid">' + BOARDS.map((B, i) => {
            const open = i <= t, here = S.onBoard === i;
            const caps = `<div class="ci" style="background:linear-gradient(135deg,${hex(B.cap[0])} 0 50%,${hex(B.cap[1])} 50%);box-shadow:inset 0 -0.4rem 0 ${hex(B.edge)}, 0 0 0.7rem ${hex(B.acc)}"></div>`;
            const btn = open ? `<button class="btn ${here ? 'g-grey' : 'g-blue'} o" data-act="goboard" data-i="${i}" ${here ? 'disabled' : ''}>${here ? 'You\'re here' : 'Go there'}</button>` : `<button class="btn g-grey o" disabled>🔒 ${fmt(B.need)} clicks</button>`;
            return `<div class="card kbcard${open ? '' : ' lock'}${here ? ' on' : ''}">${caps}<b class="o1">${esc(B.name)}</b><span class="palX o1">x${fmt(B.mult)} every press</span>${btn}</div>`;
        }).join('') + '</div>';
        return frame('Keyboards', IC('kbd'), body, { w: 44, foot: 'Fill the bar at the top (clicks this boot) for the next keyboard. Each one is fancier, with its own switches, and pays more.' });
    },
    shop() {
        const tab = panelTab || 'gems';
        let body = '';
        if (tab === 'gems') {
            const x2 = (S.x2Until || 0) > net.now();
            const packs = PACKS.map((p, i) => `<div class="card"><div class="ci">${['🖱️', '⌨️', '🏆'][i]}</div><b class="o1">${fmt(Math.round(p.taps * perPress(S, S.tier || 0)))} ${CC}</b><small>${p.taps} presses' worth</small><button class="btn g-gem o" data-act="pack" data-id="${p.id}">💎 ${p.gems}</button></div>`).join('');
            body = `<div class="grid">${packs}<div class="card"><div class="ci">⚡</div><b class="o1">x2 Clicks · ${CFG.boostX2Mins} min</b><small>${x2 ? 'Active: ' + clock(((S.x2Until || 0) - net.now()) / 1000) + ' left' : 'Double every press'}</small><button class="btn g-gem o" data-act="x2">💎 ${CFG.boostX2Gems}</button></div></div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">💎 Gems come from quests, daily tasks, gifts, the wheel, every 5th word and the daily reward. Everything here is bought with Clicks or Gems.</p>`;
        } else {
            body = `<h3 style="margin:.2rem 0 .5rem">🎟️ Codes</h3><div style="display:flex;gap:.5rem"><input class="code" id="codeIn" maxlength="20" placeholder="Enter a code"><button class="btn g-green o" data-act="code" style="min-width:6rem">Redeem</button></div>
                <p style="margin:.8rem 0 0;font-weight:600;opacity:.85">Codes give free Clicks, Gems, spins and x2. Try KEYSTOMP!</p>`;
        }
        return frame('Shop', IC('shop'), body, { tabs: [['gems', '💎 Gems'], ['codes', '🎟️ Codes']], tab });
    },
    quests() {
        const Q = QUESTS[S.qi];
        let body = '';
        if (Q) {
            const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
            body += `<div class="row${ready ? ' feat' : ''}"><div class="ri"><span class="ci" style="font-size:2.4rem">🎯</span></div><div class="rt"><small style="color:#7af4ff;font-weight:700">QUEST ${S.qi + 1} / ${QUESTS.length}</small><b class="o1">${esc(Q.text)}</b><div class="prog"><i style="width:${(p / Q.n * 100).toFixed(0)}%"></i></div><em>${fmt(p)} / ${fmt(Q.n)} · Reward: ${rewardText(giftShown(Q))}</em></div><div class="rb"><button class="btn ${ready ? 'g-green' : 'g-grey'} o" data-act="qclaim" ${ready ? '' : 'disabled'}>Claim</button></div></div>`;
        } else body += '<div class="row"><div class="rt"><b>🏆 Every quest done! Nobody stomps like you.</b></div></div>';
        body += `<h3 style="margin:.9rem 0 .4rem">🔥 Daily Tasks <small data-t="day" style="opacity:.75;font-size:.85rem">Resets in ${clock(dayLeft(net.now()))}</small></h3>`;
        body += ((S.jq && S.jq.list) || []).map((q, i) => {
            const T = TASKS[q.k], done = q.p >= T.n;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${T.icon}</span></div><div class="rt"><b class="o1">${esc(T.text)}</b><div class="prog"><i style="width:${Math.min(100, q.p / T.n * 100).toFixed(0)}%"></i></div><em>${fmt(q.p)} / ${fmt(T.n)} · ${rewardText(giftShown(T))}</em></div><div class="rb"><button class="btn ${done && !q.c ? 'g-green' : 'g-grey'} o" data-act="tclaim" data-i="${i}" ${done && !q.c ? '' : 'disabled'}>${q.c ? 'Done ✓' : 'Claim'}</button></div></div>`;
        }).join('');
        return frame('Quests', IC('quest'), body);
    },
    daily() {
        const st = dailyStatus(S.daily, net.now());
        const ic = (r) => (r.gems && !r.taps ? '💎' : r.spins ? '<i class="spinIc"></i>' : r.x2 ? '⚡' : CC);
        const days = DAILY.map((r, i) => `<div class="day${i === 6 ? ' big' : ''}${i < st.day ? ' got' : ''}${i === st.day && st.can ? ' now' : ''}"><span class="o1">DAY ${i + 1}</span><span class="di">${i < st.day ? '✅' : ic(r)}</span><span class="o1">${rewardText(giftShown(r))}</span></div>`).join('');
        const body = `<div class="days">${days}</div><div style="text-align:center;margin-top:1rem"><button class="btn ${st.can ? 'g-green' : 'g-grey'} o" data-act="daily" ${st.can ? '' : 'disabled'} ${st.can ? '' : 'data-t="daily"'} style="min-width:12rem;height:3rem;font-size:1.4rem">${st.can ? 'Claim Day ' + (st.day + 1) : 'Next reward in ' + clock(dayLeft(net.now()))}</button></div>`;
        return frame('Daily Rewards', IC('gift'), body, { w: 44, foot: 'Come back every day: the rewards grow for 7 days in a row.' });
    },
    gifts() {
        const secs = sessionSecs();
        const body = GIFTS.map((g, i) => {
            const left = g.min * 60 - secs, got = S.gifts[i];
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${got ? '✅' : '🎁'}</span></div><div class="rt"><b class="o1">${rewardText(giftShown(g))}</b><small>After ${g.min} minutes of play</small></div><div class="rb"><button class="btn ${!got && left <= 0 ? 'g-green' : 'g-grey'} o" data-act="gift" data-i="${i}" ${!got && left <= 0 ? '' : 'disabled'}>${got ? 'Claimed' : left <= 0 ? 'Claim!' : clock(left)}</button></div></div>`;
        }).join('');
        return frame('FREE Gifts', IC('gift'), body, { w: 34, foot: 'Gifts unlock the longer you play this session.' });
    },
    ranks() {
        const b = actions.boards ? actions.boards() : { clicks: [], speed: [] };
        const col = (title, rows, f) => `<div><h3 style="margin:.2rem 0 .5rem">${title}</h3>${(rows || []).map((r, i) => `<div class="row" style="padding:.35rem .6rem;margin-bottom:.3rem"><b style="width:2rem">${['🥇', '🥈', '🥉'][i] || i + 1}</b><div class="rt"><b style="font-size:1rem">${esc(r.n)}</b></div><b>${f(r.v)}</b></div>`).join('') || '<p>Be the first!</p>'}</div>`;
        const full = actions.canOpenBoards && actions.canOpenBoards() ? `<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.8rem">${LEADERBOARDS.map((L) => `<button class="btn g-blue o1" data-act="lb" data-id="${L.id}" style="padding:.25rem .8rem;font-size:1rem">${esc(L.label)}</button>`).join('')}</div>` : '';
        const body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">You: ${fmt(S.total)} clicks · best speed test ${S.bestSpeed || 0} · ${(S.bestTier || 0) + 1} keyboards</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem">${col('🖱️ Top Clickers', b.clicks, fmt)}${col('⏱️ Fastest Fingers (10 s)', b.speed, fmtComma)}</div>${full}`;
        return frame('Leaderboards', '🏆', body);
    },
    settings() {
        const v = getVolumes(), q = getQuality();
        const body = `<div class="vol"><span>Graphics</span><div class="qbtns">${['low', 'medium', 'high'].map((k) => `<button class="btn g-blue o${q === k ? ' on' : ''}" data-act="quality" data-q="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
            <div class="vol"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" data-vol="music"></div>
            <div class="vol"><span>Key sounds</span><input type="range" min="0" max="100" value="${Math.round((v.asmr ?? 0.9) * 100)}" data-vol="asmr"></div>
            <div class="vol"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></div>
            <div class="vol"><span>Show FPS</span><div class="qbtns"><button class="btn g-grey o" data-act="fps">${actions.fpsOn && actions.fpsOn() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Stuck?</span><div class="qbtns"><button class="btn g-blue o" data-act="home">Back to spawn</button></div></div>
            <p style="margin:1rem 0 0;font-weight:600;opacity:.8">${isTouch ? 'Walk over keys, or tap CLICK. JUMP onto keys to stomp them. Drag to look around.' : 'WASD move · walk over keys or click anywhere · SPACE jump (stomps keys) · E use · R to your keys · drag to look'}</p>`;
        return frame('Settings', IC('gear'), body, { w: 36 });
    },
};

// =====================================================================================
// What the buttons do
// =====================================================================================
function doAct(act, d) {
    sfx('click');
    switch (act) {
        case 'spin':
            if (S.spins > 0 && !spinning) {
                spinning = true; net.send('spin', {}); renderSpinButton();
                clearTimeout(spinWait); spinWait = setTimeout(() => { if (spinning) { spinning = false; refreshPanels(); } }, 4000);
            }
            break;
        case 'reboot': {
            const need = rebootNeed(S.reboots);
            if ((S.boot || 0) < need) { toast('🔄 Reboot needs ' + fmtComma(need) + ' clicks this boot', '#ff9a8a'); sfx('denied'); break; }
            askConfirm('🔄', 'Reboot?', 'Your Clicks and upgrades go back to nothing and you start on the Office keyboard again. Every press gives x' + rebootMult(S.reboots + 1) + ' from now on, and you get ' + REBOOT_GEMS + ' 💎.', 'REBOOT!', () => { closePanel(); net.send('reboot', {}); });
            break;
        }
        case 'goboard': closePanel(); if (actions.goBoard) actions.goBoard(+d.i); break;
        case 'pack': net.send('pack', { id: d.id }); break;
        case 'x2': net.send('x2', {}); break;
        case 'code': { const v = ($('#codeIn') || {}).value || ''; if (v.trim()) net.send('code', { code: v.trim() }); break; }
        case 'qclaim': net.send('qclaim', {}); break;
        case 'tclaim': net.send('tclaim', { i: +d.i }); break;
        case 'daily': net.send('daily', {}); break;
        case 'gift': net.send('gift', { i: +d.i }); break;
        case 'quality': setQuality(d.q); if (actions.saveSetting) actions.saveSetting({ graphics_quality: d.q === 'low' ? 'Low' : d.q === 'medium' ? 'Medium' : 'High' }); renderPanel(); break;
        case 'fps': if (actions.toggleFps) actions.toggleFps(); if (actions.saveSetting && actions.fpsOn) actions.saveSetting({ show_fps: actions.fpsOn() }); renderPanel(); break;
        case 'home': closePanel(); if (actions.respawn) actions.respawn(); break;
        case 'upgrade': net.send('upgrade', { id: d.id }); break;
        case 'equip': net.send('equip', { id: d.id }); sfx('equip'); break;
        case 'unequip': net.send('equip', { id: d.id, off: 1 }); break;
        case 'equipbest': net.send('equipbest', {}); sfx('equip'); break;
        case 'hatch': if (actions.hatch) actions.hatch(panelArg, +d.n); break;
        case 'lb': if (actions.openBoard) actions.openBoard(d.id); break;
    }
}
function renderSpinButton() { const b = $('#modal').querySelector('[data-act="spin"]'); if (b) b.disabled = true; }
// the wheel's answer: turn to the prize, then show it
let spinWait = 0;
export function onSpun(m) {
    clearTimeout(spinWait);
    const seg = 360 / SPIN.length, target = -((m.i + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6;
    const base = wheelAngle + 360 * 5;
    wheelAngle = base + ((((target - base) % 360) + 360) % 360);
    const el = $('#wheel');
    spinning = true;
    if (el) { el.style.transition = 'transform 3.4s cubic-bezier(0.15, 0.85, 0.25, 1)'; el.style.transform = 'rotate(' + wheelAngle.toFixed(1) + 'deg)'; }
    let ticks = 0;
    const tick = () => { if (ticks++ < 22) { sfx('click'); setTimeout(tick, 40 + ticks * ticks * 0.35); } };
    tick();
    setTimeout(() => {
        spinning = false;
        sfx('reward');
        popup('🎡', 'YOU WON!', m.text, '#ffe24a', true);
        if (panelKind === 'spin') renderPanel();
    }, el ? 3500 : 50);
}
// a yes / no question (yes may hold html: the drawn icons)
export function askConfirm(icon, title, text, yes, act) {
    const c = $('#confirm');
    c.innerHTML = `<div class="panel"><header><h2 class="o">${title}</h2><div class="hx"><button class="btn g-red o x" data-no>✕</button></div></header><div></div><div class="cbody"><span class="bi">${icon}</span><p>${text}</p><div class="btns"><button class="btn g-green o" data-yes>${yes}</button><button class="btn g-grey o" data-no>Cancel</button></div></div><div></div></div>`;
    c.hidden = false;
    for (const b of c.querySelectorAll('[data-no]')) b.onclick = () => { c.hidden = true; sfx('close'); };
    c.querySelector('[data-yes]').onclick = () => { c.hidden = true; act(); };
    c.onclick = (e) => { if (e.target === c) c.hidden = true; };
}
export function closeTop() {
    if (!$('#hatch').hidden) { closeHatch(); return true; }
    if (!$('#confirm').hidden) { $('#confirm').hidden = true; return true; }
    if (!$('#speedRes').hidden) { $('#speedRes').hidden = true; if (actions.onSpeedClosed) actions.onSpeedClosed(); return true; }
    if (closePanel()) return true;
    return false;
}
export const anyPopup = () => !$('#modal').hidden || !$('#confirm').hidden || !$('#hatch').hidden || !$('#speedRes').hidden;
// the panels with their real content, for the loading warm-up; returns the clean-up
export function warmPanels() {
    const m = $('#modal');
    panelKind = 'spin'; panelArg = 'b1';
    m.innerHTML = PANELS.spin() + PANELS.reboot() + PANELS.daily() + PANELS.quests() + PANELS.shop() + PANELS.keys() + PANELS.tech() + PANELS.buddies() + PANELS.box() + PANELS.gifts() + PANELS.ranks() + PANELS.settings();
    m.hidden = false; m.classList.add('warmui');
    $('#confirm').innerHTML = '<div class="panel"><header><h2 class="o">Buy?</h2></header><div></div><div class="cbody"><span class="bi">🖱️</span><p>Sample</p><div class="btns"><button class="btn g-green o">Yes</button></div></div><div></div></div>';
    $('#confirm').hidden = false; $('#confirm').classList.add('warmui');
    popup('⭐', 'NEW KEYBOARD!', 'Sample', '#ffe24a'); $('#popup').classList.add('warmui');
    speedHud(true, '3', 'GET READY'); $('#speedHud').classList.add('warmui');
    toast('Sample', '#ffffff');
    const H = $('#hatch'), C = $('#hatchCaps');
    C.innerHTML = '<div class="hc"><div class="cap" style="--cc:#3ab4ff"></div></div><div class="hc"><img src="' + buddyIcon(BUDDIES[0].id) + '" alt=""><b class="o">Eraser Ed</b><small class="o1">Common</small></div>';
    H.hidden = false; H.classList.add('warmui');
    return () => {
        for (const s of ['#modal', '#confirm', '#popup', '#hatch', '#speedHud']) { $(s).classList.remove('warmui'); $(s).hidden = true; }
        m.innerHTML = ''; $('#confirm').innerHTML = ''; panelKind = null; $('#toasts').innerHTML = ''; C.innerHTML = '';
    };
}
void tierFor;
