import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, setFogScale, updateEffects, floatText, prompts, billboard,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, playAsmr, prerenderMusic, allowLiveMusic, audioAway, musicLite } from './audio.js';
import { buildAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, characterIdOf } from './avatar.js';
import { pad, pollGamepad } from './gamepad.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildDesk } from './world.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { PRESS, FRENZY, PRESSED_TOP, tickKeys, impact, keyWarmGroup, keyDetail } from './keys.js';
import { beginBuddies, endBuddies, placeTeam, buddiesWarm, buddyIcon } from './buddies.js';
import { Char, pumpAvatars, avatarsPending } from './chars.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels,
    measureHud, onSpun, askConfirm, flyClicks, pressTick, showHatch, setComboHud, speedHud, speedResult, speedResultOpen, setTutorial, setFrenzy,
} from './ui.js';
import {
    CFG, BOARDS, BOXES, boxById, buddyById, UPGRADES, upgradeCost, QUESTS, TASKS, dailyStatus, fmt, fmtComma, clamp, perPress, comboMult, comboGap, walkOf, stompKeys, stompReach,
    titleOf, rebootMult, LEADERBOARDS,
} from '../../shared/config.js';
import { newBody, stepBody } from '../../shared/physics.js';
import { P as KEYP, KB_Y, KB_D, SPAWN, SETUPS, KEYS, keyAt, boardAt, keyOfChar, mouseButton, mouseAt, onSpeedPad, SPEED, SHOP, fenceOf, deskSolids, clampDesk } from '../../shared/world.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
// standing on a keyboard you're drawn on the key you hold down (its top comes to rest a hair under the case top you walk at)
const ON_KEYS_DROP = KB_Y - PRESSED_TOP;
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const lerpA = (a, b2, k) => { let d = (b2 - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const fmtNum = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
const x2On = () => (S.x2Until || 0) > net.now();

// =====================================================================================
// The desk on screen
// =====================================================================================
let view = null;
const deskOpts = {
    shop: () => openPanel('tech'),
    box: (id) => openPanel('box', id),
    reboot: () => openPanel('reboot'),
    speed: () => startSpeed(),
    speedLabel: () => (speedState ? '' : 'Speed Test'),
    speedBusy: () => !!speedState,
};
function buildView() {
    keyDetail(getQuality() === 'low');
    deskOpts.low = getQuality() === 'low';
    deskOpts.high = getQuality() === 'high';
    view = buildDesk(deskOpts);
    view.setTier(S.tier || 0, true);
    view.setBoards(boards);
    setMood('desk', true);
    setFogScale(1);
    return view;
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const BASE_SOLIDS = deskSolids();
const P = {
    b: newBody(SPAWN.x, 0, SPAWN.z), facing: Math.PI, moving: false,
    world: { solids: BASE_SOLIDS.slice(), floor: 0, clamp: clampDesk }, fenced: -1,
    jumpPress: -9, lastJump: -9, lastPress: -9, comboT: -9, minVy: 0, stride: 0, lastStride: 0, auto: null,
    lockToast: -9, tapToast: -9, bumpAt: -9, frozen: false, snaps: 0, groundY: 0, lastKey: -1, lastBoard: -1, autoT: 0, floatT: -9, onKeys: false,
    megaAt: -9, visited: new Set(),
};
// a locked keyboard sits under glass on your screen: you can't walk onto it
function syncFences() {
    const t = S.tier || 0;
    if (P.fenced === t) return;
    P.fenced = t;
    const list = BASE_SOLIDS.slice();
    for (let i = t + 1; i < SETUPS.length; i++) list.push(...fenceOf(i));
    P.world.solids = list;
}
let me = null, localAvatarReq = 0;
function buildMe() {
    if (me) me.dispose();
    me = new Char({ name: S.name, lv: S.total, tr: titleOf(S.total) });
    me.buddyPos = [];
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    // a switch to or from their own uploaded character: the rig is built again
    if (me && me.blox && av && me.blox.charId !== characterIdOf(av)) setupLocalAvatar();
    else if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.onGround = true; b.pound = false;
    P.lastKey = -1;
    camSnap = true;
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    sendMove(true);
}
// the server moves you (a warp it hasn't made would be snapped back): to the spawn, or to a keyboard you've got
const goTo = (to, i) => { net.send('warp', { to, i }); };
actions.respawn = () => goTo('spawn');
actions.goBoard = (i) => { if (SETUPS[i] && i <= S.tier) goTo('board', i); };

// ----- pressing keys -----
// what's been sent and not yet answered: the clicks it should give are shown already; each answer takes those it covers off the list
// (the counter never jumps back over a 400 ms round trip)
const pending = [];
let seq = 0, stream = '', streamAt = 0;
// your own presses keep inside the server's allowance (a touch inside it, for the network's bunching): a press it would turn away is
// never shown, so the counter never jumps back
const myBucket = { n: CFG.clickBurst - 4, t: 0 };
function pressAllowed() {
    const now = performance.now() / 1000, b = myBucket;
    b.n = Math.min(CFG.clickBurst - 4, b.n + (now - b.t) * (CFG.clickRate - 1)); b.t = now;
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
}
function pressKey(si, k, kind) {
    const t = clockT, B = BOARDS[si], key = KEYS[k], st = SETUPS[si];
    const auto = kind === 'auto', stomp = kind === 'stomp';
    if (!auto && !pressAllowed()) return;
    if (!auto) { P.combo = t - P.comboT <= comboGap(S) ? P.combo + 1 : 1; P.comboT = t; S.combo = P.combo; }
    const got = perPress(S, si, x2On()) * (auto ? 1 : comboMult(P.combo, S)) * (frenzyOn() ? CFG.frenzyMult : 1);
    S.clicks += got; S.total += got; S.boot += got; S.presses++;
    pending.push({ s: ++seq, got });
    net.send('press', { si, k, s: seq, c: auto ? 0 : P.combo, st: stomp ? 1 : 0, a: auto ? 1 : 0 });
    // the word: its next letter (the server agrees, or the next answer puts it right)
    if (key.ch && key.ch !== ' ') { stream += key.ch; if (stream.length > 40) stream = stream.slice(-30); streamAt = t; }
    else if (key.ch === ' ') { stream += ' '; streamAt = t; }
    if (S.word && key.ch && key.ch === S.word[S.wi]) {
        S.wi++;
        playAsmr('k_' + B.sound, 0.3, 1.6);
        if (S.wi < S.word.length) floatText(S.word.slice(0, S.wi), '#7dff6b', FX.tmpV.set(P.b.x, P.b.y + 9, P.b.z), 3.4, false);
        updateHud();
    }
    // a Golden Key under you: sparkle now, the server pays it
    if (view && view.isGold(si, k)) { FX.sparkleColumn(FX.tmpV.set(st.x + key.x, KB_Y, st.z + key.z), 0xffd23a); FX.powerFx(P.b, 0xffd23a, 10); }
    // the key clacks and lights up; its keyboard's own sound; the bell climbing with the combo
    impact(st.x + key.x, KB_Y, st.z + key.z, stomp ? 1 : 0.85, 1.2);
    view.lightKey(si, k);
    if (!stomp && !auto) {
        const pitch = B.sound === 'galaxy' ? Math.pow(2, SCALE[k % 15] / 12) : 0.95 + RND() * 0.1;
        playAsmr('k_' + B.sound, 0.5, pitch);
        if (P.combo > 1 && P.combo % 4 === 0) playAsmr('tick', 0.05 + Math.min(0.06, P.combo * 0.0015), Math.pow(2, SCALE[Math.min(14, Math.floor(P.combo / 8))] / 12));
        // every step of the combo a ring; every fifth (x1.5, x2...) its multiplier over your head
        if (P.combo % 10 === 0 && P.combo > 0 && comboMult(P.combo, S) > comboMult(P.combo - 1, S)) { FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.4, P.b.z), B.acc, 7, 0.5); if (P.combo % 50 === 0) floatText('COMBO x' + comboMult(P.combo, S).toFixed(1), '#ffb01a', FX.tmpV.set(P.b.x, P.b.y + 10, P.b.z), 4.5, true); }
    } else if (auto) playAsmr('k_' + B.sound, 0.22, 1.1 + RND() * 0.1);
    P.floatAcc = (P.floatAcc || 0) + got;
    if (!auto && t - P.floatT > 0.32 && !window.__noFloat) {
        P.floatT = t;
        const sum = P.floatAcc; P.floatAcc = 0;
        const side = (RND() < 0.5 ? -1 : 1) * (1.2 + RND() * 2.2), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        floatText('+' + fmtNum(sum), frenzyOn() ? '#ffe24a' : '#ffffff', FX.tmpV.set(P.b.x + rx * side, P.b.y + 6.6 + RND() * 1.2, P.b.z + rz * side), 3.4, false);
    }
    pressTick();
}
// a click: the key under you, walking or standing (a tap, the CLICK button, ENTER, the Auto Typer)
function clickNow(fromAuto) {
    const b = P.b, t = clockT;
    if (speedState) { if (!fromAuto) speedTap(); return; }
    if (!fromAuto && t - P.lastPress < CFG.tapGap) return;
    const si = boardAt(b.x, b.z);
    if (si < 0 || b.y > KB_Y + 3.5) {
        if (!fromAuto && t - P.tapToast > 2.5) { P.tapToast = t; toast('⌨️ Walk onto a keyboard, then click!', '#ffe24a'); }
        return;
    }
    if (si > S.tier) { lockedToast(si, t); return; }
    const k = keyAt(si, b.x, b.z);
    if (k < 0) return;
    P.lastPress = t;
    pressKey(si, k, fromAuto ? 'auto' : 'tap');
}
function lockedToast(si, t) {
    if (t - P.lockToast < 4) return;
    P.lockToast = t;
    toast('🔒 ' + BOARDS[si].name + ' opens at ' + fmtComma(BOARDS[si].need) + ' clicks this boot', '#ff9a8a');
    sfx('denied');
}
// a landing on a keyboard: the key under you and the nearest round it go down too (Spring Shoes: more of them)
function stompKeysAt(si, x, z, k0) {
    const st = SETUPS[si], reach = stompReach(S), want = stompKeys(S), near = [];
    P.stomped = true;
    if (k0 >= 0) pressKey(si, k0, 'stomp');
    for (let i = 0; i < KEYS.length; i++) {
        if (i === k0) continue;
        const d = Math.hypot(st.x + KEYS[i].x - x, st.z + KEYS[i].z - z);
        if (d < reach + KEYS[i].w * KEYP / 2) near.push([d, i]);
    }
    near.sort((a, c) => a[0] - c[0]);
    for (let j = 0; j < Math.min(want, near.length); j++) pressKey(si, near[j][1], 'stomp');
    playAsmr('land', 0.55, 0.95 + RND() * 0.1);
    FX.squishFx(FX.tmpV.set(x, KB_Y + 0.9, z), 'keys', BOARDS[si].cap[0], 0.8);
    impact(x, KB_Y, z, 1.1, reach);
    // a shockwave across the keys, a little jolt
    FX.ring(FX.tmpV.set(x, KB_Y + 1.0, z), BOARDS[si].acc, reach + 4, 0.45);
    shake = Math.max(shake, 0.16);
}
const frenzyOn = () => !!(net.room && net.room.state && net.room.state.frenzy > net.now());
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}
// a landing on a giant mouse's button: MEGA CLICK
function megaClick(si, side) {
    const t = clockT, st = SETUPS[si];
    if (si > S.tier) { lockedToast(si, t); return; }
    if (t - P.megaAt < CFG.megaGap) return;
    P.megaAt = t;
    sendMove(true);
    net.send('mega', { si, side });
    view.pressMouse(si, side);
    playAsmr('mega', 0.8, 1);
    shake = Math.max(shake, 0.35);
    const pos = FX.tmpV.set(P.b.x, P.b.y + 1, P.b.z);
    FX.ring(pos, BOARDS[si].acc, 12, 0.6);
    FX.powerFx(P.b, BOARDS[si].acc, 14);
    floatText('MEGA CLICK!', '#ffe24a', FX.tmpV.set(P.b.x, P.b.y + 9, P.b.z), 6, true);
    void st;
}

function updateMe(dt) {
    const t = clockT, b = P.b;
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.6 * dt * camSens;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.7 * dt * camSens, -0.5, 1.3);
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * r, mz = fz * f + rz * r;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let hold = !!(keys.Space || touchJump || (pad.held && pad.held.has('A')));
    let pressed = t - P.jumpPress < 0.15;
    // QA autopilot drives instead
    if (P.auto) { const a = P.auto(dt); mx = a.mx; mz = a.mz; hold = a.hold; pressed = a.jump; }
    P.frozen = anyPopup() || switching || !!speedState;
    if (P.frozen) { mx = 0; mz = 0; pressed = false; hold = false; }
    P.moving = mx * mx + mz * mz > 0.01;
    // holding JUMP keeps jumping
    if (hold && b.onGround && !pressed && t - P.lastJump > 0.12) pressed = true;
    const boost = walkOf(S) / CFG.walk;
    const inp = { mx, mz, jump: pressed, hold, power: CFG.power, double: false, speed: boost };
    if (!b.onGround) P.minVy = Math.min(P.minVy, b.vy);
    const hs0 = Math.hypot(b.vx, b.vz);
    syncFences();
    const ev = stepBody(b, inp, dt, P.world);
    // running into a wall: a thud, a jolt
    if (P.moving && hs0 > 14 && Math.hypot(b.vx, b.vz) < hs0 * 0.25 && t - P.bumpAt > 0.5) {
        P.bumpAt = t; playAsmr('bonk', 0.45, 0.8); shake = Math.max(shake, 0.1); if (me) me.squash(0.3);
        const si = boardAt(b.x + Math.sin(P.facing) * 4, b.z + Math.cos(P.facing) * 4);
        if (si > S.tier) lockedToast(si, t);
    }
    if (ev === 1 || ev === 2) {
        P.jumpPress = -9; P.lastJump = t;
        if (me) me.stretch(0.6);
        playAsmr('boost', 0.22, 1.25 + RND() * 0.1);
        P.minVy = 0;
        fovKick = 2.2;
    } else if (ev === 3 || ev === 4) {
        const k = clamp(-P.minVy / 60, 0.3, 1.4);
        if (me) me.squash(k);
        const si = boardAt(b.x, b.z), mi = mouseAt(b.x, b.z);
        if (mi >= 0 && b.y > 2) { const side = mouseButton(mi, b.x, b.z); if (side >= 0) megaClick(mi, side); else playAsmr('thud', 0.4, 1.1); }
        else if (si >= 0 && si <= S.tier && b.y <= KB_Y + 0.5) stompKeysAt(si, b.x, b.z, keyAt(si, b.x, b.z));
        else playAsmr('thud', 0.45, 0.9);
        P.minVy = 0;
    }
    if (P.moving) P.facing = lerpA(P.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // footsteps (on the keys the presses are the steps)
    if (b.onGround && P.moving) {
        P.stride += dt * CFG.walk * boost / 5.4;
        if (Math.floor(P.stride) !== P.lastStride) {
            P.lastStride = Math.floor(P.stride);
            if (!P.onKeys) playAsmr('crunch', 0.32, 1 + RND() * 0.2);
        }
    }
    deskTouch(t, dt);
    if (b.y < -40) goTo('spawn');
    if (me) {
        me.update(dt, t, { x: b.x, y: b.y - (P.onKeys && b.onGround ? ON_KEYS_DROP : 0), z: b.z, ry: P.facing, snapRy: true, air: !b.onGround, moving: P.moving && b.onGround, speed: Math.hypot(b.vx, b.vz), vy: b.vy, jump: ev === 1, airJump: ev === 2, ground: 0 });
        const B = BOARDS[S.onBoard >= 0 ? S.onBoard : S.tier || 0];
        me.setCombo(Math.floor((P.combo || 0) / 20), B.acc, !!B.rgb);
        placeTeam(me.buddyPos, S.team || [], b.x, b.onGround ? b.y : Math.max(0, b.y - 3), b.z, P.facing, t, dt);
    }
    sendMove(false);
}
// ----- what you're standing on: a key, the Speed Test pad -----
function deskTouch(t, dt) {
    const b = P.b;
    if (!view || switching) return;
    const si = b.onGround && b.y <= KB_Y + 0.5 ? boardAt(b.x, b.z) : -1;
    P.onKeys = si >= 0;
    if (si !== S.onBoard) { S.onBoard = si; updateHud(); if (si >= 0 && si <= S.tier && !P.visited.has(si)) { P.visited.add(si); if (si > 0 && !(S.seen && S.seen['kb' + si])) { S.seen = { ...S.seen, ['kb' + si]: 1 }; net.send('tut', { seen: 'kb' + si }); bigText(BOARDS[si].name.toUpperCase() + ' x' + fmt(BOARDS[si].mult), '#7dff6b'); } } }
    if (si >= 0) {
        if (si > S.tier) lockedToast(si, t);
        else {
            const k = keyAt(si, b.x, b.z);
            if (k >= 0 && (k !== P.lastKey || si !== P.lastBoard)) { P.lastKey = k; P.lastBoard = si; P.lastPress = t; pressKey(si, k, 'walk'); }
            // the Auto Typer, and the CLICK button held down
            const rate = (S.ups && S.ups.auto) || 0;
            if (rate && S.autoOn && !P.frozen) { P.autoT += dt; const gap = 1 / rate; if (P.autoT >= gap) { P.autoT -= gap; clickNow(true); } }
            if (touchClick && !P.frozen) clickNow(false);
        }
    } else { P.lastKey = -1; P.lastBoard = -1; if (touchClick && !P.frozen) clickNow(false); }
    // the combo fades: presses too far apart start it again
    if (P.combo && t - P.comboT > comboGap(S)) { P.combo = 0; S.combo = 0; }
    const gapLeft = P.combo ? 1 - (t - P.comboT) / comboGap(S) : 0;
    setComboHud(P.combo || 0, ((P.combo || 0) % 10) / 10 * 0.7 + gapLeft * 0.3);
}

// ----- the monitor, the word's beacon, the guide -----
let liveKey = '', liveT = 0, flashOn = false;
function updateMonitor(t) {
    const b = P.b;
    // the keyboard you're at (on it, or in front of its monitor)
    let at = -1;
    for (const st of SETUPS) if (st.i <= S.tier && Math.abs(b.x - st.x) < 56 && b.z < st.z + 30 && b.z > st.z - 40) { at = st.i; break; }
    view.liveAt(at);
    // the next letter of the word glows on that keyboard (or, away from the keyboards, nowhere)
    const ch = S.word ? S.word[S.wi] : '';
    if (at >= 0 && ch) view.setBeacon(at, keyOfChar(ch)); else view.setBeacon(-1, -1);
    if (at < 0) return;
    // (redrawn when what it shows changes, a few times a second at most: on Low fewer, the cursor blinking only while nothing's typed)
    const idle = t - streamAt > 0.6, fl = idle ? Math.floor(t * 2) % 2 === 0 : true;
    const key = at + '|' + S.word + '|' + S.wi + '|' + stream + '|' + S.words + '|' + fl;
    if (key === liveKey || t - liveT < (lowQ() ? 0.3 : 0.15)) return;
    liveKey = key; liveT = t; flashOn = fl;
    view.drawLive(BOARDS[at], S.word || '', S.wi || 0, stream, S.words || 0, flashOn);
}
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.2, -1); s.lineTo(0, 0.8); s.lineTo(2.2, -1); s.lineTo(2.2, 0.2); s.lineTo(0, 2); s.lineTo(-2.2, 0.2); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
// what to do next: your new keyboard, the first Buddy Box, the Tech Shop, a giant mouse, the Speed Test, else back to your best keys
function guideTarget() {
    const t = S.tier || 0, st = SETUPS[t];
    if (tutStep === 0) return { x: SETUPS[0].x - 20, z: SETUPS[0].z };
    if (tutStep === 5) return { x: SETUPS[t].box.x, z: SETUPS[t].box.z + 7 };
    if (tutStep === 6) return { x: SHOP.x + 9, z: SHOP.z };
    if (S.presses < 30) return { x: SETUPS[0].x - 20, z: SETUPS[0].z };
    if (t > 0 && !P.visited.has(t) && !(S.seen && S.seen['kb' + t])) return { x: st.x, z: st.z };
    if (!S.boxes && S.clicks >= BOXES[0].cost) return { x: SETUPS[0].box.x, z: SETUPS[0].box.z + 7 };
    if (!S.upgrades && S.clicks >= upgradeCost(UPGRADES[0], 0) && S.presses > 60) return { x: SHOP.x + 9, z: SHOP.z };
    if (!S.megas && S.presses > 200) return { x: SETUPS[t].mouse.x, z: SETUPS[t].mouse.z + 16 };
    if (!S.speeds && S.presses > 500) return { x: SPEED.pad.x, z: SPEED.pad.z };
    return { x: st.x, z: st.z, far: true };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const b = P.b;
    const on = !switching && !anyPopup() && !speedState && S.presses < 6000;
    const g = on ? guideTarget() : null;
    const off = () => { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } };
    if (!g) { off(); return; }
    const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
    if (d < 7 || (g.far && d < 60) || (boardAt(b.x, b.z) === boardAt(g.x, g.z) && boardAt(g.x, g.z) >= 0)) { off(); return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 6, offs = (t * 11) % gap;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 3 + i * gap + offs;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 1) / 2);
        const px = b.x + ux * s, pz = b.z + uz * s, y = boardAt(px, pz) >= 0 ? KB_Y + 1.15 : 0.42;
        guide.setMatrixAt(n++, guideM.compose(guideV.set(px, y, pz), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}

// =====================================================================================
// KEY FRENZY: every key flashing through the rainbow, x3 on every press, the clock in the title
// =====================================================================================
function updateFrenzy(dt) {
    const on = frenzyOn(), want = on ? 1 : 0;
    FRENZY.value += (want - FRENZY.value) * Math.min(1, dt * 4);
    if (FRENZY.value < 0.002) FRENZY.value = 0;
    setFrenzy(on ? (net.room.state.frenzy - net.now()) / 1000 : 0);
}
// the Golden Key on a keyboard you've got, near you: an arrow at the edge of the screen pointing to it, or a marker over it
const gaV = new V3();
let gaShown = false, gaKey = '';
function updateGoldArrow() {
    const el = $('#goldArrow'), str = goldStr || '', b = P.b;
    let best = null, bd = 1e9;
    if (str && !anyPopup() && !speedState) for (const part of str.split(';')) {
        const [si, k] = part.split(':').map(Number);
        if (!(si <= S.tier) || !SETUPS[si] || !KEYS[k]) continue;
        const x = SETUPS[si].x + KEYS[k].x, z = SETUPS[si].z + KEYS[k].z, d = Math.hypot(x - b.x, z - b.z);
        if (d < 110 && d < bd) { bd = d; best = { x, z }; }
    }
    if (!best || bd < 4) { if (gaShown) { gaShown = false; el.hidden = true; } return; }
    if (!gaShown) { gaShown = true; el.hidden = false; }
    gaV.set(best.x, KB_Y + 5, best.z).project(camera);
    const W = innerWidth, H = innerHeight, behind = gaV.z > 1;
    let sx = (gaV.x + 1) / 2 * W, sy = (1 - gaV.y) / 2 * H, ang = 0;
    // the play area: clear of the menus on the left and right, the top bar, the counter and the touch buttons
    const x0 = W * 0.22, x1 = W * 0.78, y0 = H * (W < H ? 0.36 : 0.3), y1 = H * (W < H ? 0.62 : 0.78), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const on = !behind && sx > x0 && sx < x1 && sy > y0 && sy < y1;
    if (!on) {
        // off screen (or behind a menu): pinned to the play area's edge, the arrow turned towards it
        let dx = sx - cx, dy = sy - cy;
        if (behind) { dx = -dx; dy = -dy; }
        ang = Math.atan2(dy, dx);
        const k = Math.min((x1 - cx) / Math.max(1, Math.abs(dx)), (y1 - cy) / Math.max(1, Math.abs(dy)));
        sx = cx + dx * k; sy = cy + dy * k;
    }
    const key = on ? 'on' : 'edge';
    if (key !== gaKey) { gaKey = key; el.querySelector('b').style.display = on ? 'none' : ''; el.querySelector('small').style.display = on ? '' : 'none'; }
    el.style.transform = 'translate(' + sx.toFixed(0) + 'px,' + sy.toFixed(0) + 'px)';
    if (!on) el.querySelector('b').style.transform = 'rotate(' + (ang + Math.PI / 2).toFixed(2) + 'rad)';
}

// =====================================================================================
// The guide for someone new: one step at a time in the quest's place (the arrows on the floor go where each step is)
// =====================================================================================
const TUT_N = 7;
let tutStep = -1, tutBase = 0, tutKey = '';
function updateTutorial() {
    if (!running || !gotProfile) return;
    // someone who's played a while already: no guide
    if ((S.tut || 0) >= TUT_N || (tutStep < 0 && S.presses > 400)) {
        if (tutStep !== TUT_N) { tutStep = TUT_N; setTutorial(null); if ((S.tut || 0) < TUT_N) { S.tut = TUT_N; net.send('tut', { tut: TUT_N }); } }
        return;
    }
    if (tutStep < 0) { tutStep = S.tut || 0; tutBase = S.presses; }
    // done here already (a late, older profile, or a sign-in into an account that hasn't done it, says otherwise): it stays done
    if (tutStep >= TUT_N) { S.tut = TUT_N; net.send('tut', { tut: TUT_N }); return; }
    const was = tutStep;
    if (tutStep === 0 && S.onBoard >= 0) { tutStep = 1; tutBase = S.presses; }
    if (tutStep === 1 && S.presses - tutBase >= 20) tutStep = 2;
    if (tutStep === 2 && P.stomped) tutStep = 3;
    if (tutStep === 3 && (S.words || 0) >= 1) tutStep = 4;
    if (tutStep === 4 && (S.tier || 0) >= 1) tutStep = 5;
    if (tutStep === 5 && (S.boxes || 0) >= 1) tutStep = 6;
    if (tutStep === 6 && (S.upgrades || 0) >= 1) tutStep = 7;
    if (tutStep !== was) {
        S.tut = tutStep; net.send('tut', { tut: tutStep });
        sfx('task');
        if (tutStep >= TUT_N) { setTutorial(null); bigText("YOU'RE A KEYSTOMPER!", '#7dff6b'); toast('🎯 The quest at the top of the screen shows what to do next', '#ffffff'); return; }
    }
    const box = BOXES[S.tier || 0], jump = isTouch ? 'Tap JUMP' : 'Press SPACE';
    const steps = [
        ['Walk onto the keyboard (follow the arrows)', ''],
        ['Run over the keys: each one is a click! ' + Math.min(20, S.presses - tutBase) + '/20', ''],
        [jump + ' to jump and STOMP the keys', ''],
        ['Stomp the GREEN letters to type the word', 'word'],
        ['Fill the top bar: NEW KEYBOARD! ' + fmt(S.boot) + '/' + fmt(BOARDS[1].need), 'bar'],
        [S.clicks >= box.cost ? 'Open a Buddy Box (in front of the keyboard)' : 'Get ' + fmt(box.cost) + ' clicks, then open a Buddy Box', ''],
        ['Buy Click Power at the TECH SHOP', ''],
    ];
    const [text, hl] = steps[tutStep];
    const key = tutStep + text;
    if (key !== tutKey) {
        tutKey = key;
        setTutorial({ step: tutStep, of: TUT_N, text, hl });
        if (tutStep !== was && tutStep > 0) bigText('STEP ' + (tutStep + 1) + ': ' + ['', 'STOMP!', 'JUMP!', 'TYPE THE WORD!', 'FILL THE BAR!', 'BUDDY BOX!', 'UPGRADE!'][tutStep], '#ffe24a');
    }
}

// =====================================================================================
// The Click Speed Test: stand on the pad, 3, 2, 1, then ten seconds of clicking (the server counts)
// =====================================================================================
let speedState = null, speedN = 0, speedDone = null, speedScreen = null;
actions.speed = () => startSpeed();
function startSpeed() {
    if (speedState) return;
    if (!onSpeedPad(P.b.x, P.b.z)) { toast('⏱️ Stand on the yellow Speed Test pad', '#ffe24a'); return; }
    sendMove(true);
    net.send('speedgo', {});
}
function speedTap() {
    const now = net.now();
    if (!speedState || now < speedState.at - 100 || now > speedState.end) return;
    speedN++;
    net.send('tap', {});
    playAsmr('k_clicky', 0.4, 1 + Math.min(0.6, speedN * 0.004));
    impact(SPEED.x, 1.6, SPEED.z - 3, 0.6, 3);
    if (speedN % 10 === 0) floatText(String(speedN), '#ffe24a', FX.tmpV.set(P.b.x, P.b.y + 9, P.b.z), 4, true);
}
function updateSpeed() {
    if (!speedState) return;
    const now = net.now(), st = speedState;
    if (now < st.at) { const n = Math.ceil((st.at - now) / 1000); speedHud(true, String(n), 'GET READY', true); if (n !== st.cd) { st.cd = n; sfx('tick3'); } }
    else if (now <= st.end) { if (!st.go) { st.go = true; sfx('go'); } speedHud(true, String(speedN), ((st.end - now) / 1000).toFixed(1) + 's', false); }
    else {
        speedHud(true, String(speedN), 'TIME!', false); if (!st.over) { st.over = true; sfx('whoosh'); }
        // the result never came (the connection dropped as it was sent): let go rather than leave you frozen on TIME!
        if (now > st.end + 6000) endSpeedQuietly();
    }
}
function endSpeedQuietly() { if (!speedState) return; speedState = null; speedHud(false); }
function onSpeedDone(m) {
    speedState = null;
    speedHud(false);
    sfx(m.best ? 'rankup' : 'reward');
    if (m.best) { screenConfetti(getQuality() === 'low' ? 40 : 90); FX.fireworks(FX.tmpV.set(SPEED.x, 14, SPEED.z), getQuality() === 'low' ? 2 : 4); }
    flyClicks(6);
    speedScreen = BX.adScreen('results');
    speedResult(m, () => { closeAdScreen(); });
}
function closeAdScreen() { if (speedScreen && speedScreen.hide) speedScreen.hide(); speedScreen = null; BX.adScreen('gameplay'); }
actions.onSpeedClosed = () => closeAdScreen();

// =====================================================================================
// The camera: close behind you (drag to turn, wheel / pinch to zoom)
// =====================================================================================
const cam = { yaw: 0, pitch: 0.36, dist: isTouch ? 22 : 19 };
let camD = 18, camSens = 1, camSnap = true, shake = 0, fovKick = 0;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
function lookDir(out) { const p = cam.pitch, cp = Math.cos(p); return out.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
const AX = [0, 1, 2], oA = [0, 0, 0], dA = [0, 0, 0];
function rayHit(o, d, maxT) {
    let best = maxT;
    oA[0] = o.x; oA[1] = o.y; oA[2] = o.z; dA[0] = d.x; dA[1] = d.y; dA[2] = d.z;
    for (const c of P.world.solids) {
        if (c.max[1] - c.min[1] < 3 || c.max[0] - c.min[0] < 2.5 || c.max[2] - c.min[2] < 2.5) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AX) {
            if (Math.abs(dA[a]) < 1e-9) { if (oA[a] < c.min[a] || oA[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - oA[a]) / dA[a], tb = (c.max[a] - oA[a]) / dA[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
function updateCamera(dt) {
    const b = P.b, portrait = innerWidth < innerHeight;
    lookDir(dirV);
    const gy = b.y + 5.2;
    if (camSnap || (pivotV.x - b.x) ** 2 + (pivotV.z - b.z) ** 2 > 900) { pivotV.set(b.x, gy, b.z); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 16);
        pivotV.x += (b.x - pivotV.x) * kx; pivotV.z += (b.z - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 10 : 6)));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    if (b.onGround) P.groundY = b.y;
    let lim = cam.dist + (portrait ? 7 : 0) + Math.min(10, Math.max(0, b.y - P.groundY) * 0.08);
    lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    lim = Math.max(2, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    if (camPos.y < 0.8) camPos.y = 0.8;
    camera.position.copy(camPos);
    camera.lookAt(lookV.copy(camPos).addScaledVector(dirV, 30));
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // every takeoff widens the view a touch, easing back
    fovKick = Math.max(0, fovKick - dt * 9);
    const want = (portrait ? 84 : 70) + fovKick;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (me) me.root.visible = camD > 2.2;
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false, touchJump = false, touchClick = false, paused = false;
actions.onPanel = (open) => {
    for (const k in keys) keys[k] = false; touchJump = false; touchClick = false;
    if (!running) return;
    if (open) { BX.adScreen('panel'); BX.gameplayEnd(); } else { BX.adScreen('gameplay'); BX.gameplayStart(); }
};
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    // during the Speed Test, SPACE and ENTER are clicks
    if (speedState && (e.code === 'Space' || e.code === 'Enter')) { speedTap(); return; }
    if (e.code === 'Space') P.jumpPress = clockT;
    if (e.code === 'KeyE' && activePrompt) usePrompt();
    if (e.code === 'KeyR') goTo('board');
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyF') openPanel('spin');
    if (e.code === 'KeyG') openPanel('shop');
    if (e.code === 'KeyB') openPanel('buddies');
    if (e.code === 'KeyU') openPanel('tech');
    if (e.code === 'KeyK') openPanel('keys');
    if (e.code === 'Enter') clickNow(false);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchJump = false; touchClick = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    // the Speed Test: every click counts at once
    if (speedState) { speedTap(); return; }
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 8, 44);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.5, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
});
// a click or tap on the world that wasn't a drag: a click on the key under you
const endDrag = (e) => { const d = drags.get(e.pointerId); drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; if (d && e.type === 'pointerup' && !d.moved && performance.now() - d.at < 400 && running && !anyPopup()) clickNow(false); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 8, 44); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn'), cb = $('#clickBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); if (speedState) { speedTap(); return; } P.jumpPress = clockT; touchJump = true; jb.classList.add('on'); });
    const jEnd = () => { touchJump = false; jb.classList.remove('on'); };
    jb.addEventListener('pointerup', jEnd); jb.addEventListener('pointercancel', jEnd);
    cb.addEventListener('pointerdown', (e) => { e.preventDefault(); cb.setPointerCapture(e.pointerId); touchClick = !speedState; cb.classList.add('on'); clickNow(false); });
    const cEnd = () => { touchClick = false; cb.classList.remove('on'); };
    cb.addEventListener('pointerup', cEnd); cb.addEventListener('pointercancel', cEnd);
})();

// ----- proximity prompts (the Tech Shop, the Speed Test, the Reboot terminal, the Buddy Boxes) -----
let activePrompt = null;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!anyPopup() && !speedState && b.y < 6) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    el.style.transform = `translate(${((pv.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - pv.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -110%)`;
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
$('#promptBtn').addEventListener('click', usePrompt);

// ----- controller -----
function padButtons() {
    if (!pad.connected || !running) return;
    if (pad.pressed.has('BACK') || pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (anyPopup()) { if (pad.pressed.has('B')) closeTop(); return; }
    if (speedState && (pad.pressed.has('A') || pad.pressed.has('X'))) { speedTap(); return; }
    if (pad.pressed.has('A')) P.jumpPress = clockT;
    if (pad.pressed.has('X')) { if (activePrompt) usePrompt(); else clickNow(false); }
    if (pad.pressed.has('Y')) openPanel('quests');
    if (pad.pressed.has('LB')) openPanel('spin');
    if (pad.pressed.has('RB')) openPanel('shop');
}

// =====================================================================================
// Everyone else on the desk (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
const remSt = { x: 0, y: 0, z: 0, ry: 0, air: false, moving: false, speed: 0, vy: 0, far: false, ground: 0 };
class Remote {
    constructor(p, id) {
        this.id = id;
        this.char = new Char({ name: p.name, lv: p.tc, tr: p.title });
        this.char.setAvatar(p.av);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = p.y; this.vy = 0; this.minVy = 0; this.buddyPos = []; this.team = []; this.teamKey = '';
    }
    update(p, dt, t) {
        this.track.push(p.t, p.x, p.y, p.z, p.ry, p.anim);
        const rt = net.now() - this.track.delayFor(dt);
        if (!this.track.sample(rt, smp, dt)) { smp.x = p.x; smp.y = p.y; smp.z = p.z; smp.ry = p.ry; smp.a = p.anim; smp.speed = 0; }
        const air = smp.a >= 2, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 12);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { landAt(smp.x, smp.y, smp.z, clamp(-this.minVy / 60, 0.3, 1.3)); this.char.squash(0.6); this.minVy = 0; }
        if (!this.air && air && this.vy > 3) this.char.stretch(0.5);
        this.air = air; this.prevY = smp.y;
        if (p.av !== this.av) { this.av = p.av; this.char.setAvatar(p.av); }
        if (p.tc !== this.tagC || p.name !== this.tagN || p.title !== this.tagT) { this.tagC = p.tc; this.tagN = p.name; this.tagT = p.title; this.char.setLabel(p.name, p.tc, p.title); }
        if (p.team !== this.teamKey) { this.teamKey = p.team; this.team = p.team ? p.team.split(',').filter((id) => buddyById[id]) : []; }
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y, smp.z)), near = d2 < (lowQ() ? 170 * 170 : 260 * 260);
        this.char.setVisible(near);
        this.onKeys = !air && boardAt(smp.x, smp.z) >= 0;
        // the keys they run over light up (on your screen, from where they are)
        if (this.onKeys && view) { const si = boardAt(smp.x, smp.z), k = keyAt(si, smp.x, smp.z); if (k >= 0 && (k !== this.lastKey || si !== this.lastSi)) { this.lastKey = k; this.lastSi = si; view.lightKey(si, k); } } else this.lastKey = -1;
        if (near) {
            this.char.fitLabel(Math.sqrt(d2));
            const q = remSt; q.x = smp.x; q.y = smp.y - (this.onKeys ? ON_KEYS_DROP : 0); q.z = smp.z; q.ry = smp.ry; q.air = air; q.moving = smp.a === 1 || smp.speed > 2; q.speed = smp.speed; q.vy = this.vy; q.far = d2 > 110 * 110;
            this.char.update(dt, t, q);
            const B = BOARDS[p.tier] || BOARDS[0];
            this.char.setCombo(p.cb, B.acc, !!B.rgb);
            if (d2 < 120 * 120) placeTeam(this.buddyPos, this.team, smp.x, air ? Math.max(0, smp.y - 3) : smp.y, smp.z, smp.ry, t, dt);
        }
        this.x = smp.x; this.y = smp.y; this.z = smp.z; this.onGround = !air;
    }
    dispose() { this.char.dispose(); }
}
const lowQ = () => getQuality() === 'low';
// someone else's landing: the keys under them clack, quietly
function landAt(x, y, z, k) {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    if (d > 120) return;
    const si = boardAt(x, z);
    impact(x, si >= 0 ? KB_Y : 0, z, Math.min(1, k), 4);
    if (si >= 0) playAsmr('land', 0.3 * (1 - d / 120), 1, panOf(x, z)); else playAsmr('thud', 0.3 * (1 - d / 120), 0.9, panOf(x, z));
}
const seenIds = new Set();
let goldStr = null;
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    if (room.state.gold !== goldStr) { goldStr = room.state.gold; if (view) view.setGold(goldStr); }
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { if (S.name !== p.name) { S.name = p.name; labelMe(true); } return; }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p, id); remotes.set(id, r);
            if (!p.bot) { if (clockT > 4 && performance.now() > quietJoinsUntil) { BX.playerJoined(p.name); toast('⌨️ ' + p.name + ' joined!', '#7de8ff'); } else BX.playerInRoom(p.name); }
        }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}
// your own name tag: written a few times a second at most (every press changes it)
let labelAt = 0, quietJoinsUntil = 0;
function labelMe(force) {
    const now = performance.now();
    if (!me || (!force && now - labelAt < 400)) return;
    labelAt = now;
    me.setLabel(S.name, S.total, titleOf(S.total));
}
// where everyone stands (the keys they hold down): the nearest 8
const pressList = [], pressPool = [];
const pressOf = (i, x, y, z, d) => { const p = pressPool[i] || (pressPool[i] = [0, 0, 0, 0]); p[0] = x; p[1] = y; p[2] = z; p[3] = d; return p; };
function updatePresses() {
    pressList.length = 0;
    const b = P.b;
    if (b.onGround) pressList.push(pressOf(0, b.x, b.y, b.z, 0));
    for (const o of remotes.values()) if (o.onGround && o.onKeys && o.x !== undefined && pressList.length < 24) pressList.push(pressOf(pressList.length, o.x, o.y, o.z, (o.x - b.x) ** 2 + (o.z - b.z) ** 2));
    if (pressList.length > 8) pressList.sort((a, c) => a[3] - c[3]);
    for (let i = 0; i < 8; i++) { const p = pressList[i]; if (p) PRESS.value[i].set(p[0], p[1], p[2], 1); else PRESS.value[i].w = 0; }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
let switching = false;
// (the button lets go of the keyboard: SPACE jumps, it never presses the last button clicked again)
const bind = (sel, fn) => $(sel).addEventListener('click', (e) => { sfx('click'); e.currentTarget.blur(); fn(); });
bind('#bBuddies', () => openPanel('buddies'));
bind('#bTech', () => openPanel('tech'));
bind('#bReboot', () => openPanel('reboot'));
bind('#bSpin', () => openPanel('spin'));
bind('#bQuests', () => openPanel('quests'));
bind('#bDaily', () => openPanel('daily'));
bind('#bKeys', () => openPanel('keys'));
bind('#bRanks', () => openPanel('ranks'));
bind('#bSettings', () => openPanel('settings'));
bind('#bShop', () => openPanel('shop'));
bind('#bGift', () => openPanel('gifts'));
bind('#questLine', () => openPanel('quests'));
bind('#gemsBox', () => openPanel('shop'));
bind('#bX2', () => openPanel('shop'));
bind('#bGoBoard', () => goTo('board'));
bind('#bAdX2', () => watchAdX2());
bind('#bAuto', () => {
    const n = (S.ups && S.ups.auto) || 0;
    if (!n) {
        const u = UPGRADES.find((x) => x.id === 'auto'), cost = upgradeCost(u, 0);
        askConfirm('🤖', 'Auto Typer', 'It presses the key under you while you stand on a keyboard. Faster at the Tech Shop.', fmtComma(cost) + ' <i class="cc"></i>', () => { S.autoOn = true; storageSet('ks1_auto', '1'); net.send('upgrade', { id: 'auto' }); });
        return;
    }
    S.autoOn = !S.autoOn;
    storageSet('ks1_auto', S.autoOn ? '1' : '0');
    toast(S.autoOn ? '🤖 Auto Typer on: stand on a keyboard' : '🤖 Auto Typer off', S.autoOn ? '#7dff6b' : '#ffffff');
    updateHud();
});
S.autoOn = storageGet('ks1_auto') !== '0';
// the FREE x2 Clicks: a rewarded ad, granted by the server only once Boxity says it was watched
let adAsking = false;
actions.adsOk = () => BX.adsAvailable();
async function watchAdX2() {
    if (adAsking) return;
    if (!BX.adsAvailable()) { toast('No ad right now. Try again later!', '#ff9a8a'); return; }
    adAsking = true;
    const r = await BX.showRewarded('double-clicks');
    adAsking = false;
    if (r && r.status === 'completed' && r.rewardToken) net.send('adx2', { token: r.rewardToken });
    else toast('No ad was watched: try again later!', '#ff9a8a');
}
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.saveSetting = (o) => BX.saveSettings(o);
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { clicks: [], speed: [] };
actions.boards = () => boards;
actions.canOpenBoards = () => BX.isEmbedded();
actions.openBoard = (id) => { if (!BX.openLeaderboard(id)) toast('The full leaderboards are on Bloxity', '#ffffff'); };
let hatchWant = null, hatchAuto = false;
actions.hatch = (c, n) => { hatchWant = { c, n }; net.send('box', { id: c, n }); };
actions.onHatched = (out) => {
    screenConfetti(40);
    const best = out.slice().sort((a, b) => buddyById[b.id].mult - buddyById[a.id].mult)[0], k = buddyById[best.id];
    if (k.rarity === 'legendary' || k.rarity === 'epic') { sfx('rankup'); screenConfetti(90); }
    if (me) FX.sparkleColumn(P.b, k.c1);
};
actions.afterHatch = () => { if (hatchAuto && hatchWant) net.send('box', { id: hatchWant.c, n: hatchWant.n }); };
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
// Hosted on Boxity: every connect resolves a pod through the Boxity matchmaker (never the fixed <id>.host route); retried with a
// backoff while a server wakes up. Locally: the same server that serves the page (or the dev server's game port).
let relayId = '';
async function serverEndpoint() {
    if (BLOXITY_GAME_ID && BX.bloxity.available()) {
        const t0 = Date.now();
        let wait = 1200;
        while (Date.now() - t0 < 60000) {
            const r = await BX.resolveEndpoint(BLOXITY_GAME_ID);
            if (r && r.endpoint) { relayId = r.roomId || ''; if (r.cold) loadingText('Waking up a server…'); return r.endpoint; }
            loadingText('Waking up a server…');
            await sleep(wait); wait = Math.min(8000, wait * 1.6);
        }
        throw new Error('the Boxity matchmaker did not answer');
    }
    // (VITE_SERVER_URL: local test runs only, a game server on another local port)
    return import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3149` : location.origin);
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const b = P.b;
    const a = !b.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('ks1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('ks1_uid', uid); }
    return uid;
}
// an answer from the server: its numbers, plus what's been pressed since that it hasn't seen yet
function reconcile(m) {
    if (m.ack !== undefined) while (pending.length && pending[0].s <= m.ack) pending.shift();
    let g = 0;
    for (const p of pending) g += p.got;
    if (m.clicks !== undefined) S.clicks = m.clicks + g;
    if (m.total !== undefined) S.total = m.total + g;
    if (m.boot !== undefined) S.boot = m.boot + g;
    delete m.clicks; delete m.total; delete m.boot; delete m.ack;
    // the word: the server's, unless what's in flight is still to reach it
    if (m.word !== undefined && pending.length && m.word === S.word && (m.wi || 0) < (S.wi || 0)) delete m.wi;
}
let gotProfile = false, lastGems = 0, connLost = false, leaving = false, epochSet = false;
// a room by its id (?roomId= from Boxity's Open Rooms / an invite): 'relay~colyseus' joins that pod's room straight away
async function joinById(roomParam, opts) {
    const [relay, rid] = roomParam.includes('~') ? roomParam.split('~') : ['', roomParam];
    if (relay) { const c = new Client(BX.env().playUrl.replace(/^http/, 'ws') + '/v1/ws/' + relay); relayId = relay; return c.joinById(rid, opts); }
    if (BLOXITY_GAME_ID) {
        const r = await fetch(BX.env().playUrl + '/v1/dir/' + BLOXITY_GAME_ID + '/list').then((x) => x.json()).catch(() => null);
        const e = r && Array.isArray(r.rooms) ? r.rooms.find((x) => x.id === rid || x.roomId === rid || x.colyseusRoomId === rid) : null;
        if (e && e.joinUrl) return new Client(e.joinUrl).joinById(rid, opts);
    }
    return null;
}
async function connect(name, endpoint) {
    const id = BX.identity();
    const opts = { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('ks1_save') || '' };
    let room = null;
    const wantRoom = new URLSearchParams(location.search).get('roomId');
    if (wantRoom && !connect.tried) { connect.tried = true; try { room = await joinById(wantRoom, opts); } catch (e) { room = null; } }
    if (!room) { const url = endpoint || await serverEndpoint(); room = await new Client(url).joinOrCreate('desk', opts); }
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(relayId ? relayId + '~' + room.roomId : room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); if (!epochSet) { epochSet = true; setEpoch(m.now - 300000); } net.bloxity = !!m.bloxity; pingSend(); });
    room.onDrop(() => { toast('📶 Connection lost: reconnecting…', '#ffe24a'); });
    room.onReconnect(() => { toast('📶 Back online!', '#7dff6b'); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('ks1_save', m.save);
        delete m.now; delete m.save;
        const tier0 = S.tier;
        reconcile(m);
        Object.assign(S, m);
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        lastGems = m.gems;
        labelMe(true);
        if (view && S.tier !== tier0) view.setTier(S.tier, first || S.tier < tier0);
        refreshPanels();
        updateHud();
    });
    // while stomping: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        reconcile(m);
        const tier0 = S.tier;
        Object.assign(S, m);
        if (view && S.tier < tier0) view.setTier(S.tier, true);
        S.profileAt = S.profileAt || Date.now();
        labelMe(false);
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('toastreward', (m) => { toast(m.text, '#7dff6b'); sfx('gem'); });
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (view) view.setBoards(m); if (panelIs('ranks')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !/cc/.test(m.text) ? '💎' : '🎁', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (/cc/.test(m.text)) flyClicks(6); });
    room.onMessage('lucky', (m) => { sfx('lucky'); floatText('CRIT x10 +' + fmtNum(m.got), '#ffe24a', FX.tmpV.set(P.b.x, P.b.y + 8, P.b.z), 6, true); FX.powerFx(P.b, 0xffe24a, 12); });
    room.onMessage('golden', (m) => {
        sfx('lucky'); playAsmr('mega', 0.5, 1.4);
        bigText('GOLDEN KEY! +' + fmt(m.got), '#ffd23a');
        const st = SETUPS[m.si], key = KEYS[m.k];
        if (st && key) { FX.fireworks(FX.tmpV.set(st.x + key.x, KB_Y + 6, st.z + key.z), lowQ() ? 1 : 3); FX.coinBurst(FX.tmpV.set(st.x + key.x, KB_Y + 2, st.z + key.z)); }
        flyClicks(8); shake = Math.max(shake, 0.25);
    });
    room.onMessage('goldfx', (m) => { const st = SETUPS[m.si], key = KEYS[m.k]; if (st && key) FX.sparkleColumn(FX.tmpV.set(st.x + key.x, KB_Y, st.z + key.z), 0xffd23a); });
    room.onMessage('mega', (m) => { floatText('+' + fmt(m.got), '#ffe24a', FX.tmpV.set(P.b.x, P.b.y + 11, P.b.z), 5, true); });
    room.onMessage('megafx', (m) => { if (view) view.pressMouse(m.si, m.side); const st = SETUPS[m.si]; if (st) { const d = Math.hypot(st.mouse.x - camera.position.x, st.mouse.z - camera.position.z); if (d < 120) playAsmr('mega', 0.5 * (1 - d / 120), 1.05, panOf(st.mouse.x, st.mouse.z)); } });
    room.onMessage('word', (m) => {
        sfx('task');
        bigText('"' + m.word + '" TYPED! +' + fmt(m.got), '#7dff6b');
        if (m.gems) setTimeout(() => toast('💎 +' + m.gems + ' Gems for every 5th word!', '#e0a8ff'), 600);
        confetti(P.b); flyClicks(6);
        S.word = m.next; S.wi = 0; stream += ' ';
        updateHud();
    });
    room.onMessage('tier', (m) => {
        const B = BOARDS[m.t];
        if (!B) return;
        S.tier = Math.max(S.tier, m.t);
        if (view) view.setTier(S.tier, false);
        sfx('rankup'); playAsmr('mega', 0.6, 0.8);
        popup('⌨️', 'NEW KEYBOARD!', B.name + ' · every press x' + fmt(B.mult), '#7dff6b');
        screenConfetti(lowQ() ? 60 : 140);
        const st = SETUPS[m.t];
        FX.fireworks(FX.tmpV.set(st.x, 16, st.z), lowQ() ? 3 : 7);
        shake = Math.max(shake, 0.3);
        setTimeout(() => toast('➡️ Follow the arrows to your new keyboard (or press TO KEYS)', '#ffe24a'), 1400);
        updateHud();
    });
    room.onMessage('frenzy', () => { sfx('rankup'); playAsmr('mega', 0.6, 1.2); bigText('⚡ KEY FRENZY! x3 CLICKS!', '#ffe24a'); screenConfetti(lowQ() ? 40 : 90); toast('⚡ Every key pays x3 for ' + CFG.frenzySecs + ' seconds: stomp fast!', '#ffe24a'); });
    room.onMessage('combo', (m) => { sfx('lucky'); bigText(m.n + ' COMBO! +' + fmt(m.got), '#ffb01a'); FX.powerFx(P.b, 0xffb01a, 14); FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.5, P.b.z), 0xffb01a, 14, 0.6); });
    room.onMessage('speedgo', (m) => { speedState = { at: m.at, end: m.end, cd: 0 }; speedN = 0; closeTop(); toast('⏱️ Get ready… click as fast as you can!', '#ffe24a'); });
    room.onMessage('speeddone', (m) => onSpeedDone(m));
    room.onMessage('warped', (m) => warpTo(m.x, m.y || 0, m.z));
    room.onMessage('rebooted', (m) => {
        sfx('rankup');
        popup('🔄', 'REBOOT ' + m.r + '!', 'Every press now x' + rebootMult(m.r) + ' · +' + m.gems + ' 💎', '#e0a8ff');
        screenConfetti(90);
        pending.length = 0;
        if (view) view.setTier(0, true);
        P.visited.clear();
        warpTo(m.x, 0, m.z);
    });
    room.onMessage('spun', (m) => onSpun(m));
    room.onMessage('offline', (m) => setTimeout(() => { popup('🤖', 'WELCOME BACK!', 'Your keyboards kept typing for ' + m.mins + ' min: +' + fmt(m.got) + ' <i class="cc"></i>', '#7dff6b', true); sfx('reward'); }, 1500));
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(50);
        if (m.what === 'upgrade') { const u = UPGRADES.find((x) => x.id === m.id); toast(u.icon + ' ' + u.name + ' ' + u.stat(m.n) + '!', '#7dff6b'); }
    });
    room.onMessage('adx2', (m) => { if (m.ok) { sfx('buy'); toast('⚡ x2 Clicks for ' + m.mins + ' minutes!', '#7dff6b'); screenConfetti(50); } else toast('The ad couldn\'t be checked: try again later', '#ff9a8a'); });
    room.onMessage('hatched', (m) => showHatch(m.c, m.out));
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done: ' + TASKS[m.k].text + '! Claim it in Quests', '#7dff6b'); });
    // (while the guide is on, the quest line shows the guide: its quests wait, ready to claim, until it's done)
    room.onMessage('questdone', () => { if (tutStep >= 0 && tutStep < TUT_N) return; sfx('task'); toast('🎯 Quest complete! Tap the quest to claim', '#7dff6b'); });
    room.onMessage('authed', (m) => { S.name = m.name; labelMe(true); });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.char.blox) playEmoteOn(r.char.blox, m.id); });
    room.onMessage('chat', (m) => { if (BX.hasChat()) return; const r = remotes.get(m.s); if (r) chatBubble(r.char.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    room.onLeave((code) => {
        if (leaving) return;
        running = false; connLost = true;
        audioAway(true);
        // a normal end: another tab took over. Anything else: find a server again and rejoin
        if (code === 4000) { showConnErr('You joined from somewhere else.'); return; }
        rejoin();
    });
    return room;
}
function showConnErr(text) {
    $('#start').hidden = false; $('#start').style.opacity = ''; $('#connectErr').hidden = false; $('#connectErr').textContent = text; $('#retryBtn').hidden = false; $('#loading').textContent = '';
}
async function rejoin() {
    $('#start').hidden = false; loadingText('Reconnecting…');
    for (let k = 0; k < 6; k++) {
        try {
            for (const r of remotes.values()) r.dispose();
            remotes.clear();
            gotProfile = false; pending.length = 0;
            endSpeedQuietly();
            // whoever's already there when we're back is in the room, not joining
            quietJoinsUntil = performance.now() + 1e9;
            await connect(BX.identity().loggedIn ? '' : (storageGet('ks1_name') || ''));
            const t0 = performance.now();
            while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
            connLost = false; running = true; audioAway(false);
            quietJoinsUntil = performance.now() + 2500;
            if (!entered) { view.setTier(S.tier || 0, true); S.joinedAt = Date.now(); }
            const p = net.room.state.players.get(net.room.sessionId);
            teleport(p ? p.x : SPAWN.x, 0, p ? p.z : SPAWN.z, Math.PI);
            $('#start').hidden = true;
            enterGame();
            return;
        } catch (e) { await sleep(2000 * (k + 1)); }
    }
    showConnErr('Lost the connection to the server.');
}
// a quick way round: behind a short fade
async function warpTo(x, y, z) {
    switching = true;
    await fadeOut();
    switching = false;
    teleport(x, y, z, Math.PI);
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboardBubble(text, group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, BX.bubbleSeconds() * 1000);
}
function billboardBubble(text, group) { return billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 12, 0), group); }
// a Boxity chat line over its sender's head (keyed by their Boxity id)
function onBoxityChat(m) {
    let root = null;
    if (m.isLocalPlayer) root = me && me.root;
    else { const uid = String(m.userId || '').replace(/^legion_/, ''); const room = net.room; if (room && room.state) room.state.players.forEach((p, id) => { if (p.bx && p.bx === uid) { const r = remotes.get(id); if (r) root = r.char.root; } }); }
    if (!root) return;
    const text = BX.bubbleText(m);
    if (!BX.attachBubble(T, root, text)) chatBubble(root, text);
}
// the daily reward pops up only on the desk, on the ground
function offerDaily() {
    if (!running || !P.b.onGround || anyPopup() || offerDaily.done || speedState) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20, songHot = false, hotT = 0, tutT = 0;
P.combo = 0;
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    tickKeys();
    pumpAvatars();
    beginBuddies();
    updateMe(dt);
    prof.mark('player');
    updatePrompt();
    syncRemotes(dt, t);
    prof.mark('others');
    updatePresses();
    updateGuide(t);
    updateMonitor(t);
    updateSpeed();
    updateFrenzy(dt);
    updateGoldArrow();
    tutT -= dt;
    if (tutT <= 0) { tutT = 0.25; updateTutorial(); }
    contactShadows();
    endBuddies();
    updateEffects(dt);
    updateFx(dt);
    animateCounters(dt);
    slowT -= dt;
    if (slowT <= 0) { slowT = 0.5; updateHud(); }
    // the easy song on the desk, the driving one while a big combo burns (with a little patience either way)
    const hot = (P.combo || 0) >= 40 || frenzyOn();
    hotT = hot === songHot ? 0 : hotT + dt;
    if (hotT > (hot ? 2 : 4)) { songHot = hot; hotT = 0; setMusicMode(hot ? 'climb' : 'plaza'); }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality)
function contactShadows() {
    if (window.__noPhysics) return;
    SH.shadowsOn(getQuality() === 'low');
    SH.begin();
    const b = P.b;
    SH.add(b.x, P.onKeys ? KB_Y : groundUnder(b.x, b.z, b.y), b.z, b.y, 3);
    for (const r of remotes.values()) if (r.x !== undefined) SH.add(r.x, r.onKeys ? KB_Y : 0, r.z, r.y, 3);
    SH.end();
}
function groundUnder(x, z, y) { const mi = mouseAt(x, z); return mi >= 0 && y >= SETUPS[mi].mouse.top - 0.5 ? SETUPS[mi].mouse.top : 0; }
const AMB = { color: 0xfff0c8, dir: 0.3, snow: false };
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (view) view.update(dt, t, camera);
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, AMB);
    setSpeedLines(0, dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing on fast screens: when most frames miss the refresh and some don't, draw every other refresh instead
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
let paceOff = false;
function paceFrames() {
    if (!running || document.hidden || isTouch || paceOff) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) { paced = true; skipOdd = true; pacedAt = now; strikes = 0; }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0, offscreen = false;
document.addEventListener('visibilitychange', () => { offscreen = document.hidden; if (running) audioAway(offscreen || connLost || paused); });
function frame(now) {
    requestAnimationFrame(frame);
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running && !paused) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    await waitForLogin(400);
    const saved = (storageGet('ks1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        showConnErr('Could not reach the game server. Check your connection and try again.');
        BX.loadingEnd();
        return;
    }
    joining = false;
    if (connLost) { BX.loadingEnd(); return; }
    view.setTier(S.tier || 0, true);
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    const p = net.room.state.players.get(net.room.sessionId);
    teleport(p ? p.x : SPAWN.x, 0, p ? p.z : SPAWN.z, Math.PI);
    cam.yaw = 0; cam.pitch = 0.36;
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    if (connLost) { BX.loadingEnd(); return; }
    // everyone's avatar made behind the loading screen too
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) await sleep(30); }
    enterGame();
}
// the loading screen goes, the HUD and the music come: once, whether loading ends here or a reconnect finishes it (the connection
// dropped mid-load)
let entered = false;
function enterGame() {
    if (entered) return;
    entered = true;
    if (!me) buildMe();
    fpsAcc = 0; fpsFrames = 0;
    allowLiveMusic(getQuality() !== 'low');
    startMusic();
    setMusicMode('plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    showTips();
    BX.adScreen('gameplay');
    BX.gameplayStart();
    if (!S.presses) setTimeout(() => bigText('STOMP THE KEYS!', '#ffe24a'), 500);
    else toast('👋 Welcome back, ' + (S.name || 'typist') + '!', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for the key sounds!', '#7de8ff'); }, 3500);
    if (S.presses > 100) setTimeout(offerDaily, 1500); else setTimeout(offerDaily, 90000);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
    console.info('[Bloxity] environment:', BX.env().env, '· SDK', BX.bloxity.ready ? 'ready' : 'missing');
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
function showTips() {
    if (isTouch) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = k('WASD', 'Move') + k('Click', 'Press the key under you') + k('Space', 'Jump (stomps keys)') + k('Drag', 'Camera') + k('E', 'Use') + k('R', 'To your keys') + k('B', 'Buddies');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 12000);
    setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    const unlock = () => { if (audioSuspended()) resumeAudio(); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', (v) => { const p = pct(v); if (p !== undefined && BX.isEmbedded()) setVolume('master', p); });
    BX.listenSetting('music_volume', (v) => { const p = pct(v); if (p !== undefined && BX.isEmbedded()) setVolume('music', p); });
    BX.listenSetting('graphics_quality', embedded((v) => { setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : v === 'Ultra' || v === 'High' ? 'high' : getQuality(), true); musicLite(v === 'Low'); }));
    BX.listenSetting('camera_sensitivity', (v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); });
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) { if (speedState) return; goTo('spawn'); } }
        else if (event === 'chat_message_sent' && data && !BX.hasChat()) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me && me.blox) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
    if (BX.hasChat()) BX.onChat(onBoxityChat);
    // an ad break: everything stops and goes quiet, then carries on
    BX.onAdBreak(() => { paused = true; audioAway(true); for (const k in keys) keys[k] = false; }, () => { paused = false; lastFrame = 0; audioAway(offscreen || connLost); });
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes the game uses: the first time
// a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = ['🛒📋🔄✨📅🌈⚙️🎁💎📦⌨️🖱️🖥️🔑⏱️🎡🔥🎯✅⭐🏆👋📶🔊🎟️🔒🤖⚡👟🍀🦘🐾➡️💬🥇🥈🥉✓✕'].map((e) => `<div style="font-size:2rem;white-space:nowrap">${e}</div>`).join('')
        + ['var(--chunky)', 'var(--font)'].map((f) => `<div class="o" style="font-family:${f};font-size:2.4rem;white-space:nowrap">KEYSTOMP COMBO x2.25 NEW KEYBOARD! GOLDEN KEY! MEGA CLICK! TYPED! SPEED TEST GET READY TIME! REBOOT Clicks 0123456789:.,/ STOMP THE KEYS</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [34, 36, 44, 50, 52, 70]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬🔒💎🖱️ Clicks: 0123456789 Keyboard Newbie KEYSTOMP', 4, 100); }
}
function startSounds(low) { initAudio(); prerenderMusic(); void low; }
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Luckiest Guy"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Polishing the keycaps…', 0.18);
    buildView();
    SH.initShadows();
    await pause();
    step('Recording the switches…', 0.36);
    await buildAsmr(pause, getQuality() === 'low');
    startSounds(getQuality() === 'low');
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now)
    step('Waking up the Desk Buddies…', 0.55);
    for (const id of ['eraser', 'sticky', 'pencil', 'floppy']) buddyIcon(id);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const endPanels = warmPanels();
        for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the keys, the buddies, every effect) compiled and drawn once now, not in play
    step('Warming up the keys…', 0.75);
    const extras = [fxWarmGroup(), keyWarmGroup()];
    for (const g of extras) { g.position.set(0, -60, 0); scene.add(g); }
    buddiesWarm();
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -60, 10); a.update(1 / 60, { t: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    camera.position.set(0, 60, 180); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    gpuName();
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    for (const g of extras) scene.remove(g);
    beginBuddies(); endBuddies();
    setMood('desk', true);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    // the emote catalogue, once at startup (from the environment Boxity told the page)
    BX.loadEmotes().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    // ONE identity listener (bloxity.js holds the only onUserChanged subscription): a sign-in mid-game is verified on this same
    // connection (the server swaps in the account's progress), so nobody is pulled out of their room
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    BX.onEnvironmentChanged(() => console.info('[Bloxity] environment:', BX.env().env));
    addEventListener('pagehide', () => { leaving = true; try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot: type the word on your best keyboard (walk to each letter), wander the keys, hop now and then, jump on the
// mouse's button once in a while
// =====================================================================================
// the autopilot speaks in world directions; the camera turns them, so undo that
function mapInput(o) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const f = o.mx * fx + o.mz * fz, r = o.mx * rx + o.mz * rz;
    return { mx: fx * f + rx * r, mz: fz * f + rz * r, jump: o.jump, hold: o.hold };
}
function deskPilot() {
    let warpAt = 0, hopAt = 0, wander = null, wanderUntil = 0;
    return () => {
        const b = P.b, out = { mx: 0, mz: 0, jump: false, hold: false };
        if (!view || switching || speedState) return out;
        const t = S.tier || 0, st = SETUPS[t];
        // far from your best keyboard: go there
        if ((Math.abs(b.x - st.x) > 70 || Math.abs(b.z - st.z) > 40) && clockT > warpAt) { warpAt = clockT + 3; goTo('board'); return out; }
        let tgt;
        const ch = S.word ? S.word[S.wi] : '';
        if (ch && clockT % 20 < 14) { const k = keyOfChar(ch); tgt = { x: st.x + KEYS[k].x, z: st.z + KEYS[k].z }; }
        else {
            if (!wander || clockT > wanderUntil) { wander = { x: st.x + (RND() - 0.5) * 70, z: st.z + (RND() - 0.5) * 22 }; wanderUntil = clockT + 1.5 + RND() * 2; }
            tgt = wander;
        }
        const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
        if (d > 0.8) { out.mx = dx / d; out.mz = dz / d; }
        if (b.onGround && clockT > hopAt) { hopAt = clockT + 2 + RND() * 3; out.jump = true; out.hold = true; }
        if (RND() < 0.1) clickNow(false);
        cam.yaw = 0;
        return mapInput(out);
    };
}
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view,
        state: () => ({ x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, clicks: S.clicks, total: S.total, boot: S.boot, tier: S.tier, gems: S.gems, presses: S.presses, words: S.words, word: S.word, wi: S.wi, golds: S.golds, megas: S.megas, combo: P.combo, boxes: S.boxes, snaps: P.snaps, programs: renderer.info.programs.length, prompt: activePrompt && activePrompt.label(), q: getQuality(), others: remotes.size, qi: S.qi, speed: !!speedState }),
        auto: (on) => { P.auto = on === false ? null : deskPilot(); },
        key: (code, down) => { keys[code] = !!down; if (down && code === 'Space') P.jumpPress = clockT; },
        jump: () => { P.jumpPress = clockT; },
        click: () => clickNow(false),
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); teleport(x, y, z, yaw); },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        speed: () => startSpeed(),
        tap: () => speedTap(),
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        noPace: () => { paceOff = true; skipOdd = false; paced = false; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        hatch: (c, n) => net.send('box', { id: c, n: n || 1 }),
        hatchAuto: (on) => { hatchAuto = !!on; },
        remotes: () => remotes,
        holdWatch: (s) => holdFpsWatch(s),
    };
}
void QUESTS; void boxById; void panelIs; void LEADERBOARDS; void fadeIn; void holdFpsWatch; void lowQ;
