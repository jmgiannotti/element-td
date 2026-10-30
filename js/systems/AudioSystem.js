import { SONGS, DEFAULT_SONG, MOOD_LEVELS } from '../data/MusicData.js';

/**
 * Every sound is synthesised at runtime with Web Audio, for the same reason
 * every texture is drawn at runtime in BootScene: the game ships no asset
 * files. That includes the music (US 14.3), which is generated note by note.
 *
 * Exported as a module singleton rather than a per-scene object. The unlock
 * listeners live on `window`, and GameScene is restartable — a fresh instance
 * per restart would stack a new pair of listeners every time you lose.
 *
 * ── The signal chain ─────────────────────────────────────
 *
 *   voices ─┬─ (panner) ─ sfxBus ───┐
 *           └─ send ─ reverb ─ wet ─┼─ master ─ limiter ─ speakers
 *   music layers ─ musicBus ────────┘
 *
 * The limiter is what lets twenty towers fire at once without the sum
 * clipping into a crackle; the reverb is one shared room, so every cue sounds
 * like it happens in the same place; the panner puts a shot on the side of
 * the board it came from.
 */

// Minimum seconds between two plays of the same cue. Twenty towers firing at
// once must not stack twenty oscillators on the same millisecond.
const THROTTLE = {
    shoot: 0.045,
    hit: 0.05,
    die: 0.04,
    mana: 0.05,
    click: 0.02,
};

// Each element has its own voice, so a wall of towers reads as a mix of
// materials rather than one repeated blip: water bloops, fire crackles, air
// hisses, earth thuds, ice rings, storm zaps. Fusions borrow the family that
// dominates them and shift its pitch.
const SHOOT_VOICE = {
    water: { family: 'water', pitch: 1 },
    air: { family: 'air', pitch: 1 },
    fire: { family: 'fire', pitch: 1 },
    earth: { family: 'earth', pitch: 1 },
    ice: { family: 'ice', pitch: 1 },
    storm: { family: 'storm', pitch: 1 },
    lava: { family: 'fire', pitch: 0.7 },
    mud: { family: 'earth', pitch: 1.25 },
    blizzard: { family: 'ice', pitch: 1.2 },
    ashstorm: { family: 'storm', pitch: 0.7 },
    obsidian: { family: 'arcane', pitch: 0.8 },
    glacier: { family: 'ice', pitch: 0.75 },
    geyser: { family: 'water', pitch: 0.7 },
    ancestral: { family: 'arcane', pitch: 1.1 },
};

// Volumes the player sets in the options, kept between sessions.
const STORE = {
    sfx: 'elemental-td:sfx-volume',
    music: 'elemental-td:music-volume',
};

// ── Music ────────────────────────────────────────────────
// The songs themselves live in MusicData; this is the player.
// Seconds a layer keeps being scheduled after its mood turns it off, so it
// fades out instead of being cut.
const FADE_TAIL = 4;

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const jitter = (amount) => 1 + (Math.random() * 2 - 1) * amount;

function loadVolume(key, fallback) {
    try {
        const v = parseFloat(localStorage.getItem(key));
        return Number.isFinite(v) ? clamp01(v) : fallback;
    } catch {
        return fallback;
    }
}

function saveVolume(key, value) {
    try { localStorage.setItem(key, `${value}`); } catch {}
}

class AudioSystem {
    constructor() {
        this.enabled = true;
        this.masterVolume = 0.32;
        this.sfxVolume = loadVolume(STORE.sfx, 1);
        this.musicVolume = loadVolume(STORE.music, 0.6);
        /** The board's width in world pixels, for panning. GameScene sets it. */
        this.worldWidth = 640;
        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
        this._last = new Map();
        this._pan = 0;
        this._manaStep = 0;
        this._manaAt = -1;

        this._mood = 'calm';
        this._moodAt = 0;
        this._songId = DEFAULT_SONG;
        this._song = SONGS[DEFAULT_SONG];
        this._padVoices = [];
        this._musicStep = 0;
        this._musicNext = 0;
        this._musicTimer = null;

        // Browsers refuse to start an AudioContext without a user gesture.
        const unlock = () => this.unlock();
        if (typeof window !== 'undefined') {
            window.addEventListener('pointerdown', unlock);
            window.addEventListener('keydown', unlock);
        }
    }

    unlock() {
        if (!this.ctx) this._create();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    _create() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = this.ctx = new Ctx();

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        limiter.connect(ctx.destination);

        this.master = ctx.createGain();
        this.master.gain.value = this.enabled ? this.masterVolume : 0;
        this.master.connect(limiter);

        // Effects pass a gentle low-pass: square waves are all edge, and
        // the edge is what tires the ear over a long game.
        const soften = ctx.createBiquadFilter();
        soften.type = 'lowpass';
        soften.frequency.value = 9000;
        soften.connect(this.master);
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = this.sfxVolume;
        this.sfxBus.connect(soften);

        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = this.musicVolume * 0.5;
        this.musicBus.connect(this.master);

        // One second of white noise, reused by every percussive cue.
        const len = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        // The room: two seconds of decaying stereo noise as an impulse.
        this.reverb = ctx.createConvolver();
        const irLen = Math.floor(ctx.sampleRate * 2.2);
        const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
        }
        this.reverb.buffer = ir;
        const wet = ctx.createGain();
        wet.gain.value = 0.3;
        this.reverb.connect(wet);
        wet.connect(this.master);
        // What goes into the room passes the same volume as the dry sound,
        // or a muted bus would still be heard as its echo.
        this.sfxWet = ctx.createGain();
        this.sfxWet.gain.value = this.sfxVolume;
        this.sfxWet.connect(this.reverb);
        this.musicWet = ctx.createGain();
        this.musicWet.gain.value = this.musicVolume * 0.5;
        this.musicWet.connect(this.reverb);

        this._buildMusic();
    }

    setEnabled(on) {
        this.enabled = on;
        if (this.master) {
            this.master.gain.setTargetAtTime(on ? this.masterVolume : 0, this.ctx.currentTime, 0.03);
        }
        if (on) this.unlock();
    }

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /** Effects volume, 0–1, remembered between sessions. */
    setSfxVolume(v) {
        this.sfxVolume = clamp01(Math.round(v * 10) / 10);
        saveVolume(STORE.sfx, this.sfxVolume);
        if (!this.sfxBus) return;
        this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.03);
        this.sfxWet.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.03);
    }

    /** Music volume, 0–1, remembered between sessions. */
    setMusicVolume(v) {
        this.musicVolume = clamp01(Math.round(v * 10) / 10);
        saveVolume(STORE.music, this.musicVolume);
        if (!this.musicBus) return;
        this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5, this.ctx.currentTime, 0.05);
        this.musicWet.gain.setTargetAtTime(this.musicVolume * 0.5, this.ctx.currentTime, 0.05);
    }

    // ── Voices ───────────────────────────────────
    /**
     * Sends a voice's output to `bus` (the effects bus unless told otherwise),
     * through a panner while a cue is placed on the board, and `wet` of it
     * into the shared room. Only effects use `wet`: the music's layers each
     * have their own send (_buildMusic), so a layer fading out takes its
     * echo with it.
     */
    _route(node, wet = 0, bus = this.sfxBus, pan = this._pan) {
        let out = node;
        if (pan && this.ctx.createStereoPanner) {
            const p = this.ctx.createStereoPanner();
            p.pan.value = pan;
            node.connect(p);
            out = p;
        }
        out.connect(bus);
        if (wet > 0) {
            const send = this.ctx.createGain();
            send.gain.value = wet;
            out.connect(send);
            send.connect(this.sfxWet);
        }
    }

    /**
     * One oscillator (two with `detune`, in cents, for a fuller sound),
     * optionally through a low-pass at `cut`. `at` is an absolute start time,
     * for the music; cues use `delay` from now.
     */
    _tone({
        type = 'triangle', freq, to, dur = 0.1, gain = 0.2, delay = 0, at,
        attack = 0.005, cut = 0, detune = 0, wet = 0, bus, pan,
    }) {
        const ctx = this.ctx;
        const t0 = at ?? ctx.currentTime + delay;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.01));

        let head = env;
        if (cut) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = cut;
            f.connect(env);
            head = f;
        }
        for (const cents of detune ? [-detune / 2, detune / 2] : [0]) {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.detune.value = cents;
            osc.frequency.setValueAtTime(freq, t0);
            if (to != null && to !== freq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
            }
            osc.connect(head);
            osc.start(t0);
            osc.stop(t0 + dur + 0.03);
        }
        this._route(env, wet, bus ?? this.sfxBus, pan ?? this._pan);
    }

    /** Filtered noise: `filter` low/high/band-pass swept from `from` to `to`. */
    _noise({
        dur = 0.08, gain = 0.15, delay = 0, at, from = 3000, to = 400,
        filter = 'lowpass', q = 0.7, attack = 0, wet = 0, bus, pan,
    }) {
        const ctx = this.ctx;
        const t0 = at ?? ctx.currentTime + delay;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        // Start somewhere different each time, so two hits are never the
        // same grain of noise.
        const offset = Math.random() * 0.9;

        const f = ctx.createBiquadFilter();
        f.type = filter;
        f.Q.value = q;
        f.frequency.setValueAtTime(from, t0);
        f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);

        const env = ctx.createGain();
        if (attack > 0) {
            env.gain.setValueAtTime(0.0001, t0);
            env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        } else {
            env.gain.setValueAtTime(gain, t0);
        }
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(f);
        f.connect(env);
        this._route(env, wet, bus ?? this.sfxBus, pan ?? this._pan);
        src.start(t0, offset);
        src.stop(t0 + dur + 0.03);
    }

    // ── Cues ─────────────────────────────────────
    /**
     * `x`, when given, is where on the board the cue happens (world pixels):
     * it pans the cue toward that side, never all the way.
     */
    play(name, arg, x) {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
        if (this.sfxVolume <= 0) return;

        const gap = THROTTLE[name];
        if (gap) {
            const last = this._last.get(name);
            if (last !== undefined && this.ctx.currentTime - last < gap) return;
            this._last.set(name, this.ctx.currentTime);
        }

        const cue = this[`_${name}`];
        if (!cue) return;
        this._pan = x == null ? 0 : (clamp01(x / this.worldWidth) * 2 - 1) * 0.6;
        cue.call(this, arg);
        this._pan = 0;
    }

    _shoot(element) {
        const v = SHOOT_VOICE[element] ?? { family: 'arcane', pitch: 1 };
        const p = v.pitch * jitter(0.04);
        switch (v.family) {
            case 'water':
                this._tone({ type: 'sine', freq: 900 * p, to: 380 * p, dur: 0.09, gain: 0.07 });
                this._tone({ type: 'sine', freq: 1400 * p, to: 700 * p, dur: 0.05, gain: 0.025, delay: 0.015 });
                break;
            case 'air':
                this._noise({ dur: 0.07, gain: 0.05, from: 2500 * p, to: 6000 * p, filter: 'highpass' });
                this._tone({ type: 'triangle', freq: 1300 * p, to: 1800 * p, dur: 0.05, gain: 0.03 });
                break;
            case 'fire':
                this._noise({ dur: 0.1, gain: 0.07, from: 1400 * p, to: 500 * p, filter: 'bandpass', q: 1.2 });
                this._tone({ type: 'sawtooth', freq: 260 * p, to: 140 * p, dur: 0.08, gain: 0.03, cut: 900 });
                break;
            case 'earth':
                this._tone({ type: 'triangle', freq: 180 * p, to: 70 * p, dur: 0.11, gain: 0.1 });
                this._noise({ dur: 0.07, gain: 0.05, from: 700 * p, to: 120 });
                break;
            case 'ice':
                // Two sines at an inharmonic ratio: glass, not a whistle.
                this._tone({ type: 'sine', freq: 1760 * p, dur: 0.12, gain: 0.04, wet: 0.15 });
                this._tone({ type: 'sine', freq: 1760 * 2.76 * p, dur: 0.08, gain: 0.015 });
                this._noise({ dur: 0.03, gain: 0.02, from: 6000, to: 4000, filter: 'highpass' });
                break;
            case 'storm':
                this._tone({ type: 'sawtooth', freq: 1200 * p, to: 300 * p, dur: 0.07, gain: 0.035, cut: 3000 });
                this._noise({ dur: 0.05, gain: 0.035, from: 4000, to: 2500, filter: 'highpass' });
                break;
            default:
                this._tone({ type: 'triangle', freq: 660 * p, to: 440 * p, dur: 0.12, gain: 0.05, detune: 12 });
                this._tone({ type: 'sine', freq: 1320 * p, dur: 0.1, gain: 0.02, wet: 0.3 });
        }
    }

    _hit() {
        this._noise({ dur: 0.045, gain: 0.05, from: 1800 * jitter(0.15), to: 600, filter: 'bandpass', q: 1.5 });
        this._tone({ type: 'sine', freq: 320 * jitter(0.1), to: 180, dur: 0.04, gain: 0.03 });
    }

    /** A soft pop, not a beep: the twentieth one in a wave must not grate. */
    _die(isBoss) {
        if (isBoss) {
            this._tone({ type: 'triangle', freq: 160, to: 35, dur: 0.9, gain: 0.25, wet: 0.4 });
            this._noise({ dur: 0.8, gain: 0.18, from: 1600, to: 60, wet: 0.4 });
            [392, 523, 659].forEach((f, i) => this._tone({
                type: 'triangle', freq: f, dur: 0.7, gain: 0.06, delay: 0.25 + i * 0.09, wet: 0.5,
            }));
            return;
        }
        const p = jitter(0.08);
        this._tone({ type: 'triangle', freq: 520 * p, to: 140 * p, dur: 0.12, gain: 0.08 });
        this._noise({ dur: 0.09, gain: 0.05, from: 1400, to: 250, filter: 'bandpass', q: 0.9 });
    }

    _leak() {
        // Losing a life has to cut through whatever else is playing.
        this._tone({ type: 'sawtooth', freq: 330, to: 110, dur: 0.38, gain: 0.14, cut: 1400, detune: 18 });
        this._tone({ type: 'sawtooth', freq: 262, to: 87, dur: 0.42, gain: 0.1, cut: 1100, delay: 0.12 });
        this._tone({ type: 'sine', freq: 80, to: 40, dur: 0.35, gain: 0.18 });
    }

    /** Pickups close together climb a scale, so a combo is heard as one. */
    _mana() {
        const now = this.ctx.currentTime;
        this._manaStep = now - this._manaAt < 1.2 ? Math.min(this._manaStep + 1, 7) : 0;
        this._manaAt = now;
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        const f = midiHz(81 + scale[this._manaStep]);
        this._tone({ type: 'sine', freq: f, to: f * 1.5, dur: 0.12, gain: 0.07, wet: 0.35 });
        this._tone({ type: 'triangle', freq: f * 2, dur: 0.09, gain: 0.025, delay: 0.05, wet: 0.35 });
    }

    _build() {
        this._tone({ type: 'triangle', freq: 180, to: 90, dur: 0.12, gain: 0.14 });
        this._noise({ dur: 0.1, gain: 0.1, from: 900, to: 150, wet: 0.15 });
        this._tone({ type: 'square', freq: 600, dur: 0.03, gain: 0.025, delay: 0.06, cut: 2000 });
    }

    _sell() {
        // The build cue read backwards — rising instead of falling — with a
        // coin on top, so a demolition still sounds like money coming in.
        this._tone({ type: 'triangle', freq: 110, to: 210, dur: 0.1, gain: 0.12 });
        this._coinAt(0.07);
    }

    _coin() {
        this._coinAt(0);
    }

    _coinAt(delay) {
        // Two bell pings a fifth apart: money coming back, not money spent.
        [1318, 1976].forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.18, gain: 0.06, delay: delay + i * 0.06, wet: 0.3 });
            this._tone({ type: 'triangle', freq: f * 2, dur: 0.06, gain: 0.015, delay: delay + i * 0.06 });
        });
    }

    _temple() {
        // Heavier than a tower: a temple is the expensive build, and it
        // answers with a swell of choir.
        this._tone({ type: 'triangle', freq: 160, to: 80, dur: 0.3, gain: 0.16 });
        this._noise({ dur: 0.2, gain: 0.08, from: 800, to: 120 });
        [440, 554, 659].forEach((f, i) => this._tone({
            type: 'sine', freq: f, dur: 0.9, gain: 0.05, attack: 0.15, delay: 0.05 + i * 0.04, detune: 10, wet: 0.5,
        }));
    }

    _fusion() {
        [440, 554, 659, 880].forEach((f, i) => this._tone({
            type: 'sawtooth', freq: f, to: f * 1.5, dur: 0.18, gain: 0.05, delay: i * 0.06, cut: 2400, detune: 14, wet: 0.35,
        }));
        this._tone({ type: 'sine', freq: 1760, dur: 0.8, gain: 0.06, delay: 0.26, wet: 0.6 });
        this._tone({ type: 'sine', freq: 1760 * 2.76, dur: 0.4, gain: 0.015, delay: 0.26, wet: 0.6 });
    }

    _upgrade() {
        [523, 659, 784, 1047].forEach((f, i) => this._tone({
            type: 'triangle', freq: f, dur: 0.16, gain: 0.08, delay: i * 0.05, wet: 0.3,
        }));
        this._tone({ type: 'sine', freq: 2093, dur: 0.4, gain: 0.03, delay: 0.2, wet: 0.5 });
    }

    _wave() {
        // A horn: two detuned saws through a closing filter, with breath.
        this._tone({ type: 'sawtooth', freq: 196, dur: 0.35, gain: 0.1, attack: 0.04, cut: 900, detune: 16, wet: 0.4 });
        this._tone({ type: 'sawtooth', freq: 294, dur: 0.6, gain: 0.1, attack: 0.05, delay: 0.3, cut: 1100, detune: 16, wet: 0.5 });
        this._noise({ dur: 0.25, gain: 0.03, from: 1200, to: 600, filter: 'bandpass', attack: 0.04 });
    }

    _dash() {
        // A short upward whoosh: air moving, not a thing being struck.
        this._noise({ dur: 0.16, gain: 0.08, from: 500, to: 4000, filter: 'bandpass', q: 1.2 });
        this._tone({ type: 'sine', freq: 320, to: 880, dur: 0.14, gain: 0.05 });
    }

    _quake() {
        // Bottom-heavy, so it lands as an impact on the ground rather than a hit
        // on one enemy — the whole ring felt it.
        this._tone({ type: 'sine', freq: 90, to: 32, dur: 0.45, gain: 0.25 });
        this._tone({ type: 'triangle', freq: 130, to: 45, dur: 0.34, gain: 0.14 });
        this._noise({ dur: 0.35, gain: 0.14, from: 900, to: 70, wet: 0.25 });
    }

    /** A spell winding up: light being gathered, so everything rises. */
    _cast() {
        this._tone({ type: 'sine', freq: 220, to: 660, dur: 0.5, gain: 0.08, wet: 0.4 });
        this._tone({ type: 'triangle', freq: 330, to: 990, dur: 0.44, gain: 0.04, delay: 0.06, detune: 12, wet: 0.4 });
        this._noise({ dur: 0.4, gain: 0.04, from: 300, to: 3200, filter: 'bandpass', q: 2, attack: 0.2 });
    }

    /**
     * The moon landing. Bottom-heavy like the quake, because it is an impact —
     * but with a bell over it, because the thing that hit the ground is made of
     * the same light the lantern keeps.
     */
    _moon() {
        this._tone({ type: 'sine', freq: 80, to: 28, dur: 0.6, gain: 0.26 });
        this._tone({ type: 'triangle', freq: 110, to: 38, dur: 0.5, gain: 0.14 });
        this._noise({ dur: 0.4, gain: 0.13, from: 1400, to: 70, wet: 0.3 });
        [784, 1175].forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.9, gain: 0.07, delay: 0.04 + i * 0.05, wet: 0.6 });
        });
    }

    /** Soldiers stepping out of a rune: three quick rising notes, one each. */
    _summon() {
        [392, 523, 659].forEach((f, i) => {
            this._tone({ type: 'square', freq: f, to: f * 1.5, dur: 0.08, gain: 0.05, delay: i * 0.07, cut: 2200, wet: 0.25 });
        });
        this._noise({ dur: 0.18, gain: 0.04, from: 2400, to: 600 });
    }

    /** The aegis settling: a soft, warm chord rather than an impact. */
    _aegis() {
        [523, 659, 784].forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.7, gain: 0.05, attack: 0.08, delay: i * 0.03, detune: 8, wet: 0.5 });
        });
        this._tone({ type: 'triangle', freq: 262, to: 392, dur: 0.4, gain: 0.05 });
    }

    _sabotage() {
        this._tone({ type: 'triangle', freq: 150, to: 62, dur: 0.34, gain: 0.15 });
        this._noise({ dur: 0.26, gain: 0.09, from: 700, to: 110, wet: 0.2 });
    }

    /** Two low notes, falling: "no", without the buzzer. */
    _deny() {
        this._tone({ type: 'square', freq: 220, dur: 0.07, gain: 0.06, cut: 900 });
        this._tone({ type: 'square', freq: 165, dur: 0.1, gain: 0.06, delay: 0.07, cut: 800 });
    }

    _click() {
        this._tone({ type: 'triangle', freq: 1200, to: 900, dur: 0.03, gain: 0.05 });
    }

    _gameOver() {
        // Falling minor chords, slow, in the room.
        [[57, 60, 64], [53, 57, 60], [50, 53, 57], [45, 48, 52]].forEach((chord, i) => {
            for (const m of chord) {
                this._tone({ type: 'triangle', freq: midiHz(m), dur: 0.7, gain: 0.05, delay: i * 0.34, detune: 10, wet: 0.6 });
            }
        });
        this._tone({ type: 'sine', freq: midiHz(33), dur: 2, gain: 0.12, delay: 0.9, attack: 0.3, wet: 0.4 });
    }

    _victory() {
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone({ type: 'square', freq: f, dur: 0.26, gain: 0.06, delay: i * 0.13, cut: 3000, wet: 0.4 });
        });
        [523, 659, 784, 1047].forEach((f) => {
            this._tone({ type: 'triangle', freq: f, dur: 1.2, gain: 0.05, delay: 0.55, attack: 0.05, detune: 10, wet: 0.6 });
        });
    }

    // ── Boss Cues ─────────────────────────────────
    _boss_alert() {
        [180, 220, 293, 220].forEach((f, i) => {
            this._tone({ type: 'sawtooth', freq: f, dur: 0.32, gain: 0.11, delay: i * 0.14, cut: 1400, detune: 20, wet: 0.4 });
        });
        this._tone({ type: 'sine', freq: 55, dur: 0.9, gain: 0.2, attack: 0.05 });
        this._noise({ dur: 0.5, gain: 0.1, from: 800, to: 100, wet: 0.3 });
    }

    _boss_warn() {
        this._tone({ type: 'sine', freq: 300, to: 650, dur: 0.45, gain: 0.07, wet: 0.3 });
        this._tone({ type: 'sawtooth', freq: 110, to: 220, dur: 0.35, gain: 0.05, delay: 0.1, cut: 1200 });
    }

    _boss_slam() {
        this._tone({ type: 'sine', freq: 70, to: 25, dur: 0.7, gain: 0.3 });
        this._tone({ type: 'triangle', freq: 95, to: 30, dur: 0.55, gain: 0.16 });
        this._noise({ dur: 0.5, gain: 0.18, from: 1200, to: 60, wet: 0.35 });
    }

    _boss_fire() {
        this._noise({ dur: 0.7, gain: 0.16, from: 2400, to: 300, filter: 'bandpass', q: 0.8, wet: 0.3 });
        this._tone({ type: 'sawtooth', freq: 220, to: 80, dur: 0.4, gain: 0.08, cut: 1200 });
    }

    _boss_nova() {
        this._tone({ type: 'sine', freq: 660, to: 110, dur: 0.5, gain: 0.13, wet: 0.4 });
        this._noise({ dur: 0.4, gain: 0.12, from: 1800, to: 150, delay: 0.05, wet: 0.3 });
    }

    // ── Music (US 14.3) ───────────────────────────
    /**
     * Four layers, each on its own gain under the music bus, so a change of
     * mood is a crossfade between them rather than a change of track. What
     * each layer plays comes from the current song (MusicData).
     */
    _buildMusic() {
        const ctx = this.ctx;
        this.musicLayers = {};
        // How much of each layer goes into the room: the pad and bells live
        // in it, the bass and drums stay dry and close.
        const sends = { pad: 0.5, bell: 0.7, bass: 0.05, drums: 0.12 };
        const levels = this._levels();
        for (const name of ['pad', 'bell', 'bass', 'drums']) {
            const g = ctx.createGain();
            g.gain.value = levels[name];
            g.connect(this.musicBus);
            const send = ctx.createGain();
            send.gain.value = sends[name];
            g.connect(send);
            send.connect(this.musicWet);
            this.musicLayers[name] = g;
        }
        // The pad shares one filter, so its brightness follows the mood.
        this.padFilter = ctx.createBiquadFilter();
        this.padFilter.type = 'lowpass';
        this.padFilter.frequency.value = this._song.cutoff[this._mood];
        this.padFilter.connect(this.musicLayers.pad);

        this._musicNext = ctx.currentTime + 0.1;
        this._musicTimer = setInterval(() => this._musicTick(), 90);
    }

    /** The layer levels for the current mood, with the song's overrides. */
    _levels() {
        return { ...MOOD_LEVELS[this._mood], ...this._song.levels?.[this._mood] };
    }

    /**
     * Which song plays: a key of MusicData.SONGS (each map names its own in
     * LevelData.music). Switching cuts the old song's held chords short and
     * starts the new one from its first bar.
     */
    setSong(id) {
        const key = SONGS[id] ? id : DEFAULT_SONG;
        if (key === this._songId) return;
        this._songId = key;
        this._song = SONGS[key];
        this._musicStep = 0;
        if (!this.ctx || !this.musicLayers) return;
        const now = this.ctx.currentTime;
        for (const v of this._padVoices) {
            v.g.gain.cancelScheduledValues(now);
            v.g.gain.setTargetAtTime(0.0001, now, 0.25);
            v.osc.stop(now + 1.2);
        }
        this._padVoices = [];
        this._musicNext = now + 0.6;
        this._applyMood(now);
    }

    /**
     * 'calm' (preparation), 'tension' (a wave on the board) or 'boss'. The
     * layers crossfade over a couple of seconds.
     */
    setMusicMood(mood) {
        if (!MOOD_LEVELS[mood] || mood === this._mood) return;
        this._mood = mood;
        if (!this.ctx || !this.musicLayers) return;
        this._moodAt = this.ctx.currentTime;
        this._applyMood(this._moodAt);
    }

    _applyMood(now) {
        const levels = this._levels();
        for (const [name, g] of Object.entries(this.musicLayers)) {
            g.gain.setTargetAtTime(levels[name], now, 1.2);
        }
        this.padFilter.frequency.setTargetAtTime(this._song.cutoff[this._mood], now, 1.5);
    }

    /** Schedules every sixteenth that falls in the next third of a second. */
    _musicTick() {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const song = this._song;
        const stepLen = 60 / song.bpm / 4;
        const loop = song.stepsPerChord * song.progression.length;
        // After a hidden tab or a suspend, pick up from now rather than
        // playing the backlog all at once.
        if (this._musicNext < now) this._musicNext = now + 0.05;
        while (this._musicNext < now + 0.35) {
            if (this.enabled && this.musicVolume > 0) this._musicAt(this._musicStep, this._musicNext, stepLen);
            this._musicNext += stepLen;
            this._musicStep = (this._musicStep + 1) % loop;
        }
    }

    /** Whether a layer is heard now, or still fading out. */
    _layerLive(name) {
        return this._levels()[name] > 0 || this.ctx.currentTime - this._moodAt < FADE_TAIL;
    }

    _musicAt(step, t, stepLen) {
        const song = this._song;
        const chord = song.progression[Math.floor(step / song.stepsPerChord)];
        const s = step % 16;
        const mood = this._mood;
        const boss = mood === 'boss';
        const L = this.musicLayers;

        if (step % song.stepsPerChord === 0) this._padChord(chord, t, stepLen * song.stepsPerChord);

        // Melody: a random chord tone, or the arpeggio's next note.
        const bell = song.bell;
        if (this._layerLive('bell') && s % bell.every === 0
            && Math.random() < (bell.chance[mood] ?? bell.chance.tension)) {
            const n = bell.arp
                ? chord.bells[bell.arp[(step / bell.every) % bell.arp.length] % chord.bells.length]
                : chord.bells[Math.floor(Math.random() * chord.bells.length)];
            const f = midiHz(n);
            this._tone({
                type: bell.type, freq: f, dur: bell.decay, gain: bell.gain, at: t,
                bus: L.bell, pan: (Math.random() - 0.5) * 0.8,
            });
            const o = bell.overtone;
            if (o) this._tone({ type: 'sine', freq: f * o.ratio, dur: o.decay, gain: o.gain, at: t, bus: L.bell, pan: 0 });
        }

        // Bass: on the root, `pattern` semitones away per eighth.
        const bass = song.bass;
        const every = boss && bass.bossEvery ? bass.bossEvery : bass.every;
        if (this._layerLive('bass') && s % every === 0) {
            const eighth = Math.floor(s / 2);
            const accent = bass.accents[eighth];
            const shift = (bass.pattern?.[eighth] ?? 0) + (boss && bass.bossUp.includes(s) ? 12 : 0);
            for (const v of bass.voices) {
                this._tone({
                    type: v.type, freq: midiHz(chord.root + v.octave + shift), dur: stepLen * v.len,
                    gain: v.gain * accent, at: t, cut: v.cut ? v.cut[boss ? 'boss' : 'tension'] : 0,
                    bus: L.bass, pan: 0,
                });
            }
        }

        if (this._layerLive('drums')) {
            const d = song.drums;
            const on = (part) => part && (boss ? part.boss : part.tension).includes(s);
            if (on(d.kick)) {
                const k = d.kick;
                this._tone({ type: 'sine', freq: k.freq, to: k.to, dur: k.dur, gain: k.gain, at: t, bus: L.drums, pan: 0 });
            }
            if (on(d.tom)) {
                const k = d.tom;
                this._tone({
                    type: 'triangle', freq: k.freq, to: k.to, dur: 0.22, gain: k.gain, at: t,
                    bus: L.drums, pan: s % 2 ? 0.25 : -0.25,
                });
            }
            if (on(d.hat)) {
                this._noise({
                    dur: 0.04, gain: d.hat.gain, from: d.hat.from, to: d.hat.from * 0.85, filter: 'highpass', at: t,
                    bus: L.drums, pan: s % 8 < 4 ? -0.3 : 0.3,
                });
            }
            if (on(d.snare)) {
                const k = d.snare;
                this._noise({ dur: 0.14, gain: k.gain, from: k.from, to: k.from / 2, filter: 'bandpass', at: t, bus: L.drums, pan: 0 });
                this._tone({ type: 'triangle', freq: 190, to: 150, dur: 0.08, gain: k.gain * 0.65, at: t, bus: L.drums, pan: 0 });
            }
        }
    }

    /** One chord of the pad: a slow swell that overlaps the next one. */
    _padChord(chord, t, dur) {
        const ctx = this.ctx;
        const pad = this._song.pad;
        const atk = pad.attack, rel = pad.release;
        // Forget voices that have already ended; keep the rest, so a change
        // of song can silence them.
        this._padVoices = this._padVoices.filter(v => v.end > ctx.currentTime);
        const voice = (freq, type, level, cents) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            osc.detune.value = cents;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(level, t + atk);
            g.gain.setValueAtTime(level, t + dur);
            g.gain.linearRampToValueAtTime(0.0001, t + dur + rel);
            osc.connect(g);
            g.connect(this.padFilter);
            osc.start(t);
            osc.stop(t + dur + rel + 0.05);
            this._padVoices.push({ osc, g, end: t + dur + rel + 0.05 });
        };
        for (const n of chord.notes) {
            for (const v of pad.voices) voice(midiHz(n + v.octave), v.type, v.level, v.detune);
        }
        voice(midiHz(chord.root - 12), 'sine', pad.sub, 0);
    }
}

export const audio = new AudioSystem();
