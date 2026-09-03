export const ENEMY_TYPES = {
    SLIME: 'slime',
    GOLEM: 'golem',
    SPECTER: 'specter',
    DRAGON: 'dragon',
    BOSS_TITAN: 'boss_titan',
    BOSS_DRAGON: 'boss_dragon',
    BOSS_SPECTER: 'boss_specter',
};

/**
 * WHAT WALKS THE ROAD, and why each thing is the thing it is.
 *
 * These four are not a bestiary bolted onto the board; they are what the Marcas
 * de Ceniza made out of what died in them, which is the same premise Vesper is
 * built on (see HeroLook.js). Stated once here, and drawn to match in
 * BootScene:
 *
 *   CUAJO    fuego fatuo that nobody drank, pooled and gone thick. You can see
 *            the violet motes still suspended in it — it is the resource, spoiled.
 *   SILLAR   a block of the fallen temple that remembered how to walk. Same
 *            marble as the temples you build, same gold in its seams.
 *   VELADOR  a vigilante of Vesper's own order who died and would not put the
 *            lantern down. Hooded like Vesper, hollow inside, carrying a lamp
 *            that went out a long time ago. You are fighting your predecessors.
 *   ASCUA    what was sleeping underneath the fire temple. Basalt hide with the
 *            magma still showing through — the same molten the lava tower spits.
 *
 * `title` is the epithet the codex shows; `codex` is the one line under it.
 *
 * `gold` is the kill bounty. Since motes became life force that only temples
 * may absorb, this is where the entire building budget comes from — retuning
 * it is retuning the pace of the whole game.
 *
 * Elemental class, `weakness` and `resistance` are what make fusion a tactical
 * decision rather than a strictly-better upgrade: a wave is a question about
 * which elements you brought. Both are lists so a hybrid tower can be named
 * directly — hitting a dragon with Hielo is a different act from hitting it
 * with plain Agua, and the table should be able to say so.
 *
 * Kept deliberately lopsided: the tutorial enemy has a weakness and no
 * resistance, so the first thing the system teaches is the reward, not the
 * punishment.
 *
 * ── AGRO: the two that do not just walk ──────────────────
 * `agro` is what turns an enemy from a thing on a track into a thing with an
 * errand. It makes the enemy leave the road entirely and walk in a straight line
 * at something of yours. Two of the four have one, and in both cases the codex
 * line above already said they would:
 *
 *   VELADOR  hunts Vesper. It is a vigilante that died holding a lantern that
 *            went out, and Vesper is walking around with a lit one. It breaks
 *            off when he comes near and goes back to the road if he outruns it.
 *   SILLAR   sabotages temples. It is a block of a fallen temple, and it goes to
 *            put a standing one out. It does not destroy the building — it holds
 *            it shut, and it stays there doing it until something kills it.
 *
 * The fields, and why each one exists:
 *   target   'hero' or 'temple'.
 *   range    how close the target has to be before it breaks off. This is the
 *            whole difficulty dial: it is what decides whether a hero farming
 *            motes in the lane, or a temple parked next to the road, is a
 *            decision or a free lunch.
 *   leash    how far the target can get before it gives up and rejoins the road.
 *            Larger than `range` on purpose, or an enemy at the boundary would
 *            flicker between the two behaviours every frame.
 *   reach    how close it has to be to act on the target.
 *   color / colorHex   the ring under its feet while it is off the road, and
 *            the same colour as text. Nothing else on the board ever leaves the
 *            path, so the moment one does has to be legible immediately.
 *   hitMs / stunMs / maxHits   temple targets only: the wind-up before it
 *            strikes (and the gap between strikes if it gets more than one), how
 *            long the temple stays shut afterwards, and how many strikes it gets
 *            before it rejoins the road.
 *
 * `maxHits` started as a deadlock fix — a sillar that sat on a temple until
 * something killed it could not be outlasted, and a wave does not end until the
 * board is clear, so a player whose towers could not reach their own temple had
 * no move left except selling it.
 *
 * It is one strike now, and that is a readability fix rather than a balance one.
 * The temple goes dark on the first hit; the second and third landed on a door
 * that was already shut, refreshed a timer nobody can see, and left the sillar
 * standing there looking like it had forgotten what it came for. One strike, one
 * visible consequence, and it walks on. The whole cost lives in `stunMs`, where
 * it can be tuned without changing what the animation appears to be doing.
 */
export const ENEMY_DATA = {
    [ENEMY_TYPES.SLIME]: {
        name: 'Slime',
        title: 'Cuajo',
        codex: 'Fuego fatuo que nadie bebio, cuajado.',
        hp: 30,
        speed: 55,
        element: 'water',
        weakness: ['fire', 'lava'],
        resistance: [],
        gold: 6,
        manaDrops: 1,
        color: 0x7AD46A,
        colorDark: 0x2F8A3A,
    },
    [ENEMY_TYPES.GOLEM]: {
        name: 'Golem',
        title: 'Sillar',
        codex: 'Un bloque del templo caido, en pie.',
        hp: 80,
        speed: 32,
        element: 'earth',
        weakness: ['water', 'mud'],
        resistance: ['earth'],
        gold: 14,
        manaDrops: 2,
        color: 0x8BA0BC,
        colorDark: 0x5B6C8C,
        spawns: [{ type: ENEMY_TYPES.SLIME, count: 2 }],
        // Slow enough that the walk across the grass is a warning rather than an
        // ambush — a sillar that breaks off is on screen, off the road, for
        // several seconds before it arrives.
        agro: {
            target: 'temple',
            range: 120,
            leash: 320,
            leashTiles: 6,
            reach: 22,
            hitMs: 1600,
            stunMs: 6000,
            maxHits: 1,
            returnSpeedMult: 2.5,
            color: 0xCFDDE9,
            colorHex: '#CFDDE9',
        },
    },
    [ENEMY_TYPES.SPECTER]: {
        name: 'Espectro',
        title: 'Velador',
        codex: 'Un vigia que murio sin soltar el farol.',
        hp: 40,
        speed: 85,
        element: 'air',
        weakness: ['earth', 'storm'],
        resistance: ['air'],
        gold: 9,
        manaDrops: 1,
        color: 0x9A86C4,
        colorDark: 0x5B4A86,
        // The fastest thing on the board, so its range is the shortest: a
        // velador that noticed Vesper from across the map would be un-outrunnable
        // and the answer to it would stop being "move" and start being "do not
        // bring the hero out at all", which is the opposite of the point.
        agro: {
            target: 'hero',
            range: 118,
            leashTiles: 4.5,       // Max distance (in tiles) from where it left the path (~144px)
            leash: 144,
            targetLeash: 220,      // Max distance from target before giving up
            reach: 20,
            returnSpeedMult: 2.5,  // 2.5x speed while returning to the road
            color: 0xB388FF,
            colorHex: '#B388FF',
        },
    },
    [ENEMY_TYPES.DRAGON]: {
        name: 'Dragón',
        title: 'Ascua',
        codex: 'Lo que dormia bajo el templo de fuego.',
        hp: 200,
        speed: 40,
        element: 'fire',
        weakness: ['water', 'ice'],
        resistance: ['fire', 'lava'],
        gold: 45,
        manaDrops: 3,
        color: 0xFF8A2B,
        colorDark: 0xD43D0A,
        spawns: [{ type: ENEMY_TYPES.GOLEM, count: 1 }],
    },
    [ENEMY_TYPES.BOSS_TITAN]: {
        name: 'Titán de Sillar',
        title: 'Coloso Ancestral',
        codex: 'Un santuario entero congregado en un coloso de piedra.',
        hp: 650,
        speed: 26,
        element: 'earth',
        weakness: ['water', 'mud'],
        resistance: ['earth'],
        gold: 75,
        manaDrops: 6,
        color: 0xC49A45,
        colorDark: 0x6E4F1B,
        isBoss: true,
        bossSkills: [
            {
                id: 'earth_slam',
                name: 'Rugido Sísmico',
                type: 'circle',
                radius: 130,
                chargeMs: 1500,
                cd: 8500,
                initialCd: 3500,
                damage: 35,
                stunTowerMs: 4500,
                color: 0xD4A373,
                colorHex: '#D4A373',
                sound: 'boss_slam',
            },
        ],
    },
    [ENEMY_TYPES.BOSS_DRAGON]: {
        name: 'Ascua Primordial',
        title: 'Señor del Magma',
        codex: 'El corazon de fuego del volcan profundo despierto.',
        hp: 900,
        speed: 32,
        element: 'fire',
        weakness: ['water', 'ice'],
        resistance: ['fire', 'lava'],
        gold: 100,
        manaDrops: 8,
        color: 0xFF4500,
        colorDark: 0x8B0000,
        isBoss: true,
        bossSkills: [
            {
                id: 'fire_breath',
                name: 'Línea Ígnea',
                type: 'line',
                length: 240,
                width: 38,
                chargeMs: 1500,
                cd: 7500,
                initialCd: 3000,
                damage: 48,
                color: 0xFF5722,
                colorHex: '#FF5722',
                sound: 'boss_fire',
            },
        ],
    },
    [ENEMY_TYPES.BOSS_SPECTER]: {
        name: 'Rey Velador',
        title: 'Sombra de la Linterna',
        codex: 'El primer vigilante caido, senor de las almas errantes.',
        hp: 750,
        speed: 42,
        element: 'air',
        weakness: ['earth', 'storm'],
        resistance: ['air'],
        gold: 90,
        manaDrops: 7,
        color: 0xBA68C8,
        colorDark: 0x4A148C,
        isBoss: true,
        bossSkills: [
            {
                id: 'shadow_nova',
                name: 'Nova Sombría',
                type: 'target_circle',
                radius: 75,
                chargeMs: 1500,
                cd: 7000,
                initialCd: 2500,
                damage: 40,
                slowHero: 0.5,
                slowMs: 3000,
                color: 0x9C27B0,
                colorHex: '#9C27B0',
                sound: 'boss_nova',
            },
        ],
    },
};
