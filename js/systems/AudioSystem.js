/**
 * Every sound is synthesised at runtime with Web Audio, for the same reason
 * every texture is drawn at runtime in BootScene: the game ships no asset
 * files.
 *
 * Exported as a module singleton rather than a per-scene object. The unlock
 * listeners live on `window`, and GameScene is restartable — a fresh instance
 * per restart would stack a new pair of listeners every time you lose.
 */

// Minimum seconds between two plays of the same cue. Twenty towers firing at
// once must not stack twenty oscillators on the same millisecond.
const THROTTLE = {
    shoot: 0.055,
    hit: 0.06,
    die: 0.045,
    mana: 0.05,
};

// Each element fires at its own pitch, so a wall of towers reads as a chord
// rather than one repeated blip.
const SHOOT_PITCH = {
    water: 520, air: 780, fire: 300, earth: 220,
    ice: 620, storm: 900, lava: 260, mud: 400,
};

class AudioSystem {
    constructor() {
        this.enabled = true;
        this.masterVolume = 0.32;
        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
        this._last = new Map();

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

        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? this.masterVolume : 0;
        this.master.connect(this.ctx.destination);

        // One second of white noise, reused by every percussive cue.
        const len = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    setEnabled(on) {
        this.enabled = on;
        if (this.master) this.master.gain.value = on ? this.masterVolume : 0;
        if (on) this.unlock();
    }

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    // ── Voices ───────────────────────────────────
    _tone({ type = 'square', freq, to, dur = 0.1, gain = 0.2, delay = 0 }) {
        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to != null && to !== freq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
        }

        // Tiny attack instead of an instant one: a hard start clicks.
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(env);
        env.connect(this.master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    _noise({ dur = 0.08, gain = 0.15, delay = 0, from = 3000, to = 400 }) {
        const t0 = this.ctx.currentTime + delay;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(from, t0);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(gain, t0);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(filter);
        filter.connect(env);
        env.connect(this.master);
        src.start(t0);
        src.stop(t0 + dur + 0.02);
    }

    // ── Cues ─────────────────────────────────────
    play(name, arg) {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;

        const gap = THROTTLE[name];
        if (gap) {
            const last = this._last.get(name);
            if (last !== undefined && this.ctx.currentTime - last < gap) return;
            this._last.set(name, this.ctx.currentTime);
        }

        const cue = this[`_${name}`];
        if (cue) cue.call(this, arg);
    }

    _shoot(element) {
        const f = SHOOT_PITCH[element] ?? 440;
        this._tone({ type: 'square', freq: f * 1.6, to: f, dur: 0.07, gain: 0.09 });
    }

    _hit() {
        this._noise({ dur: 0.05, gain: 0.07, from: 2600, to: 700 });
    }

    _die() {
        this._tone({ type: 'square', freq: 420, to: 70, dur: 0.16, gain: 0.11 });
        this._noise({ dur: 0.12, gain: 0.07, from: 1600, to: 200 });
    }

    _leak() {
        // Losing a life has to cut through whatever else is playing.
        this._tone({ type: 'sawtooth', freq: 300, to: 90, dur: 0.4, gain: 0.2 });
    }

    _mana() {
        this._tone({ type: 'sine', freq: 880, to: 1320, dur: 0.1, gain: 0.09 });
        this._tone({ type: 'sine', freq: 1320, dur: 0.07, gain: 0.05, delay: 0.06 });
    }

    _build() {
        this._tone({ type: 'square', freq: 200, to: 110, dur: 0.1, gain: 0.14 });
        this._noise({ dur: 0.09, gain: 0.11, from: 1200, to: 150 });
    }

    _sell() {
        // The build cue read backwards — rising instead of falling — with a
        // coin on top, so a demolition still sounds like money coming in.
        this._tone({ type: 'square', freq: 110, to: 210, dur: 0.1, gain: 0.12 });
        this._tone({ type: 'sine', freq: 1046, dur: 0.09, gain: 0.07, delay: 0.07 });
    }

    _temple() {
        // Heavier than a tower: a temple is the expensive build.
        this._tone({ type: 'triangle', freq: 160, to: 80, dur: 0.3, gain: 0.18 });
        this._tone({ type: 'sine', freq: 440, to: 660, dur: 0.35, gain: 0.1, delay: 0.05 });
    }

    _fusion() {
        [0, 0.07, 0.14].forEach((d, i) => {
            this._tone({
                type: 'square', freq: 440 * (1 + i * 0.5), to: 880 * (1 + i * 0.5),
                dur: 0.18, gain: 0.09, delay: d,
            });
        });
    }

    _upgrade() {
        [523, 659, 784].forEach((f, i) => {
            this._tone({ type: 'square', freq: f, dur: 0.1, gain: 0.09, delay: i * 0.06 });
        });
    }

    _wave() {
        this._tone({ type: 'sawtooth', freq: 220, to: 330, dur: 0.22, gain: 0.13 });
        this._tone({ type: 'sawtooth', freq: 330, to: 440, dur: 0.26, gain: 0.11, delay: 0.16 });
    }

    _dash() {
        // A short upward whoosh: air moving, not a thing being struck.
        this._noise({ dur: 0.16, gain: 0.1, from: 500, to: 4000 });
        this._tone({ type: 'sine', freq: 320, to: 880, dur: 0.14, gain: 0.06 });
    }

    _quake() {
        // Bottom-heavy, so it lands as an impact on the ground rather than a hit
        // on one enemy — the whole ring felt it.
        this._tone({ type: 'triangle', freq: 130, to: 45, dur: 0.34, gain: 0.2 });
        this._noise({ dur: 0.3, gain: 0.15, from: 900, to: 90 });
    }

    _deny() {
        this._tone({ type: 'square', freq: 150, to: 100, dur: 0.11, gain: 0.12 });
    }

    _click() {
        this._tone({ type: 'square', freq: 900, to: 700, dur: 0.035, gain: 0.06 });
    }

    _gameOver() {
        [440, 349, 262, 175].forEach((f, i) => {
            this._tone({ type: 'sawtooth', freq: f, dur: 0.34, gain: 0.13, delay: i * 0.2 });
        });
    }

    _victory() {
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone({ type: 'square', freq: f, dur: 0.26, gain: 0.12, delay: i * 0.13 });
        });
    }
}

export const audio = new AudioSystem();
