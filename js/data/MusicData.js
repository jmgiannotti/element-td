/**
 * The music (US 14.3): one Tower Defense soundtrack per map, synthesised in
 * real time by AudioSystem. Each song is an 8-bar (128-sixteenth) loop built
 * out of five layers:
 *
 *   pad    tight harmonic backing chords (1 bar = 16 sixteenths each)
 *   arp    staccato 16th/8th-note tactical ostinato over the chord's `arp`
 *   lead   composed 8-bar melody (`melody`: [step, midi, durSteps, accent])
 *   bass   punchy staccato marching/galloping bassline per mood
 *   drums  arcade/fantasy percussion (`calm` tactical pulse, `tension` battle
 *          march, `boss` double-time assault + turnaround fills)
 *
 * Even `calm` (Title Screen & pre-wave building) carries a crisp tactical pulse
 * and arpeggio so planning feels active; `tension` unleashes the full battle
 * march; `boss` accelerates the tempo and harmonises the lead an octave/fifth.
 */

export const MOOD_LEVELS = {
    calm:    { pad: 0.65, arp: 0.72, lead: 0.72, bass: 0.45, drums: 0.30 },
    tension: { pad: 0.75, arp: 0.85, lead: 0.95, bass: 0.92, drums: 0.88 },
    boss:    { pad: 0.85, arp: 1.00, lead: 1.00, bass: 1.00, drums: 1.00 },
};

export const SONGS = {
    // ── 1. Paso de Ceniza & Menú Principal ────────────────────────
    // 118 BPM in D minor: Dm – Bb – C – A7 | Dm – Gm – Bb – A7.
    // Heroic pixel-art Tower Defense anthem: galloping bass, crisp pulse lead
    // and rapid arcane arpeggios.
    ceniza: {
        bpm: 118,
        bossTempo: 1.07,
        stepsPerChord: 16,
        progression: [
            { root: 38, notes: [50, 53, 57], arp: [62, 65, 69, 74] }, // Dm
            { root: 46, notes: [46, 53, 58], arp: [58, 62, 65, 70] }, // Bb
            { root: 36, notes: [48, 52, 55], arp: [60, 64, 67, 72] }, // C
            { root: 45, notes: [49, 52, 57], arp: [61, 64, 69, 73] }, // A7
            { root: 38, notes: [50, 57, 62], arp: [62, 69, 74, 77] }, // Dm
            { root: 43, notes: [50, 55, 58], arp: [62, 67, 70, 74] }, // Gm
            { root: 46, notes: [50, 53, 58], arp: [62, 65, 70, 74] }, // Bb
            { root: 45, notes: [49, 55, 57], arp: [61, 67, 69, 76] }, // A7
        ],
        cutoff: { calm: 1500, tension: 2400, boss: 3400 },
        pad: {
            voices: [
                { type: 'sawtooth', octave: 0, level: 0.016, detune: -7 },
                { type: 'triangle', octave: 12, level: 0.022, detune: 6 },
            ],
            sub: 0.035, attack: 0.18, release: 0.45,
        },
        arp: {
            type: 'square', gain: 0.028, cut: 2200, dur: 0.11,
            every: { calm: 2, tension: 1, boss: 1 },
            pattern: [0, 1, 2, 3, 2, 1, 2, 3],
        },
        lead: {
            type: 'square', gain: 0.048, detune: 8, cut: 2800,
            vibrato: true, bossHarmony: 12,
            melody: [
                // Bar 0 (Dm): heroic call D5-D5-A5 - G5-F5-E5-F5
                [0, 74, 3, 1], [3, 74, 1, 0.85], [4, 81, 4, 1.05],
                [8, 79, 2, 0.9], [10, 77, 2, 0.9], [12, 76, 2, 0.85], [14, 77, 2, 0.9],
                // Bar 1 (Bb): D5 — Bb4 — D5 — F5
                [16, 74, 6, 1], [22, 70, 2, 0.85], [24, 74, 4, 0.95], [28, 77, 4, 1],
                // Bar 2 (C): G5-G5-C6 - A5-G5-E5
                [32, 79, 3, 1], [35, 79, 1, 0.85], [36, 84, 4, 1.05],
                [40, 81, 2, 0.9], [42, 79, 2, 0.9], [44, 76, 4, 0.95],
                // Bar 3 (A7): F5-E5-D5 - C#5 — E5
                [48, 77, 3, 1], [51, 76, 3, 0.95], [54, 74, 2, 0.9],
                [56, 73, 6, 1], [62, 76, 2, 0.85],
                // Bar 4 (Dm): D5-F5-A5 - D6 - C6-A5
                [64, 74, 2, 1], [66, 77, 2, 0.9], [68, 81, 4, 1],
                [72, 86, 4, 1.1], [76, 84, 2, 0.95], [78, 81, 2, 0.9],
                // Bar 5 (Gm): Bb5 — G5 — F5-G5-D5
                [80, 82, 4, 1.05], [84, 79, 4, 0.95],
                [88, 77, 2, 0.9], [90, 79, 2, 0.9], [92, 74, 4, 0.9],
                // Bar 6 (Bb): F5-G5-A5 - Bb5 - G5-F5
                [96, 77, 3, 1], [99, 79, 3, 0.95], [102, 81, 2, 1],
                [104, 82, 4, 1.05], [108, 79, 2, 0.9], [110, 77, 2, 0.9],
                // Bar 7 (A7): E5 - G5-F5 - E5 - C#5
                [112, 76, 4, 1], [116, 79, 2, 0.95], [118, 77, 2, 0.95],
                [120, 76, 4, 1], [124, 73, 4, 1.05],
            ],
        },
        bass: {
            calmSteps:    [0, 4, 8, 12, 14],
            tensionSteps: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
            bossSteps:    [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15],
            shifts:       [0, 0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 7, 0, 12, 7],
            voices: [
                { type: 'sawtooth', octave: 0, gain: 0.095, len: 0.75, cut: { calm: 420, tension: 780, boss: 1150 } },
                { type: 'triangle', octave: -12, gain: 0.11, len: 0.8 },
            ],
        },
        drums: {
            kick:  { calm: [0, 8], tension: [0, 6, 8, 14], boss: [0, 3, 6, 8, 10, 14], freq: 130, to: 42, dur: 0.16, gain: 0.30 },
            snare: { calm: [], tension: [4, 12], boss: [4, 12, 15], gain: 0.15, from: 2200 },
            hat:   { calm: [2, 6, 10, 14], tension: [0, 2, 4, 6, 8, 10, 12, 14], boss: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14], gain: 0.048, from: 7500 },
            tom:   { calm: [12], tension: [15], boss: [7, 13, 15], freq: 165, to: 72, gain: 0.14 },
        },
    },

    // ── 2. Plaza del Mercado ──────────────────────────────────────
    // 126 BPM in A Dorian: Am – G – D – E7 | Am – C – D – E7.
    // Besieged medieval town skirmish: bouncing lute/harpsichord arpeggios,
    // brisk tambourine-and-snare rhythm and catchy Dorian battle folk melody.
    mercado: {
        bpm: 126,
        bossTempo: 1.06,
        stepsPerChord: 16,
        progression: [
            { root: 45, notes: [57, 60, 64], arp: [64, 69, 72, 76] }, // Am
            { root: 43, notes: [55, 59, 62], arp: [62, 67, 71, 74] }, // G
            { root: 38, notes: [50, 54, 57], arp: [62, 66, 69, 74] }, // D
            { root: 40, notes: [52, 56, 59], arp: [64, 68, 71, 76] }, // E7
            { root: 45, notes: [57, 60, 64], arp: [69, 72, 76, 81] }, // Am
            { root: 36, notes: [48, 52, 55], arp: [64, 67, 72, 76] }, // C
            { root: 38, notes: [50, 54, 57], arp: [66, 69, 74, 78] }, // D
            { root: 40, notes: [52, 56, 62], arp: [64, 68, 74, 76] }, // E7
        ],
        cutoff: { calm: 1700, tension: 2600, boss: 3600 },
        pad: {
            voices: [
                { type: 'triangle', octave: 0, level: 0.02, detune: -5 },
                { type: 'sawtooth', octave: 0, level: 0.013, detune: 6 },
            ],
            sub: 0.032, attack: 0.14, release: 0.4,
        },
        arp: {
            type: 'triangle', gain: 0.042, cut: 2800, dur: 0.10,
            every: { calm: 1, tension: 1, boss: 1 },
            pattern: [0, 2, 1, 3, 2, 3, 1, 2],
        },
        lead: {
            type: 'sawtooth', gain: 0.045, detune: 9, cut: 2500,
            vibrato: true, bossHarmony: 12,
            melody: [
                // Bar 0 (Am): A4-C5-E5 - E5 - G5-F#5-E5
                [0, 69, 2, 0.9], [2, 72, 2, 0.9], [4, 76, 4, 1],
                [8, 76, 2, 0.9], [10, 79, 2, 1], [12, 78, 2, 0.95], [14, 76, 2, 0.9],
                // Bar 1 (G): D5 - G5 - B5-A5-G5-D5
                [16, 74, 4, 1], [20, 79, 4, 1],
                [24, 83, 2, 1.05], [26, 81, 2, 0.95], [28, 79, 2, 0.9], [30, 74, 2, 0.85],
                // Bar 2 (D): F#5-G5-A5 - F#5 - D5 - E5-F#5
                [32, 78, 2, 1], [34, 79, 2, 0.95], [36, 81, 4, 1.05],
                [40, 78, 2, 0.95], [42, 74, 2, 0.9], [44, 76, 2, 0.9], [46, 78, 2, 0.95],
                // Bar 3 (E7): E5 - D5-C5 - B4 - E5 - G#5
                [48, 76, 4, 1], [52, 74, 2, 0.9], [54, 72, 2, 0.9],
                [56, 71, 4, 0.95], [60, 76, 2, 0.95], [62, 80, 2, 1.05],
                // Bar 4 (Am): A5 - A5 - G5-E5 - C5-D5-E5
                [64, 81, 4, 1.05], [68, 81, 2, 0.95], [70, 79, 2, 0.95],
                [72, 76, 4, 1], [76, 72, 2, 0.9], [78, 74, 2, 0.9],
                // Bar 5 (C): G5 - C6 - B5-A5-G5-E5
                [80, 79, 4, 1], [84, 84, 4, 1.1],
                [88, 83, 2, 1], [90, 81, 2, 0.95], [92, 79, 2, 0.9], [94, 76, 2, 0.9],
                // Bar 6 (D): F#5 - A5 - G5-F#5-E5-D5
                [96, 78, 4, 1], [100, 81, 4, 1.05],
                [104, 79, 2, 0.95], [106, 78, 2, 0.95], [108, 76, 2, 0.9], [110, 74, 2, 0.9],
                // Bar 7 (E7): E5-F5-E5-D5 - B4 - G#4
                [112, 76, 2, 1], [114, 77, 2, 0.95], [116, 76, 2, 0.95], [118, 74, 2, 0.9],
                [120, 71, 4, 1], [124, 68, 4, 1],
            ],
        },
        bass: {
            calmSteps:    [0, 4, 8, 12],
            tensionSteps: [0, 2, 4, 6, 8, 10, 12, 14],
            bossSteps:    [0, 2, 3, 4, 6, 8, 10, 11, 12, 14, 15],
            shifts:       [0, 0, 7, 12, 12, 0, 7, 0, 0, 0, 7, 12, 10, 0, 7, 12],
            voices: [
                { type: 'triangle', octave: 0, gain: 0.115, len: 0.72 },
                { type: 'sawtooth', octave: 0, gain: 0.065, len: 0.65, cut: { calm: 500, tension: 850, boss: 1200 } },
            ],
        },
        drums: {
            kick:  { calm: [0, 8], tension: [0, 6, 8, 11], boss: [0, 4, 6, 8, 11, 14], freq: 135, to: 48, dur: 0.15, gain: 0.28 },
            snare: { calm: [12], tension: [4, 12], boss: [4, 10, 12, 15], gain: 0.14, from: 2000 },
            hat:   { calm: [2, 6, 10, 14], tension: [0, 2, 4, 6, 8, 10, 12, 14], boss: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14], gain: 0.045, from: 8200 },
            tom:   { calm: [], tension: [14, 15], boss: [3, 7, 14, 15], freq: 185, to: 85, gain: 0.13 },
        },
    },

    // ── 3. Caldera de Magma ───────────────────────────────────────
    // 122 BPM in E Phrygian Dominant: E – F – G – F | Em – Dm – F – B7.
    // Heavy volcanic war-forge TD: chugging sawtooth riff, pounding war toms,
    // anvil snare and fierce Phrygian lead.
    caldera: {
        bpm: 122,
        bossTempo: 1.07,
        stepsPerChord: 16,
        progression: [
            { root: 40, notes: [52, 56, 59], arp: [52, 59, 64, 68] }, // E
            { root: 41, notes: [53, 57, 60], arp: [53, 60, 65, 69] }, // F
            { root: 43, notes: [55, 59, 62], arp: [55, 62, 67, 71] }, // G
            { root: 41, notes: [53, 57, 60], arp: [53, 60, 65, 69] }, // F
            { root: 40, notes: [52, 55, 59], arp: [52, 59, 64, 67] }, // Em
            { root: 38, notes: [50, 53, 57], arp: [50, 57, 62, 65] }, // Dm
            { root: 41, notes: [53, 57, 60], arp: [53, 60, 65, 72] }, // F
            { root: 47, notes: [51, 57, 59], arp: [59, 63, 66, 71] }, // B7
        ],
        cutoff: { calm: 1200, tension: 2100, boss: 3200 },
        pad: {
            voices: [
                { type: 'sawtooth', octave: 0, level: 0.018, detune: -9 },
                { type: 'sawtooth', octave: 0, level: 0.018, detune: 9 },
            ],
            sub: 0.045, attack: 0.16, release: 0.4,
        },
        arp: {
            type: 'sawtooth', gain: 0.03, cut: 1900, dur: 0.11,
            every: { calm: 2, tension: 1, boss: 1 },
            pattern: [0, 1, 2, 1, 0, 2, 3, 2],
        },
        lead: {
            type: 'sawtooth', gain: 0.05, detune: 12, cut: 2700,
            vibrato: true, bossHarmony: 7,
            melody: [
                // Bar 0 (E): E5-E5-F5-G#5 - B5 - A5-G#5
                [0, 76, 2, 1], [2, 76, 2, 0.9], [4, 77, 2, 0.95], [6, 80, 2, 1],
                [8, 83, 4, 1.05], [12, 81, 2, 0.95], [14, 80, 2, 0.95],
                // Bar 1 (F): A5 - F5 - C5 - F5-A5
                [16, 81, 4, 1], [20, 77, 4, 0.95], [24, 72, 4, 0.9], [28, 77, 2, 0.95], [30, 81, 2, 1],
                // Bar 2 (G): B5 - D6-C6 - B5 - A5-G5
                [32, 83, 4, 1.05], [36, 86, 2, 1.1], [38, 84, 2, 1],
                [40, 83, 4, 1], [44, 81, 2, 0.95], [46, 79, 2, 0.9],
                // Bar 3 (F): A5-G5-F5 - E5 - F5
                [48, 81, 3, 1], [51, 79, 3, 0.95], [54, 77, 2, 0.95],
                [56, 76, 4, 1], [60, 77, 4, 1],
                // Bar 4 (Em): E5-G5-B5 - E6 - D6-B5
                [64, 76, 2, 1], [66, 79, 2, 0.95], [68, 83, 4, 1.05],
                [72, 88, 4, 1.1], [76, 86, 2, 1], [78, 83, 2, 0.95],
                // Bar 5 (Dm): D6 - A5 - F5-G5-A5
                [80, 86, 4, 1.05], [84, 81, 4, 0.95],
                [88, 77, 3, 0.95], [91, 79, 3, 0.95], [94, 81, 2, 1],
                // Bar 6 (F): C6 - A5 - F5 - A5-C6
                [96, 84, 4, 1.05], [100, 81, 4, 0.95],
                [104, 77, 4, 0.95], [108, 81, 2, 1], [110, 84, 2, 1.05],
                // Bar 7 (B7): B5 - A5-G5 - F#5 - D#5
                [112, 83, 4, 1.05], [116, 81, 2, 0.95], [118, 79, 2, 0.95],
                [120, 78, 4, 1], [124, 75, 4, 1.05],
            ],
        },
        bass: {
            calmSteps:    [0, 3, 6, 8, 12],
            tensionSteps: [0, 2, 3, 6, 8, 10, 11, 14],
            bossSteps:    [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14, 15],
            shifts:       [0, 0, 0, 1, 0, 0, 12, 0, 0, 0, 0, 1, 7, 0, 1, 0],
            voices: [
                { type: 'sawtooth', octave: 0, gain: 0.11, len: 0.7, cut: { calm: 400, tension: 750, boss: 1200 } },
                { type: 'sine', octave: -12, gain: 0.12, len: 0.85 },
            ],
        },
        drums: {
            kick:  { calm: [0, 10], tension: [0, 3, 8, 10], boss: [0, 2, 3, 8, 10, 11, 14], freq: 115, to: 38, dur: 0.19, gain: 0.32 },
            snare: { calm: [], tension: [4, 12], boss: [4, 12], gain: 0.16, from: 1800 },
            hat:   { calm: [4, 12], tension: [2, 6, 10, 14], boss: [0, 2, 4, 6, 8, 10, 12, 14], gain: 0.042, from: 7000 },
            tom:   { calm: [6, 14], tension: [6, 13, 14, 15], boss: [5, 6, 7, 13, 14, 15], freq: 145, to: 62, gain: 0.16 },
        },
    },

    // ── 4. Glaciar Quebrado ───────────────────────────────────────
    // 116 BPM in B minor: Bm – G – D – A | Bm – Em – G – F#7.
    // Relentless frozen siege: sparkling 16th-note chiptune crystal arpeggios,
    // tight synth-bass march and urgent high Nordic lead.
    glaciar: {
        bpm: 116,
        bossTempo: 1.08,
        stepsPerChord: 16,
        progression: [
            { root: 47, notes: [47, 54, 59], arp: [59, 62, 66, 71] }, // Bm
            { root: 43, notes: [43, 50, 55], arp: [59, 62, 67, 71] }, // G
            { root: 38, notes: [50, 54, 57], arp: [62, 66, 69, 74] }, // D
            { root: 45, notes: [49, 52, 57], arp: [61, 64, 69, 73] }, // A
            { root: 47, notes: [47, 54, 59], arp: [62, 66, 71, 74] }, // Bm
            { root: 40, notes: [52, 55, 59], arp: [64, 67, 71, 76] }, // Em
            { root: 43, notes: [47, 50, 55], arp: [62, 67, 71, 74] }, // G
            { root: 42, notes: [46, 54, 58], arp: [61, 66, 70, 73] }, // F#7
        ],
        cutoff: { calm: 1800, tension: 2600, boss: 3600 },
        pad: {
            voices: [
                { type: 'triangle', octave: 12, level: 0.02, detune: -6 },
                { type: 'sawtooth', octave: 12, level: 0.011, detune: 6 },
            ],
            sub: 0.035, attack: 0.2, release: 0.5,
        },
        arp: {
            type: 'square', gain: 0.027, cut: 2900, dur: 0.09,
            every: { calm: 1, tension: 1, boss: 1 },
            pattern: [0, 1, 2, 3, 1, 2, 3, 2],
        },
        lead: {
            type: 'square', gain: 0.046, detune: 7, cut: 3100,
            vibrato: true, bossHarmony: 12,
            melody: [
                // Bar 0 (Bm): B4-D5-F#5 - A5-F#5-E5-D5
                [0, 71, 2, 0.95], [2, 74, 2, 0.95], [4, 78, 4, 1.05],
                [8, 81, 3, 1], [11, 78, 1, 0.9], [12, 76, 2, 0.9], [14, 74, 2, 0.9],
                // Bar 1 (G): B5 - G5 - D5 - E5-F#5
                [16, 83, 4, 1.05], [20, 79, 4, 0.95], [24, 74, 4, 0.9], [28, 76, 2, 0.9], [30, 78, 2, 0.95],
                // Bar 2 (D): A5 - F#5-D5 - A5 - B5-A5
                [32, 81, 4, 1], [36, 78, 2, 0.95], [38, 74, 2, 0.9],
                [40, 81, 4, 1.05], [44, 83, 2, 1], [46, 81, 2, 0.95],
                // Bar 3 (A): G#5/E5 -> E5 - A5 - G5-F#5-E5
                [48, 76, 4, 1], [52, 81, 4, 1.05],
                [56, 79, 2, 0.95], [58, 78, 2, 0.95], [60, 76, 4, 1],
                // Bar 4 (Bm): F#5-B5 - D6 - C#6-B5-A5
                [64, 78, 2, 1], [66, 83, 2, 1], [68, 86, 4, 1.1],
                [72, 85, 2, 1], [74, 83, 2, 0.95], [76, 81, 4, 0.95],
                // Bar 5 (Em): G5 - B5 - E6 - D6-B5
                [80, 79, 4, 1], [84, 83, 4, 1],
                [88, 88, 4, 1.1], [92, 86, 2, 1], [94, 83, 2, 0.95],
                // Bar 6 (G): D6 - B5 - G5 - A5-B5
                [96, 86, 4, 1.05], [100, 83, 4, 1],
                [104, 79, 4, 0.95], [108, 81, 2, 0.95], [110, 83, 2, 1],
                // Bar 7 (F#7): A#5 - F#5 - C#5 - F#5
                [112, 82, 4, 1.05], [116, 78, 4, 1],
                [120, 73, 4, 0.95], [124, 78, 4, 1.05],
            ],
        },
        bass: {
            calmSteps:    [0, 4, 8, 12],
            tensionSteps: [0, 2, 4, 6, 8, 10, 12, 14],
            bossSteps:    [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15],
            shifts:       [0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 7, 0, 12, 7],
            voices: [
                { type: 'sawtooth', octave: -12, gain: 0.095, len: 0.68, cut: { calm: 480, tension: 860, boss: 1300 } },
                { type: 'triangle', octave: -12, gain: 0.10, len: 0.75 },
            ],
        },
        drums: {
            kick:  { calm: [0, 8], tension: [0, 8, 10], boss: [0, 4, 8, 10, 14], freq: 125, to: 42, dur: 0.16, gain: 0.28 },
            snare: { calm: [], tension: [4, 12], boss: [4, 12, 15], gain: 0.14, from: 2500 },
            hat:   { calm: [2, 6, 10, 14], tension: [0, 2, 4, 6, 8, 10, 12, 14], boss: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14], gain: 0.04, from: 8800 },
            tom:   { calm: [], tension: [14, 15], boss: [6, 14, 15], freq: 175, to: 80, gain: 0.12 },
        },
    },

    // ── 5. Cripta Ancestral ───────────────────────────────────────
    // 128 BPM in C Harmonic Minor: Cm – Ab – Fm – G7 | Cm – Bb – Ab – G7.
    // Gothic necropolis arcade TD finale: baroque organ/harpsichord arpeggios,
    // octave-jumping bass and dramatic Castlevania-inspired harmonic minor lead.
    cripta: {
        bpm: 128,
        bossTempo: 1.07,
        stepsPerChord: 16,
        progression: [
            { root: 36, notes: [48, 51, 55], arp: [60, 63, 67, 72] }, // Cm
            { root: 44, notes: [44, 51, 56], arp: [56, 60, 63, 68] }, // Ab
            { root: 41, notes: [48, 53, 56], arp: [60, 65, 68, 72] }, // Fm
            { root: 43, notes: [47, 50, 55], arp: [59, 62, 67, 71] }, // G7
            { root: 36, notes: [48, 55, 60], arp: [63, 67, 72, 75] }, // Cm
            { root: 46, notes: [50, 53, 58], arp: [62, 65, 70, 74] }, // Bb
            { root: 44, notes: [48, 51, 56], arp: [60, 63, 68, 72] }, // Ab
            { root: 43, notes: [47, 53, 55], arp: [59, 65, 67, 74] }, // G7
        ],
        cutoff: { calm: 1500, tension: 2400, boss: 3500 },
        pad: {
            voices: [
                { type: 'square', octave: 0, level: 0.013, detune: -6 },
                { type: 'square', octave: 12, level: 0.011, detune: 6 },
                { type: 'triangle', octave: 0, level: 0.018, detune: 0 },
            ],
            sub: 0.04, attack: 0.14, release: 0.4,
        },
        arp: {
            type: 'square', gain: 0.029, cut: 2600, dur: 0.095,
            every: { calm: 1, tension: 1, boss: 1 },
            pattern: [0, 2, 1, 3, 0, 3, 2, 1],
        },
        lead: {
            type: 'sawtooth', gain: 0.048, detune: 10, cut: 2900,
            vibrato: true, bossHarmony: 12,
            melody: [
                // Bar 0 (Cm): C5-D5-Eb5-G5 - Ab5-G5-F#5-G5
                [0, 72, 2, 1], [2, 74, 2, 0.9], [4, 75, 2, 0.95], [6, 79, 2, 1],
                [8, 80, 2, 1.05], [10, 79, 2, 0.95], [12, 78, 2, 0.95], [14, 79, 2, 1],
                // Bar 1 (Ab): C6 - Ab5 - Eb5 - Ab5-C6
                [16, 84, 4, 1.05], [20, 80, 4, 1],
                [24, 75, 4, 0.9], [28, 80, 2, 0.95], [30, 84, 2, 1],
                // Bar 2 (Fm): F5-G5-Ab5 - C6 - Bb5-Ab5-G5-F5
                [32, 77, 2, 0.95], [34, 79, 2, 0.95], [36, 80, 4, 1],
                [40, 84, 2, 1.05], [42, 82, 2, 0.95], [44, 80, 2, 0.95], [46, 77, 2, 0.9],
                // Bar 3 (G7): G5 - F5-Eb5 - D5 - B4
                [48, 79, 4, 1], [52, 77, 2, 0.95], [54, 75, 2, 0.95],
                [56, 74, 4, 1], [60, 71, 4, 1.05],
                // Bar 4 (Cm): C5-Eb5-G5 - C6 - D6-Eb6
                [64, 72, 2, 1], [66, 75, 2, 0.95], [68, 79, 4, 1],
                [72, 84, 4, 1.1], [76, 86, 2, 1.05], [78, 87, 2, 1.1],
                // Bar 5 (Bb): D6 - Bb5 - F5 - Bb5-D6
                [80, 86, 4, 1.05], [84, 82, 4, 1],
                [88, 77, 4, 0.95], [92, 82, 2, 1], [94, 86, 2, 1.05],
                // Bar 6 (Ab): C6 - Ab5 - G5-Ab5-Bb5-C6
                [96, 84, 4, 1.05], [100, 80, 4, 0.95],
                [104, 79, 2, 0.95], [106, 80, 2, 0.95], [108, 82, 2, 1], [110, 84, 2, 1.05],
                // Bar 7 (G7): B5 - G5 - F5-Eb5 - D5-B4
                [112, 83, 4, 1.1], [116, 79, 4, 1],
                [120, 77, 2, 0.95], [122, 75, 2, 0.95], [124, 74, 2, 1], [126, 71, 2, 1.05],
            ],
        },
        bass: {
            calmSteps:    [0, 4, 8, 12],
            tensionSteps: [0, 2, 4, 6, 8, 10, 12, 14],
            bossSteps:    [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14, 15],
            shifts:       [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 0, 12, 7],
            voices: [
                { type: 'sawtooth', octave: 0, gain: 0.10, len: 0.68, cut: { calm: 460, tension: 900, boss: 1350 } },
                { type: 'triangle', octave: 0, gain: 0.10, len: 0.72 },
            ],
        },
        drums: {
            kick:  { calm: [0, 8], tension: [0, 2, 8, 10], boss: [0, 2, 4, 8, 10, 12, 14], freq: 128, to: 40, dur: 0.15, gain: 0.30 },
            snare: { calm: [], tension: [4, 12], boss: [4, 12, 15], gain: 0.15, from: 2100 },
            hat:   { calm: [2, 6, 10, 14], tension: [0, 2, 4, 6, 8, 10, 12, 14], boss: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], gain: 0.044, from: 8000 },
            tom:   { calm: [14], tension: [14, 15], boss: [6, 7, 14, 15], freq: 160, to: 68, gain: 0.14 },
        },
    },
};

export const DEFAULT_SONG = 'ceniza';
