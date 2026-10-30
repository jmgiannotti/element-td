/**
 * The music (US 14.3): one song per map, all played by the same engine in
 * AudioSystem. A song is data — a chord loop and how each of the four layers
 * plays over it — so a new one is a new entry here, not new code.
 *
 *   pad    held chords, a slow swell per chord
 *   bell   the melody: random notes from the chord's `bells`, or an `arp`
 *          walking through them in order
 *   bass   a pulse on the chord's root, shifted per eighth by `pattern`
 *   drums  `kick`, `hat`, `snare` and `tom`, each a list of sixteenths (0–15)
 *          per mood
 *
 * Every song keeps the same three moods — calm while you build, tension while
 * a wave walks, boss — and what changes between maps is the material:
 * the key, the tempo, and what the instruments are made of.
 *
 * Notes are MIDI numbers (60 = middle C). Gains are small on purpose: the
 * music bus and the player's volume sit on top.
 */

// How loud each layer is in each mood, unless a song says otherwise.
// Preparation is the pad and the melody; a wave brings in the bass and the
// drums; a boss pushes both and drops the melody.
export const MOOD_LEVELS = {
    calm: { pad: 1, bell: 1, bass: 0, drums: 0 },
    tension: { pad: 0.75, bell: 0.35, bass: 0.85, drums: 0.7 },
    boss: { pad: 0.7, bell: 0, bass: 1, drums: 1 },
};

export const SONGS = {
    // Paso de Ceniza, and the title screen. Slow, in D minor: Dm – Bb – Gm – A,
    // two bars each. The A major at the end leans back into Dm, so the loop
    // never sounds like it stops.
    ceniza: {
        bpm: 70,
        stepsPerChord: 32,
        progression: [
            { root: 50, notes: [50, 53, 57], bells: [74, 77, 79, 81, 84, 86] },   // Dm
            { root: 46, notes: [46, 50, 53], bells: [70, 74, 77, 79, 82, 86] },   // Bb
            { root: 43, notes: [43, 46, 50], bells: [67, 70, 74, 77, 79, 82] },   // Gm
            { root: 45, notes: [45, 49, 52], bells: [69, 73, 76, 81, 85, 88] },   // A
        ],
        cutoff: { calm: 800, tension: 1500, boss: 2400 },
        pad: {
            voices: [
                { type: 'triangle', octave: 12, level: 0.03, detune: -6 },
                { type: 'sawtooth', octave: 12, level: 0.012, detune: 7 },
            ],
            sub: 0.05, attack: 1.6, release: 1.8,
        },
        bell: {
            type: 'sine', gain: 0.05, decay: 1.8,
            overtone: { ratio: 2, gain: 0.012, decay: 0.6 },
            every: 4, chance: { calm: 0.45, tension: 0.25 },
        },
        bass: {
            every: 2,
            accents: [1, 0.5, 0.7, 0.5, 0.9, 0.5, 0.7, 0.6],
            voices: [
                { type: 'sawtooth', octave: -12, gain: 0.09, len: 1.6, cut: { tension: 450, boss: 700 } },
                { type: 'sine', octave: -24, gain: 0.1, len: 1.8 },
            ],
            bossUp: [6, 14],
        },
        drums: {
            kick: { tension: [0, 8], boss: [0, 4, 8, 12, 14], freq: 110, to: 42, dur: 0.2, gain: 0.3 },
            hat: { tension: [2, 6, 10, 14], boss: [2, 6, 10, 14], gain: 0.05, from: 7000 },
            snare: { tension: [], boss: [4, 12], gain: 0.12, from: 1800 },
        },
    },

    // Plaza del Mercado. A town that is still alive: A dorian, quicker, a
    // plucked lute walking up and down the chord, a root–fifth bass and a
    // frame drum with a tambourine.
    mercado: {
        bpm: 84,
        stepsPerChord: 32,
        progression: [
            { root: 45, notes: [57, 60, 64], bells: [69, 72, 76, 79, 81, 84] },   // Am
            { root: 50, notes: [50, 54, 57], bells: [66, 69, 74, 78, 81, 86] },   // D
            { root: 41, notes: [53, 57, 60], bells: [65, 69, 72, 77, 81, 84] },   // F
            { root: 43, notes: [55, 59, 62], bells: [67, 71, 74, 79, 83, 86] },   // G
        ],
        cutoff: { calm: 1200, tension: 2000, boss: 2800 },
        levels: { tension: { bell: 0.6 } },
        pad: {
            voices: [
                { type: 'triangle', octave: 0, level: 0.02, detune: -5 },
                { type: 'sine', octave: 12, level: 0.018, detune: 5 },
            ],
            sub: 0.04, attack: 0.8, release: 1.2,
        },
        bell: {
            type: 'triangle', gain: 0.045, decay: 0.45,
            overtone: { ratio: 2, gain: 0.015, decay: 0.2 },
            every: 2, chance: { calm: 0.75, tension: 0.55 },
            arp: [0, 2, 1, 3, 2, 4, 3, 5],
        },
        bass: {
            every: 2,
            pattern: [0, 7, 12, 7, 0, 7, 10, 7],
            accents: [1, 0.6, 0.8, 0.6, 0.9, 0.6, 0.8, 0.6],
            voices: [
                { type: 'triangle', octave: 0, gain: 0.11, len: 1.4 },
                { type: 'sine', octave: -12, gain: 0.06, len: 1.4 },
            ],
            bossUp: [],
        },
        drums: {
            kick: { tension: [0, 6, 8], boss: [0, 4, 6, 8, 12, 14], freq: 120, to: 50, dur: 0.18, gain: 0.26 },
            hat: { tension: [2, 6, 10, 14], boss: [2, 4, 6, 10, 12, 14], gain: 0.04, from: 8000 },
            snare: { tension: [4, 12], boss: [4, 12], gain: 0.08, from: 900 },
        },
    },

    // Caldera de Magma. Heavy and low: E phrygian (the F over E is the heat),
    // a dark saw drone, gongs instead of bells, quarter-note bass and tribal
    // toms.
    caldera: {
        bpm: 62,
        stepsPerChord: 32,
        progression: [
            { root: 40, notes: [52, 55, 59], bells: [52, 55, 59, 64] },   // Em
            { root: 41, notes: [53, 57, 60], bells: [53, 57, 60, 65] },   // F
            { root: 43, notes: [55, 59, 62], bells: [55, 59, 62, 67] },   // G
            { root: 41, notes: [53, 57, 60], bells: [53, 57, 60, 65] },   // F
        ],
        cutoff: { calm: 500, tension: 1000, boss: 1800 },
        pad: {
            voices: [
                { type: 'sawtooth', octave: 0, level: 0.018, detune: -8 },
                { type: 'sawtooth', octave: 0, level: 0.018, detune: 8 },
                { type: 'triangle', octave: 12, level: 0.012, detune: 0 },
            ],
            sub: 0.07, attack: 2, release: 2,
        },
        bell: {
            type: 'sine', gain: 0.06, decay: 3,
            overtone: { ratio: 2.4, gain: 0.02, decay: 1.5 },
            every: 8, chance: { calm: 0.5, tension: 0.3 },
        },
        bass: {
            every: 4, bossEvery: 2,
            accents: [1, 0.6, 0.8, 0.6, 1, 0.6, 0.7, 0.6],
            voices: [
                { type: 'sawtooth', octave: 0, gain: 0.12, len: 3, cut: { tension: 380, boss: 650 } },
                { type: 'sine', octave: -12, gain: 0.14, len: 3 },
            ],
            bossUp: [12],
        },
        drums: {
            kick: { tension: [0, 10], boss: [0, 6, 8, 10, 14], freq: 95, to: 38, dur: 0.28, gain: 0.32 },
            tom: { tension: [6, 12, 14], boss: [3, 6, 12, 13, 14], freq: 140, to: 70, gain: 0.16 },
            snare: { tension: [], boss: [4, 12], gain: 0.14, from: 1500 },
        },
    },

    // Glaciar Quebrado. Wide and cold: B minor into D major, slow, a sine pad
    // with a high shimmer, glass bells and ice ticks for hats.
    glaciar: {
        bpm: 58,
        stepsPerChord: 32,
        progression: [
            { root: 47, notes: [47, 50, 54], bells: [74, 78, 81, 83, 86, 90] },   // Bm
            { root: 43, notes: [43, 47, 50], bells: [71, 74, 78, 79, 83, 86] },   // G
            { root: 50, notes: [50, 54, 57], bells: [74, 78, 81, 85, 86, 90] },   // D
            { root: 45, notes: [45, 49, 52], bells: [73, 76, 81, 83, 85, 88] },   // A
        ],
        cutoff: { calm: 1600, tension: 2200, boss: 3000 },
        pad: {
            voices: [
                { type: 'sine', octave: 12, level: 0.03, detune: -4 },
                { type: 'sine', octave: 24, level: 0.008, detune: 4 },
                { type: 'triangle', octave: 12, level: 0.01, detune: 0 },
            ],
            sub: 0.035, attack: 2.5, release: 2.5,
        },
        bell: {
            type: 'sine', gain: 0.04, decay: 2.6,
            overtone: { ratio: 2.76, gain: 0.015, decay: 1.2 },
            every: 2, chance: { calm: 0.3, tension: 0.2 },
        },
        bass: {
            every: 4, bossEvery: 2,
            accents: [1, 0.6, 0.6, 0.6, 0.9, 0.6, 0.6, 0.6],
            voices: [
                { type: 'sine', octave: -12, gain: 0.12, len: 3 },
                { type: 'triangle', octave: -12, gain: 0.03, len: 2 },
            ],
            bossUp: [6, 14],
        },
        drums: {
            kick: { tension: [0, 8], boss: [0, 4, 8, 12], freq: 90, to: 40, dur: 0.22, gain: 0.22 },
            hat: { tension: [2, 6, 10, 14], boss: [2, 3, 6, 10, 11, 14], gain: 0.03, from: 9000 },
            snare: { tension: [], boss: [4, 12], gain: 0.08, from: 2400 },
        },
    },

    // Cripta Ancestral. C minor in a stone room: a reedy organ, one low bell
    // per bar, a bass that keeps leaning on the note above the root, and a
    // heartbeat for a kick.
    cripta: {
        bpm: 66,
        stepsPerChord: 32,
        progression: [
            { root: 48, notes: [48, 51, 55], bells: [60, 63, 67] },   // Cm
            { root: 44, notes: [44, 48, 51], bells: [56, 60, 63] },   // Ab
            { root: 41, notes: [41, 44, 48], bells: [53, 56, 60] },   // Fm
            { root: 43, notes: [43, 47, 50], bells: [55, 59, 62] },   // G
        ],
        cutoff: { calm: 700, tension: 1200, boss: 2000 },
        pad: {
            voices: [
                { type: 'square', octave: 12, level: 0.012, detune: -5 },
                { type: 'square', octave: 12, level: 0.012, detune: 5 },
                { type: 'sine', octave: 0, level: 0.02, detune: 0 },
            ],
            sub: 0.05, attack: 1.2, release: 1.6,
        },
        bell: {
            type: 'sine', gain: 0.06, decay: 3.2,
            overtone: { ratio: 2.4, gain: 0.025, decay: 1.6 },
            every: 16, chance: { calm: 0.8, tension: 0.5 },
        },
        bass: {
            every: 2,
            pattern: [0, 0, 1, 0, 0, 0, 1, 0],
            accents: [1, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4],
            voices: [
                { type: 'triangle', octave: -12, gain: 0.11, len: 1.5 },
                { type: 'sine', octave: -24, gain: 0.1, len: 1.6 },
            ],
            bossUp: [6, 14],
        },
        drums: {
            kick: { tension: [0, 2, 8, 10], boss: [0, 2, 4, 8, 10, 12], freq: 80, to: 40, dur: 0.2, gain: 0.28 },
            hat: { tension: [], boss: [6, 14], gain: 0.04, from: 7000 },
            snare: { tension: [], boss: [4, 12], gain: 0.12, from: 1600 },
        },
    },
};

export const DEFAULT_SONG = 'ceniza';
