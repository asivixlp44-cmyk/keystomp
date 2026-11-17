// Procedural soundtrack, effects and the ASMR sounds (Web Audio, no asset files).
//
// Music, two songs of our own:
// - "Launch Field" (on the field): a bright, bouncy groove in D at 104 BPM: a plucked lead over a warm pad, hand drums, a soft
//   arpeggio, bass, kick and shaker.
// - "Ravine Run" (in the air): a driving chase in E at 150 BPM: the bass in sixteenths, four on the floor, the lead climbing.
// Each song is rendered once in the background into eight-bar loops (one per intensity) and plays from those (see "the songs as
// loops"). Their instruments are synthesised a note at a time, sample by sample, the first time a note is needed (see "the
// instruments"): a note is then a buffer source and a gain.
//
// The ASMR sounds (asmr.js: the keys under your feet) and the effects (made there too) are synthesised once into buffers; playAsmr
// and sfx play one with a gain (and a pan, or a little of the room's reverb).
import { asmrBuffer, fxBuffer, fxWet } from './asmr.js';

let ctx = null, master, comp, musicBus, musicOut, duckFilter, sfxBus, fxSend, asmrBus, reverb, roomVerb, delay, panL, panR;
let meter = null;
let musicOn = false, schedTimer = null, seqStep = 0, nextTime = 0, ducked = false;
const settings = { music: 0.5, sfx: 0.8, asmr: 0.9, master: 1, muted: false, off: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ks1_audio') || '{}')); } catch (e) { /* defaults */ }

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const vary = (n) => (Math.random() * n) | 0;
let intensity = 1;
// 0 calm (before GO), 1 racing, 2 the last stretch
export function setMusicIntensity(k) { intensity = Math.max(0, Math.min(2, k | 0)); }

// a stereo pan into a bus (where there's no panner: the bus itself)
function panner(c, to, v) { if (!c.createStereoPanner) return to; const p = c.createStereoPanner(); p.pan.value = v; p.connect(to); return p; }
export function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 1.0;
    comp.connect(master).connect(ctx.destination);
    meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
    musicBus = ctx.createGain();
    duckFilter = ctx.createBiquadFilter(); duckFilter.type = 'lowpass'; duckFilter.frequency.value = 20000; duckFilter.Q.value = 0.5;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 11000; warm.Q.value = 0.3;
    musicOut = ctx.createGain();
    musicBus.connect(warm).connect(duckFilter).connect(musicOut).connect(comp);
    panL = panner(ctx, musicBus, -0.4); panR = panner(ctx, musicBus, 0.4);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    asmrBus = ctx.createGain(); asmrBus.connect(comp);
    applyVolumes();
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(ctx, 1.8, 3.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.24;
    reverb.connect(revGain).connect(musicBus);
    // the room the effects ring on in (a station's stone): every effect that wants it sends into it through one gain
    roomVerb = ctx.createConvolver(); roomVerb.buffer = makeIR(ctx, 1.1, 3);
    const roomGain = ctx.createGain(); roomGain.gain.value = 0.25;
    roomVerb.connect(roomGain).connect(sfxBus);
    fxSend = ctx.createGain(); fxSend.gain.value = 0.8; fxSend.connect(roomVerb);
    delay = ctx.createDelay(1);
    // a dotted eighth of Desk Jam (the song that plays live while its loops are still rendering)
    delay.delayTime.value = 0.433;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 3600;
    const dlGain = ctx.createGain(); dlGain.gain.value = 0.2;
    delay.connect(dlf).connect(fb).connect(delay);
    dlf.connect(dlGain).connect(musicBus);
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else if (!away) ctx.resume();
    });
}
function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    // (the Sound button: everything off)
    const m = (settings.master ?? 1) * (settings.off ? 0 : 1);
    musicOut.gain.setTargetAtTime(settings.muted ? 0 : settings.music * 1.5 * m * (ducked ? 0.6 : 1), t, 0.08);
    sfxBus.gain.setTargetAtTime(settings.sfx * m, t, 0.05);
    asmrBus.gain.setTargetAtTime((settings.asmr ?? 1) * 1.1 * m, t, 0.05);
}
function save() { try { localStorage.setItem('ks1_audio', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
export function getVolumes() { return { ...settings }; }
export function setVolume(kind, v) { settings[kind] = Math.max(0, Math.min(1, v)); save(); applyVolumes(); }
export function toggleMusic() { settings.muted = !settings.muted; save(); applyVolumes(); return !settings.muted; }
export const musicMuted = () => !!settings.muted;
// the HUD's Sound button: every sound off (music, footsteps, effects), or back on
export function toggleSound() { settings.off = !settings.off; save(); applyVolumes(); return !settings.off; }
export const soundOff = () => !!settings.off;
// Browsers keep audio off until a click or key press: every gesture retries until it's running
// scrolled out of view, or the connection's gone: silence until told otherwise
let away = false;
export function audioAway(on) { away = !!on; if (!ctx) return; if (away) ctx.suspend(); else if (!document.hidden) ctx.resume(); }
export function resumeAudio() { if (away) return; initAudio(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); if (ctx && !musicOn && wantMusic) startMusic(); }
const level = () => { if (!meter) return 0; const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return +p.toFixed(3); };
export const audioDebug = () => ({ peak: level(), state: ctx && ctx.state, musicOn, settings: { ...settings }, intensity, song: song === SONGS.climb ? 'climb' : 'plaza', loops: { plaza: !!loops.plaza, climb: !!loops.climb }, loopStats, player: player ? nameOf(player.song) + ':' + player.k : '', voices: { asmr: voices, fx: fxVoices } });
export const audioSuspended = () => !ctx || ctx.state !== 'running';
// Menus open: the music goes muffled and a little quieter
export function setMusicDuck(on) {
    if (!ctx || on === ducked) return;
    ducked = on;
    duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, ctx.currentTime, 0.12);
    applyVolumes();
}

// ----- the music's pad -----
// a soft pad: the chord on pairs of detuned saws through a low-pass, swelling in and out (built from nodes, a chord at a time: in
// the loops' rendering, or live only until they're ready)
function pad(t, notes, dur, gain, cut) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.45, dur * 0.3)); g.gain.setValueAtTime(gain, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    f.connect(g); g.connect(musicBus); g.connect(reverb);
    for (const n of notes) for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.35);
    }
}

// ----- the instruments -----
// Each note of each instrument is synthesised sample by sample the first time it's asked for, at the rate it plays at (the loops'
// while they render, the device's live), and kept. A note in play is then a buffer source and a gain, not a dozen oscillators,
// filters and envelopes.
const TAU = Math.PI * 2;
const kitCache = new Map();
function kit(name, n, len) {
    const sr = ctx.sampleRate, key = name + n + ':' + (len ? len.toFixed(3) : '') + '@' + sr;
    let b = kitCache.get(key);
    if (!b) {
        const x = SYN[name](n, sr, len);
        b = ctx.createBuffer(1, x.length, sr);
        b.copyToChannel(x, 0);
        kitCache.set(key, b);
    }
    return b;
}
// a note: a buffer from t at a gain into a bus (the music's by default), some of it into the reverb and the echo
function voice(buf, t, gain, out, wet, echo) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = gain;
    src.connect(g).connect(out || musicBus);
    if (wet) send(g, reverb, wet);
    if (echo) send(g, delay, echo);
    src.start(Math.max(0, t));
    return g;
}
function send(g, to, amt) { if (amt >= 1) g.connect(to); else { const s = ctx.createGain(); s.gain.value = amt; g.connect(s).connect(to); } }
// a decaying sine added into x from `at` s: f Hz, amplitude a, dying away at d per second (a running recurrence, not a sin() a sample)
function partial(x, sr, f, a, d, at) {
    if (f >= sr * 0.45) return;
    const w = TAU * f / sr, c = 2 * Math.cos(w), e = Math.exp(-d / sr);
    let s1 = 0, s2 = -Math.sin(w), env = a;
    for (let i = Math.round((at || 0) * sr); i < x.length && env > 1e-5; i++) { x[i] += s1 * env; const s0 = c * s1 - s2; s2 = s1; s1 = s0; env *= e; }
}
// noise between lo and hi Hz, from `at` s for len s, amplitude a dying away at d per second (an attack of att s)
function hiss(x, sr, at, len, a, d, lo, hi, att) {
    const i0 = Math.round(at * sr), n = Math.round(len * sr), cl = 1 - Math.exp(-TAU * lo / sr), ch = 1 - Math.exp(-TAU * Math.min(hi, sr * 0.45) / sr), e = Math.exp(-d / sr), A = (att || 0) * sr;
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0, env = a;
    for (let i = 0; i < n && i0 + i < x.length; i++, env *= e) {
        const w = Math.random() * 2 - 1;
        l1 += (w - l1) * cl; l2 += (l1 - l2) * cl; h1 += (w - l2 - h1) * ch; h2 += (h1 - h2) * ch;
        x[i0 + i] += h2 * env * (i < A ? i / A : 1);
    }
}
// the finish: an attack of att s, a short fade at the end, the peak at 1
function fin(x, sr, att) {
    let m = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; }
    const k = m > 0 ? 1 / m : 0, A = Math.max(1, Math.round(att * sr)), F = Math.min(x.length, Math.round(sr * 0.015));
    for (let i = 0; i < x.length; i++) x[i] *= k * (i < A ? (i + 1) / A : 1) * (i >= x.length - F ? (x.length - i) / F : 1);
    return x;
}
// a band-limited saw's correction at its jump (polyBLEP)
const blep = (p, dt) => (p < dt ? ((p /= dt), p + p - p * p - 1) : p > 1 - dt ? ((p = (p - 1) / dt), p * p + p + p + 1) : 0);
// a resonant low-pass (a state-variable filter): const lp = svf(); lp.set(cutoff, rate, q) now and then; y = lp.run(x) a sample
function svf() {
    let a = 0, b = 0, a1 = 0, a2 = 0, a3 = 0;
    return {
        set(fc, sr, q) { const g = Math.tan(Math.PI * Math.min(fc, sr * 0.45) / sr); a1 = 1 / (1 + g * (g + 1 / q)); a2 = g * a1; a3 = g * a2; },
        run(v) { const v3 = v - b, v1 = a1 * a + a2 * v3, v2 = b + a2 * a + a3 * v3; a = 2 * v1 - a; b = 2 * v2 - b; return v2; },
    };
}
// a string plucked (Karplus-Strong) at f Hz, ringing T s: bright, how far up the harmonics the pluck reaches (a multiple of the note);
// pos, where along the string it's plucked (a fraction: near the bridge it's nasal, the harmonics with a node there missing; 0 anywhere)
function string(sr, f, T, bright, pos) {
    const L = Math.max(1, Math.round(sr * T)), y = new Float32Array(L), D = sr / f - 0.5, N = Math.floor(D), fr = D - N;
    const rho = Math.pow(0.001, 1 / (f * T)), cut = 1 - Math.exp(-TAU * Math.min(f * bright, sr * 0.4) / sr), ex = new Float32Array(N + 1);
    let lp = 0, mean = 0;
    for (let i = 0; i <= N; i++) { lp += (Math.random() * 2 - 1 - lp) * cut; ex[i] = lp; }
    if (pos) { const P = Math.max(1, Math.round(N * pos)); for (let i = N; i >= P; i--) ex[i] -= ex[i - P]; }
    for (let i = 0; i <= N; i++) mean += ex[i] / (N + 1);
    for (let i = 0; i < L; i++) { const j = i - N; y[i] = (i <= N ? ex[i] - mean : 0) + (j >= 2 ? rho * 0.5 * ((1 - fr) * y[j] + y[j - 1] + fr * y[j - 2]) : 0); }
    return y;
}
// the body of a plucked note (a round thump on it, b of its first peak, dying at d) and a gentle low-pass at c Hz
function body(x, sr, f, b, d, c) {
    let pk = 0;
    for (let i = 0, m = Math.min(x.length, Math.round(2 * sr / f)); i < m; i++) pk = Math.max(pk, Math.abs(x[i]));
    partial(x, sr, f, b * pk, d);
    for (let i = 0, y = 0, k = 1 - Math.exp(-TAU * Math.min(c, sr * 0.4) / sr); i < x.length; i++) { y += (x[i] - y) * k; x[i] = y; }
    return x;
}
const SYN = {
    // an oud-like plucked string: Karplus-Strong, plucked near the bridge (nasal), a round body thump, a little bright
    oud(n, sr, T) {
        const f = midi(n), x = string(sr, f, T || 0.9, 9, 0.13);
        body(x, sr, f, 0.35, 9, 4200);
        hiss(x, sr, 0, 0.006, 0.12, 400, 1800, 6000);
        return fin(x, sr, 0.0008);
    },
    // hand drums: 0 doum (the deep middle of the skin: a falling low tone), 1 tek (the rim: a bright slap), 2 ka (a softer rim tick)
    drum(v, sr) {
        v %= 3;
        if (v === 0) {
            const x = new Float32Array(Math.round(sr * 0.42));
            for (let i = 0, ph = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (82 + 70 * Math.exp(-t * 26)) / sr; if (ph > TAU) ph -= TAU; x[i] = Math.sin(ph) * Math.exp(-t * 7.5); }
            partial(x, sr, 164, 0.18, 14);
            hiss(x, sr, 0, 0.01, 0.25, 260, 600, 3000);
            return fin(x, sr, 0.001);
        }
        const x = new Float32Array(Math.round(sr * (v === 1 ? 0.16 : 0.1)));
        partial(x, sr, v === 1 ? 760 : 980, 0.55, v === 1 ? 42 : 60); partial(x, sr, v === 1 ? 1290 : 1650, 0.3, 70);
        hiss(x, sr, 0, 0.05, v === 1 ? 0.9 : 0.55, v === 1 ? 70 : 110, 1800, 11000, 0.0004);
        return fin(x, sr, 0.0003);
    },
    // a synth pluck: a saw and a square an octave up through a low-pass that snaps shut (the arpeggios), ringing T s
    pluck(n, sr, T) {
        const f = midi(n), R = T || 0.5, x = new Float32Array(Math.round(sr * R)), lp = svf(), dt = f / sr;
        for (let i = 0, p = 0, p2 = 0; i < x.length; i++) {
            const t = i / sr;
            if ((i & 15) === 0) lp.set(f * (1.2 + 7 * Math.exp(-t * 16)), sr, 1.4);
            const sw = (2 * p - 1 - blep(p, dt)) * 0.7 + (p2 < 0.5 ? 0.3 : -0.3);
            p += dt; if (p >= 1) p -= 1; p2 += dt * 2; if (p2 >= 1) p2 -= 1;
            x[i] = lp.run(sw) * Math.min(1, t / 0.002) * Math.exp(-t * 3.2 / R);
        }
        return fin(x, sr, 0);
    },
    // a glass bell: a few partials not quite in tune with each other, a soft knock on its front (the sparkle; the tune when it's
    // calm), ringing T s
    bell(n, sr, T) {
        const f = midi(n), R = T || 1.4, x = new Float32Array(Math.round(sr * R)), d = 3.2 / R;
        partial(x, sr, f, 1, d); partial(x, sr, f * 2.01, 0.42, d * 1.5); partial(x, sr, f * 3.02, 0.2, d * 2.2); partial(x, sr, f * 4.2, 0.12, d * 3.4); partial(x, sr, f * 5.43, 0.06, d * 5);
        hiss(x, sr, 0, 0.012, 0.25, 220, 2500, 9000);
        return fin(x, sr, 0.002);
    },
    // the lead: a pulse wave and a saw a few cents apart through a low-pass that opens, sliding up into its pitch, a vibrato coming
    // in late, held len s
    lead(n, sr, len) {
        const f = midi(n), x = new Float32Array(Math.round(sr * (len + 0.14))), lp = svf();
        let d1 = 0, d2 = 0;
        for (let i = 0, p1 = 0, p2 = 0.37; i < x.length; i++) {
            const t = i / sr;
            if ((i & 15) === 0) {
                const sc = (1 - 0.02 * Math.exp(-t * 40)) * (1 + 0.006 * Math.sin(TAU * 5.6 * t) * Math.min(1, Math.max(0, (t - 0.16) / 0.2)));
                d1 = f * 1.003 * sc / sr; d2 = f * 0.997 * sc / sr;
                lp.set(400 + f * (1.6 + 3.2 * (1 - Math.exp(-t * 30))), sr, 1.2);
            }
            const sw = (p1 < 0.34 ? 0.8 : -0.8) + 2 * p2 - 1 - blep(p2, d2);
            p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1;
            x[i] = lp.run(sw) * Math.min(1, t / 0.012) * (0.84 + 0.16 * Math.exp(-t * 8)) * (t > len ? Math.exp(-(t - len) * 36) : 1);
        }
        return fin(x, sr, 0);
    },
    // the bass: a saw and its fundamental through a low-pass that snaps shut, held len s (the filter retuned every 16 samples)
    bass(n, sr, len) {
        const f = midi(n), x = new Float32Array(Math.round(sr * (len + 0.05))), dt = f / sr, lp = svf();
        for (let i = 0, p = 0; i < x.length; i++) {
            const t = i / sr, s = 0.85 * (2 * p - 1 - blep(p, dt)) + 0.45 * Math.sin(TAU * p);
            p += dt; if (p >= 1) p -= 1;
            if ((i & 15) === 0) lp.set(160 + 2600 * Math.exp(-t * 20), sr, 1.1);
            x[i] = lp.run(s) * Math.min(1, t / 0.002) * (0.6 + 0.4 * Math.exp(-t * 16)) * (t > len ? Math.exp(-(t - len) * 70) : 1);
        }
        return fin(x, sr, 0);
    },
    // a kick: a sine falling fast into a low note, a click on its front (odd: shorter)
    kick(v, sr) {
        const x = new Float32Array(Math.round(sr * 0.34));
        for (let i = 0, ph = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (48 + 150 * Math.exp(-t * 34)) / sr; if (ph > TAU) ph -= TAU; x[i] = Math.sin(ph) * Math.exp(-t * (v % 2 ? 13 : 9)); }
        hiss(x, sr, 0, 0.008, 0.3, 300, 1800, 7000);
        return fin(x, sr, 0.0006);
    },
    // 0 a snare (a tone and a crack of noise), 1 a clap (three bursts of noise close together), 2 a rim tick
    snare(v, sr) {
        v %= 3;
        if (v === 2) { const x = new Float32Array(Math.round(sr * 0.09)); partial(x, sr, 1320, 0.6, 80); partial(x, sr, 2150, 0.35, 110); hiss(x, sr, 0, 0.008, 0.6, 300, 2500, 9000); return fin(x, sr, 0.0004); }
        const x = new Float32Array(Math.round(sr * 0.26));
        if (v === 1) { for (const at of [0, 0.011, 0.023]) hiss(x, sr, at, 0.2, 0.7, 30, 900, 5200, 0.001); }
        else { partial(x, sr, 196, 0.55, 26); partial(x, sr, 292, 0.3, 34); hiss(x, sr, 0, 0.24, 0.85, 22, 1400, 9000, 0.0008); }
        return fin(x, sr, 0.0006);
    },
    // a hi-hat: 0 and 1 closed (a tick of bright noise), 2 open (longer)
    hat(v, sr) { v %= 3; const L = v === 2 ? 0.22 : 0.05, x = new Float32Array(Math.round(sr * L)); hiss(x, sr, 0, L, 1, v === 2 ? 16 : 70 + v * 20, 7000, 15000, 0.0006); return fin(x, sr, 0); },
    // a riser: a sweep of noise opening up (into the top of a loop)
    sweep(v, sr) {
        const L = 0.7, x = new Float32Array(Math.round(sr * L));
        for (let i = 0, l1 = 0, l2 = 0; i < x.length; i++) { const u = i / x.length, k = 1 - Math.exp(-TAU * (300 + 9000 * u * u) / sr), w = Math.random() * 2 - 1; l1 += (w - l1) * k; l2 += (l1 - l2) * k; x[i] = l2 * Math.pow(u, 1.5); }
        return fin(x, sr, 0);
    },
    // a crash: a long bright wash, a few metal partials in it
    crash(v, sr) { const x = new Float32Array(Math.round(sr * 1.6)); hiss(x, sr, 0, 1.6, 1, 2.6, 4000, 15000, 0.002); for (const f of [3150, 4370, 5230, 6970, 8110]) partial(x, sr, f, 0.03, 4); return fin(x, sr, 0.001); },
};

// ----- the two songs -----
// the chords: a root (the bass's) and the notes the pad and the arpeggios play
const CH = {
    // Desk Jam, in C major
    C: { r: 36, n: [60, 64, 67, 72] }, G: { r: 43, n: [59, 62, 67, 71] }, Am: { r: 45, n: [57, 60, 64, 69] }, F: { r: 41, n: [57, 60, 65, 69] },
    // Key Rush, in D major
    D2: { r: 38, n: [62, 66, 69, 74] }, A2: { r: 45, n: [61, 64, 69, 73] }, Bm: { r: 47, n: [59, 62, 66, 71] }, G2: { r: 43, n: [59, 62, 67, 71] },
};
const SONGS = {
    // the desk: "Desk Jam", C major, 112 BPM
    plaza: {
        bpm: 112,
        // each bar's chords, a half bar each
        harm: [['C', 'C'], ['G', 'G'], ['Am', 'Am'], ['F', 'F'], ['C', 'C'], ['G', 'G'], ['F', 'G'], ['C', 'C']],
        // the tune, in sixteenths: [sixteenth, note, sixteenths long]
        lead: [
            [[0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 76, 2], [10, 79, 2], [12, 84, 4]],
            [[0, 83, 2], [2, 79, 2], [4, 74, 4], [8, 79, 2], [10, 83, 2], [12, 86, 4]],
            [[0, 84, 3], [3, 81, 1], [4, 76, 4], [8, 81, 2], [10, 84, 2], [12, 88, 4]],
            [[0, 86, 2], [2, 84, 2], [4, 81, 2], [6, 77, 2], [8, 81, 6], [14, 84, 2]],
            [[0, 79, 2], [2, 81, 2], [4, 79, 2], [6, 76, 2], [8, 72, 4], [12, 76, 4]],
            [[0, 79, 4], [4, 83, 2], [6, 86, 2], [8, 83, 4], [12, 79, 4]],
            [[0, 81, 2], [2, 84, 2], [4, 86, 4], [8, 83, 2], [10, 86, 2], [12, 91, 4]],
            [[0, 88, 6], [6, 84, 2], [8, 79, 4], [12, 72, 4]],
        ],
    },
    // a big combo burning: "Key Rush", D major, 140 BPM
    climb: {
        bpm: 140,
        harm: [['D2', 'D2'], ['A2', 'A2'], ['Bm', 'Bm'], ['G2', 'G2'], ['D2', 'D2'], ['A2', 'A2'], ['G2', 'A2'], ['D2', 'D2']],
        lead: [
            [[0, 74, 2], [2, 78, 2], [4, 81, 2], [6, 78, 2], [8, 86, 4], [12, 85, 4]],
            [[0, 81, 2], [2, 85, 2], [4, 88, 4], [8, 85, 2], [10, 81, 2], [12, 76, 4]],
            [[0, 83, 2], [2, 86, 2], [4, 90, 4], [8, 88, 2], [10, 86, 2], [12, 83, 4]],
            [[0, 86, 4], [4, 83, 2], [6, 79, 2], [8, 83, 6], [14, 86, 2]],
            [[0, 90, 2], [2, 88, 2], [4, 86, 2], [6, 81, 2], [8, 86, 4], [12, 90, 4]],
            [[0, 88, 3], [3, 85, 1], [4, 81, 4], [8, 85, 4], [12, 88, 4]],
            [[0, 86, 2], [2, 83, 2], [4, 79, 4], [8, 85, 2], [10, 88, 2], [12, 93, 4]],
            [[0, 90, 6], [6, 86, 2], [8, 81, 4], [12, 74, 4]],
        ],
    },
};
let song = SONGS.plaza, songNext = SONGS.plaza, STEP = 60 / song.bpm / 4;
// 'plaza' (the Oasis and the stages) or 'climb' (a race): the song changes at the next bar
export function setMusicMode(name) { if (SONGS[name]) songNext = SONGS[name]; }
function playStep(s, t) {
    const bar = Math.floor(s / 16) % 8, i = s % 16;
    if (song === SONGS.plaza) plazaStep(bar, i, t, intensity); else climbStep(bar, i, t, intensity);
}
// the arpeggio's way up and down the chord, a sixteenth a note
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 2, 1];
// the hand drums' maqsum, a bar in sixteenths: 0 doum, 1 tek, -1 nothing (ka ticks fill the rest at the busier intensity)
const MAQSUM = [0, -1, 1, -1, -1, -1, 1, -1, 0, -1, -1, -1, 1, -1, -1, -1];
// Desk Jam: calm (0, and the only loop on Low) a music box of plucked keys has the tune over the pad, a long bass note each half
// bar, a soft kick and a rim tick; then (1) the bright lead takes the tune (the plucks doubling it an octave down), the plucks run the
// chord in sixteenths, the bass bounces in eighths, a kick and a clap, hats, a riser and a crash into the top
function plazaStep(bar, i, t, k) {
    const ch = CH[song.harm[bar][i >> 3]];
    if (i === 0) pad(t, ch.n.map((n) => n - 12), STEP * 16, k ? 0.003 : 0.0036, 1300);
    for (const [s0, n, len] of song.lead[bar]) if (s0 === i) {
        if (k) { voice(kit('lead', n, STEP * len * 0.9), t, 0.04, panL, 0.6, 0.3); voice(kit('pluck', n - 12, 0.5), t, 0.03, panR, 0.5); }
        else { voice(kit('pluck', n, 0.6), t, 0.05, musicBus, 0.7, 0.35); voice(kit('bell', n + 12, 0.5), t, 0.008, panR, 0.8); }
    }
    if (!k) {
        if (i === 0 || i === 8) { voice(kit('bass', ch.r + 12, STEP * 7), t, 0.07); voice(kit('kick', 1), t, 0.05); }
        if (i === 4 || i === 12) voice(kit('snare', 2), t, 0.03, panL, 0.2);
        if (i % 4 === 2) voice(kit('pluck', ch.n[ARP[i >> 2] % 4], 0.4), t, 0.022, i % 8 === 2 ? panR : panL, 0.5, 0.25);
        return;
    }
    // the plucks running the chord, a sixteenth a note, an octave up on the offbeats
    voice(kit('pluck', ch.n[ARP[i]] + (i % 4 === 2 ? 12 : 0), 0.3), t, i % 2 ? 0.018 : 0.024, i % 2 ? panR : panL, 0.35, 0.2);
    // the bass: the root in eighths, its octave skipping in
    if (i % 2 === 0) voice(kit('bass', ch.r + 12 + (i % 8 === 6 ? 12 : 0), STEP * 1.6), t, i % 4 ? 0.055 : 0.075);
    if (i === 0 || i === 8 || i === 10) voice(kit('kick', 0), t, i === 10 ? 0.07 : 0.1);
    if (i === 4 || i === 12) voice(kit('snare', 1), t, 0.06, musicBus, 0.3);
    if (i % 2 === 0) voice(kit('hat', i % 4 ? 0 : 1), t, i % 4 ? 0.016 : 0.009, panR);
    else if (i === 15) voice(kit('hat', 2), t, 0.012, panL);
    // a riser into the top of the loop, a crash on it
    if (bar === 7 && i === 6) voice(kit('sweep', 0), t, 0.026, musicBus, 0.4);
    if (bar === 0 && i === 0) voice(kit('crash', 0), t, 0.03, musicBus, 0.5);
}
// Key Rush: calm (0) a pad, the bass pulsing low, plucks picking the chord, a heartbeat kick; busy (1) the
// bass driving in sixteenths (its octave on the offbeats), four on the floor, a clap on two and four, the hand drums, hats, the
// arpeggio, the lead's tune; the last stretch (2) a crash, the lead doubled an octave down, bells, a drum roll and a riser
function climbStep(bar, i, t, k) {
    const ch = CH[song.harm[bar][i >> 3]], r = ch.r + 12, fill = bar === 7 && i >= 8;
    if (i === 0) pad(t, ch.n, STEP * 16, k ? 0.004 : 0.0056, k ? 1700 : 1100);
    if (!k) {
        if (i % 2 === 0) { voice(kit('pluck', ch.n[ARP[i >> 1] % 4] + 12, 0.4), t, 0.026, i % 4 ? panR : panL, 0.6, 0.3); voice(kit('bass', r, STEP * 0.9), t, 0.05); }
        if (i === 0 || i === 3) voice(kit('kick', 1), t, i ? 0.05 : 0.08);
        if (i % 4 === 2) voice(kit('hat', 0), t, 0.012, panL);
        return;
    }
    // the bass: sixteenths, the root with its octave on the offbeats
    voice(kit('bass', r + (i % 4 === 2 ? 12 : i === 15 ? 7 : 0), STEP * 0.85), t, i % 4 === 0 ? 0.1 : 0.07);
    voice(kit('pluck', ch.n[ARP[i]] + 12, 0.3), t, 0.016, i % 2 ? panL : panR, 0.3, 0.2);
    // four on the floor; a snare on two and four (a roll into the top of the loop); hats on the offbeats and ticking between
    if (i % 4 === 0) voice(kit('kick', 0), t, 0.14);
    if (fill) voice(kit('snare', i % 2 ? 2 : 0), t, 0.03 + (i - 8) * 0.006, musicBus, 0.3);
    else if (i === 4 || i === 12) voice(kit('snare', 1), t, 0.07, musicBus, 0.3);
    if (i % 4 === 2) voice(kit('hat', 2), t, 0.018, panR); else if (i % 2) voice(kit('hat', vary(2)), t, 0.012, panL);
    if (i === 0 && (bar === 0 || (k === 2 && bar === 4))) voice(kit('crash', 0), t, 0.06, musicBus, 0.5);
    if (k === 2) {
        if (i % 4 === 1) voice(kit('bell', ch.n[(i >> 2) % 4] + 24, 0.6), t, 0.012, panR, 1);
        if (bar === 7 && i === 0) voice(kit('sweep', 0), t, 0.04, musicBus, 0.4);
        if ((i === 6 || i === 14) && !fill) voice(kit('snare', 2), t, 0.03, panL, 0.3);
    }
    for (const [s0, n, len] of song.lead[bar]) if (s0 === i) {
        voice(kit('lead', n, STEP * len * 0.9), t, k === 2 ? 0.062 : 0.056, musicBus, 0.5, 0.25);
        if (k === 2) voice(kit('lead', n - 12, STEP * len * 0.9), t, 0.03, panL, 0.5);
    }
}

// ----- the songs as loops -----
// Every part repeats after eight bars, so each song is rendered once per intensity (in the background, an
// OfflineAudioContext) into an eight-bar loop, and the loops play from buffers, in step, crossfading as the
// intensity changes. Played live, a note at a time, a song builds a hundred-odd audio nodes a second: a few
// percent of every frame on a weak laptop's main thread, and the audio thread's work on top.
// Until a song's loops are ready it plays live, as it always did.
const LOOP_STEPS = 128, LOOP_RATE = 24000;
const KS = { plaza: [0, 1], climb: [0, 1, 2] };
const loops = { plaza: null, climb: null };
let player = null;     // the loops playing: { song, srcs, gains, k }
const nameOf = (sg) => (sg === SONGS.climb ? 'climb' : 'plaza');
// the loop for an intensity: the nearest one rendered so far
const loopK = (sg, k) => Math.min(k, (loops[nameOf(sg)] || KS[nameOf(sg)]).length - 1);
function scheduler() {
    while (nextTime < ctx.currentTime + 0.2) {
        // (no live notes: the next song waits until its loops are ready, the one playing carries on)
        if (seqStep % 16 === 0 && song !== songNext && (liveMusic || loops[nameOf(songNext)])) {
            // the new song from its first bar; the old one's loops stop there
            song = songNext; STEP = 60 / song.bpm / 4; seqStep = 0;
            if (player) stopPlayer(nextTime);
        }
        if (player && globalThis.__ovtLegacy) stopPlayer(nextTime);
        // more of this song's loops ready since it started: picked up at the bar line, seamlessly
        if (player && seqStep % 16 === 0 && loops[nameOf(song)] && loops[nameOf(song)].length > player.srcs.length) stopPlayer(nextTime);
        if (!player && loops[nameOf(song)] && seqStep % 16 === 0 && !globalThis.__ovtLegacy) startPlayer(nextTime, (seqStep % LOOP_STEPS) * STEP);
        if (!player && liveMusic) playStep(seqStep, nextTime);
        nextTime += STEP;
        seqStep++;
    }
    if (player) {
        const k = Math.min(loopK(song, intensity), player.gains.length - 1);
        if (k !== player.k) { player.k = k; player.gains.forEach((g, i) => g.gain.setTargetAtTime(i === k ? 1 : 0, ctx.currentTime, 0.12)); }
    }
}
function startPlayer(t, offset) {
    const k = loopK(song, intensity), srcs = [], gains = [];
    loops[nameOf(song)].forEach((buf, i) => {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buf; src.loop = true;
        g.gain.value = i === k ? 1 : 0;
        src.connect(g).connect(musicBus);
        src.start(t, offset);
        srcs.push(src); gains.push(g);
    });
    player = { song, srcs, gains, k };
}
function stopPlayer(t) {
    for (const g of player.gains) { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.06); }
    for (const src of player.srcs) src.stop(t + 0.08);
    player = null;
}
function makeIR(c, secs, decay) {
    const len = Math.round(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
}
// the time left before the next frame (none known: a few ms)
// the idle time left before the next frame; a game using all of every frame (a weak laptop) has none,
// so then a short slice every tenth of a second
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback((d) => r(d), { timeout: 100 }) : setTimeout(() => r(null), 50)));
// behind the loading screen the loops get big slices (nothing else is drawing yet); in play, idle moments only
let loadingFast = false;
// (on Low, what the loading screen didn't finish waits for the first 20 s of play: a player's first moments stay smooth)
let holdUntil = 0;
const slice = () => (loadingFast ? new Promise((r) => setTimeout(() => r({ fast: true }), 0)) : performance.now() < holdUntil ? new Promise((r) => setTimeout(r, holdUntil - performance.now())).then(idle) : idle());
let loopIR = null;
const PRE_STEPS = 16;
// One song at one intensity: its eight bars after a bar of run-up (the end of the loop, so the loop
// starts with its own last notes' echoes still ringing, as it will when it goes round), the notes laid
// out a few at a time in idle moments (each instrument's notes synthesised as they're first needed), then the eight bars kept.
// QA: how long each loop took (the notes laid out on the main thread, in ms; its slices; the audio rendering)
const loopStats = [];
async function renderLoop(sg, k) {
    const w0 = performance.now(); let js = 0, slices = 0;
    const step = 60 / sg.bpm / 4, len = Math.round(LOOP_STEPS * step * LOOP_RATE), pre = Math.round(PRE_STEPS * step * LOOP_RATE);
    const oc = new OfflineAudioContext(2, pre + len, LOOP_RATE);
    const bus = oc.createGain(); bus.connect(oc.destination);
    const rv = oc.createConvolver(); rv.buffer = loopIR || (loopIR = makeIR(oc, 1.8, 3.2));
    const rg = oc.createGain(); rg.gain.value = 0.24; rv.connect(rg).connect(bus);
    // the echo a dotted eighth behind, in time with the song
    const dl = oc.createDelay(1); dl.delayTime.value = step * 3;
    const fb = oc.createGain(); fb.gain.value = 0.3;
    const lf = oc.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 3600;
    const dg = oc.createGain(); dg.gain.value = 0.2;
    dl.connect(lf).connect(fb).connect(dl); lf.connect(dg).connect(bus);
    const pl = panner(oc, bus, -0.4), pr = panner(oc, bus, 0.4);
    for (let s = -PRE_STEPS; s < LOOP_STEPS;) {
        const d = await slice(), until = performance.now() + (d && d.fast ? 12 : d && !d.didTimeout ? Math.min(6, Math.max(1, d.timeRemaining() - 1)) : 2);
        // the note builders draw on these: pointed at the offline graph while they build, all in one go
        // (the live music never sees them)
        const live = { ctx, musicBus, reverb, delay, panL, panR, song, STEP, intensity };
        ctx = oc; musicBus = bus; reverb = rv; delay = dl; panL = pl; panR = pr; song = sg; STEP = step; intensity = k;
        const j0 = performance.now(); slices++;
        try { do { playStep((s + LOOP_STEPS) % LOOP_STEPS, (s + PRE_STEPS) * step); s++; } while (s < LOOP_STEPS && performance.now() < until); } finally { ({ ctx, musicBus, reverb, delay, panL, panR, song, STEP, intensity } = live); }
        js += performance.now() - j0;
    }
    const r0 = performance.now(), out = await oc.startRendering();
    loopStats.push({ song: nameOf(sg), k, js: Math.round(js), slices, render: Math.round(performance.now() - r0), wall: Math.round(performance.now() - w0) });
    const loop = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: LOOP_RATE });
    for (let c = 0; c < 2; c++) loop.copyToChannel(out.getChannelData(c).subarray(pre, pre + len), c);
    return loop;
}
let loopsStarted = false;
// on Low only the first (calm) loop of each song is made: the others are minutes of synthesis in a weak device's idle moments,
// and megabytes of notes for the garbage collector, all while you play (the song keeps one mood instead of rising with the chase)
let loopsMax = 9;
export function musicLite(on) { loopsMax = on ? 1 : 9; }
// on a slow device (Low quality) the music waits for its loops in silence rather than being played note by note
let liveMusic = true;
export function allowLiveMusic(on) { liveMusic = !!on; }
// each instrument's synthesis run once first on a throwaway note, a slice each, so its code is warmed up (compiled) before the
// loops need it: a first, slow run in the middle of play would hold a frame up
async function warmKit() { for (const name of Object.keys(SYN)) { await slice(); SYN[name](72, LOOP_RATE, 0.05); } }
async function renderLoops() {
    if (loopsStarted || typeof OfflineAudioContext === 'undefined') return;
    loopsStarted = true;
    try {
        await warmKit();
        // the calmest loop of the song playing now, then the other song's, then the rest: a song plays as soon as
        // it has one (the music starts several times sooner than waiting for all of them)
        const order = nameOf(song) === 'climb' ? ['climb', 'plaza'] : ['plaza', 'climb'];
        for (let i = 0; i < Math.max(KS.plaza.length, KS.climb.length) && i < loopsMax; i++) {
            for (const name of order) {
                if (i >= KS[name].length) continue;
                const buf = await renderLoop(SONGS[name], KS[name][i]);
                (loops[name] || (loops[name] = [])).push(buf);
            }
        }
    } catch (e) { console.warn('[music] loops', e); }
    // the notes synthesised for the loops aren't needed again
    for (const key of [...kitCache.keys()]) if (key.endsWith('@' + LOOP_RATE)) kitCache.delete(key);
}
let wantMusic = false;
export function startMusic() {
    wantMusic = true;
    if (!ctx || musicOn) return;
    musicOn = true;
    seqStep = 0; nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 30);
    // a few seconds in, not while the game is still settling after loading
    loadingFast = false;
    holdUntil = performance.now() + (loopsMax === 1 ? 20000 : 0);
    if (!loopsStarted) setTimeout(renderLoops, 5000);
}
// while the game loads: the songs' loops start rendering now, in big slices, so the music never has to be
// played note by note (that builds a hundred-odd audio nodes a second: a real cost on a slow phone)
export function prerenderMusic() { if (!ctx || loopsStarted) return; loadingFast = true; renderLoops(); }
export function stopMusic() { musicOn = false; clearInterval(schedTimer); if (player) stopPlayer(ctx.currentTime); }


// =====================================================================================
// The ASMR sounds: key ('step', 'crunch', 'space', 'land', 'mega'...), gain, rate (pitch), pan -1..1, delay (s)
// =====================================================================================
let voices = 0;
const MAX_VOICES = 22;
export function playAsmr(key, gain, rate, pan, delay) {
    if (!ctx || ctx.state !== 'running' || settings.off || (settings.asmr ?? 1) <= 0 || voices >= MAX_VOICES) return;
    const b = asmrBuffer(ctx, key);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate || 1;
    const g = ctx.createGain();
    g.gain.value = gain ?? 1;
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
    src.connect(g);
    out.connect(asmrBus);
    voices++;
    src.onended = () => { voices--; src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
    src.start(ctx.currentTime + 0.003 + (delay || 0));
}

// =====================================================================================
// Sound effects (sfx(name, arg)): each one made once into a buffer (asmr.js, while loading), played as a buffer source and a gain,
// some of it ringing on in the room; arg pitches 'wall' (its combo). The menus, Golden Keys, gates, chests, fanfares, the station
// monsters, races and the rest.
// =====================================================================================
let fxVoices = 0;
const MAX_FX = 12;
const FX_RATE = { wall: (n) => Math.pow(2, (Math.min(12, n || 1) - 1) / 12) };
export function sfx(name, arg) {
    // (a sound asked for while the tab's away would wait, and play with all the others when it's back)
    if (ctx && ctx.state !== 'running') return;
    if (!ctx || settings.off || settings.sfx <= 0 || fxVoices >= MAX_FX) return;
    const b = fxBuffer(ctx, name);
    if (!b) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b;
    if (FX_RATE[name]) src.playbackRate.value = FX_RATE[name](arg);
    src.connect(g).connect(sfxBus);
    if (fxWet(name)) g.connect(fxSend);
    fxVoices++;
    src.onended = () => { fxVoices--; src.disconnect(); g.disconnect(); };
    src.start(ctx.currentTime + 0.005);
}

// ----- the rocket's engine: a looping rush of noise through a band-pass (k: 0 off, ~0.25 idling, 1 boosting) -----
let thrust = null;
function makeThrust() {
        const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
        let br = 0;
        for (let i = 0; i < len; i++) { br = br * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = (Math.random() * 2 - 1) * 0.35 + br * 4; }
        const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7; f.frequency.value = 600;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f).connect(lp).connect(g).connect(sfxBus);
        src.start();
        thrust = { src, f, lp, g };
}
// (made behind the loading screen, silent)
export function prepThrust() { if (ctx && !thrust) makeThrust(); }
export function thrustSound(k, speed) {
    if (!ctx) return;
    if (!thrust) { if (k <= 0.01) return; makeThrust(); }
    const t = ctx.currentTime, v = Math.max(0, Math.min(1, k));
    thrust.g.gain.setTargetAtTime(v * 0.5, t, 0.06);
    thrust.f.frequency.setTargetAtTime(300 + v * 700 + (speed || 0) * 2.2, t, 0.1);
    thrust.lp.frequency.setTargetAtTime(900 + v * 2600, t, 0.1);
}
