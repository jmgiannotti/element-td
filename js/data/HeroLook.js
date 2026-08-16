import {
    ramp, ellipse, taper, profile, volume, line, groundShadow,
} from '../systems/Pixels.js';
import { GOLD, SOUL } from './Palette.js';
import { HERO_SPRITE } from './HeroSprite.js';

/**
 * VESPER, DE LA VIGILIA DE CENIZA — who the hero is, and how that gets drawn.
 *
 * ── The fiction ──────────────────────────────────────────
 * The board is a stretch of the Marcas de Ceniza: old forest grown over temples
 * that went quiet a long time ago. What dies in the Marcas does not rot. It lets
 * go of its fuego fatuo — the violet motes — and if nobody drinks that, it
 * simply evaporates. The world is losing itself a little at a time.
 *
 * The Vigilia de Ceniza walked the road at night with a lantern that gives no
 * light: it *keeps* it. Every mote a vigilante drank went into the lantern, and
 * a lantern with something in it woke the monoliths along the road — the towers
 * are not machines, they are stones that remember who used to pass. That is the
 * whole hero kit stated as fiction, and every clause of it is a rule the game
 * already enforces:
 *
 *   · motes evaporate unheld                → ManaMote.lifetime
 *   · the lantern holds a streak, and       → Hero.comboCount / COMBO.window
 *     letting the streak lapse empties it
 *   · a monolith burns hotter near Vesper   → Tower.setEmpowered
 *   · ash scatters and re-forms at a temple → Hero respawn
 *
 * Vesper is the last of the Vigilia. Nobody else is coming.
 *
 * ── How that is drawn ────────────────────────────────────
 * Two independent axes:
 *
 *   LOOK  { mantle, crown, blade, lantern } — what Vesper is wearing. Each slot
 *         names an entry in the tables below. This is the upgrade axis: a new
 *         cloak or a reforged blade is a new table entry plus one
 *         `hero.setLook({ blade: 'estrellada' })`, and nothing else changes.
 *
 *   POSE  which frame of which action. This is the animation axis: stand, two
 *         walk frames, two swing frames.
 *
 * `ensureHeroTexture` bakes and caches (look × pose) on first use, so the two
 * axes multiply out without anyone having to enumerate the product by hand.
 */

// ─── Palette ────────────────────────────────────────────
// Vesper's own materials. Ash and indigo for the order, gold for its rank, and
// the game's maná violet for anything the lantern touches — the hero is lit by
// the same colour as the thing the hero is out there collecting.
const INDIGO = ramp(0x0e1338, 0x1e2a66, 0x33459b, 0x5d78d8, 0xb3c6ff);
// Genuinely ashen: a cloak lit as brightly as the face competes with it, and on
// this character the face is the whole point.
const ASH    = ramp(0x12111a, 0x22202c, 0x33303d, 0x484454, 0x635e72);
const SKIN   = ramp(0x5e3418, 0x9c5732, 0xc98455, 0xefb184, 0xffdcc0);
const STEEL  = ramp(0x24293a, 0x515a70, 0x8e97ab, 0xcbd3e0, 0xffffff);
// Light enough to read against the indigo legs and the dark ground. The boots
// are the only part of the walk cycle the player actually sees move, so they
// cannot be the darkest thing on the sprite.
const BOOT   = ramp(0x1c120c, 0x33230f, 0x54401f, 0x7a5c30, 0xa07b45);

// ─── Lore, as the game states it ────────────────────────
export const HERO_LORE = {
    name: 'VESPER',
    order: 'VIGILIA DE CENIZA',
    // Kept to what the player can act on: every clause here is a rule the game
    // already enforces, so the flavour doubles as the manual.
    codex: [
        'Lo que muere en las Marcas suelta su fuego fatuo,',
        'y se evapora si nadie lo bebe. La Vigilia lo juntaba',
        'en un farol que no da luz: la guarda. Los monolitos',
        'recuerdan a quien lo llevaba. Vesper es quien queda.',
    ],
};

// ─── Look slots ─────────────────────────────────────────
// Each table is a slot's catalogue. Adding an entry adds an appearance; the
// drawing code below reads from these and never names a colour of its own.

/** The half-cloak of the order. Hangs off the back shoulder, hem torn. */
export const MANTLES = {
    ceniza: { cloth: ASH, trim: GOLD, tatters: 3 },
};

/**
 * Worn on the brow. `stone` is the gem, if the entry has one.
 *
 * Vesper starts bare-headed on purpose. A 32px character has room for about
 * five features that actually read, and the starting look spends them on the
 * face, the cloak, the lantern, the blade and the legs. The circlet is here as
 * the first appearance upgrade instead — something the player is given rather
 * than something they start covered in.
 */
export const CROWNS = {
    ninguna: { band: null, stone: null },
    vigilia: { band: GOLD, stone: SOUL },
};

/** `groove` is the rune channel down the blade — it carries the light. */
export const BLADES = {
    aguja: { metal: STEEL, guard: GOLD, groove: SOUL },
};

/**
 * How full the lantern is. Driven live off the collection streak rather than
 * bought, so the hero visibly reports the one number the player is playing for.
 */
export const LANTERN_TIERS = ['apagado', 'vivo', 'ardiendo'];
export const LANTERNS = {
    apagado:  { flame: 0, glow: 0.00, radius: 0 },
    vivo:     { flame: 1, glow: 0.30, radius: 7 },
    ardiendo: { flame: 2, glow: 0.55, radius: 10 },
};

export const DEFAULT_LOOK = {
    mantle: 'ceniza',
    crown: 'ninguna',
    blade: 'aguja',
    lantern: 'apagado',
};

// ─── Poses ──────────────────────────────────────────────
/**
 * Five frames. Two of them are the walk cycle, and they are not optional
 * decoration: a character that slides across the ground with its legs welded
 * together reads as being dragged rather than as walking, which is most of why
 * this sprite looked like it was moving backwards.
 */
export const POSES = {
    stand:  { legs: 'together', arm: 'rest', blade: 'up',     lift: 0 },
    walkA:  { legs: 'stride',   arm: 'rest', blade: 'up',     lift: 0 },
    walkB:  { legs: 'pass',     arm: 'rest', blade: 'up',     lift: -1 },
    windUp: { legs: 'brace',    arm: 'high', blade: 'back',   lift: -1 },
    strike: { legs: 'lunge',    arm: 'low',  blade: 'across', lift: 1 },
};
export const POSE_NAMES = Object.keys(POSES);

/**
 * The classic two-frame walk: legs apart, then legs passing with the body
 * lifted a pixel. Two frames that differ a lot beat four that differ a little —
 * the first attempt moved a foot by one pixel per frame and read as a statue
 * being slid across the floor, which is the thing this is here to fix.
 */
export const WALK_CYCLE = ['walkA', 'walkB'];

/** The key of a baked (look × pose) combination, ignoring any imported art. */
export function composedHeroKey(look, pose = 'stand') {
    return `hero_${look.mantle}_${look.crown}_${look.blade}_${look.lantern}_${pose}`;
}

/**
 * The key the hero is actually wearing right now — which is the imported
 * sprite while that experiment is switched on, and the composed one otherwise.
 * Everything that shows the hero goes through here, so the swap reaches the
 * dash ghosts and the codex portrait without either of them knowing about it.
 */
export function heroTextureKey(look, pose = 'stand') {
    if (HERO_SPRITE.enabled) return HERO_SPRITE.key;
    return composedHeroKey(look, pose);
}

export const HERO_GLOW_KEY = 'hero_lantern_glow';
export const HERO_SLASH_KEY = 'hero_slash';

/** Which lantern tier a given collection streak lights. */
export function lanternTierFor(comboCount) {
    if (comboCount >= 4) return 'ardiendo';
    if (comboCount >= 1) return 'vivo';
    return 'apagado';
}

// ─── Drawing ────────────────────────────────────────────

/**
 * Composes one hero frame into a 32×32 graphics buffer.
 *
 * Draw order is back to front and fixed: mantle, legs, torso, lantern, head,
 * arm, blade. Every slot and every pose is free to change what it puts down as
 * long as it stays inside its layer.
 *
 * The whole figure is drawn facing RIGHT. Nothing here is symmetric — the
 * blade leads, the cloak trails, the face is turned a quarter toward the
 * leading side — because the sprite has exactly one job besides looking like
 * somebody, and that job is saying which way it is going.
 */
export function drawHero(g, look = DEFAULT_LOOK, poseName = 'stand') {
    const mantle = MANTLES[look.mantle] ?? MANTLES.ceniza;
    const crown = CROWNS[look.crown] ?? CROWNS.ninguna;
    const blade = BLADES[look.blade] ?? BLADES.aguja;
    const lantern = LANTERNS[look.lantern] ?? LANTERNS.apagado;
    const pose = POSES[poseName] ?? POSES.stand;
    const y = pose.lift;

    _mantle(g, mantle, y);
    _legs(g, pose.legs);
    groundShadow(g, 16, 30, pose.legs === 'lunge' ? 10 : 8, 1, 0.26);
    _torso(g, y);
    _lantern(g, lantern, y);
    _head(g, crown, y);
    _arm(g, blade, pose.arm, y);
    _blade(g, blade, pose.blade, y);
}

/**
 * The order's half-cloak. It hangs off the BACK shoulder and stays behind the
 * body — a cloak spread evenly around a figure is how a sprite ends up reading
 * as a back view, which is the other half of why this one did.
 */
function _mantle(g, m, dy) {
    volume(g, profile(11 + dy, [
        [8, 12], [7, 12], [6, 12], [6, 12], [6, 12], [6, 12],
        [7, 12], [7, 12], [7, 12], [7, 11], [8, 11], [8, 11],
    ]), m.cloth, { lu: 0.34, lv: 0.18, spec: 0.14 });

    // Tatters — the hem does not end, it frays
    for (let i = 0; i < m.tatters; i++) {
        const x = 7 + i * 2;
        const len = 2 + ((i * 2) % 3);
        volume(g, taper(23 + dy, 23 + dy + len, 1, 0, x, 1.6), m.cloth,
            { outline: false, flat: true, alpha: 0.95 });
    }

    // The hood, pushed off the head and bunched on the back shoulder. Small,
    // and firmly to one side: a hood ring around the neck reads as a cowl seen
    // from behind, head included.
    volume(g, profile(9 + dy, [[7, 12], [6, 13], [7, 12]]), m.cloth,
        { lu: 0.3, lv: 0.2, spec: 0.16 });

    g.fillStyle(m.cloth.deep); g.fillRect(10, 15 + dy, 1, 8);
    g.fillStyle(m.cloth.glow, 0.5); g.fillRect(7, 15 + dy, 1, 5);

    // The clasp that pins it at the shoulder
    g.fillStyle(m.trim.dark);  g.fillRect(11, 12 + dy, 3, 2);
    g.fillStyle(m.trim.light); g.fillRect(11, 12 + dy, 2, 1);
    g.fillStyle(SOUL.glow);    g.fillRect(12, 12 + dy, 1, 1);
}

/**
 * One leg routine, five stances.
 *
 * Two constraints learned the hard way. The feet need a visible gap between
 * them or they merge into one bar and the figure has no legs at all. And the
 * trailing foot has to stay *below* the lantern, which hangs on that same hip —
 * swung back at boot height it disappeared behind the cage, so the stride frame
 * showed a one-legged character and read as no animation at all.
 */
function _legs(g, stance) {
    const leg = (x, top, h) => {
        g.fillStyle(INDIGO.deep); g.fillRect(x, top, 5, h);
        g.fillStyle(INDIGO.dark); g.fillRect(x, top, 4, h - 1);
        g.fillStyle(INDIGO.mid);  g.fillRect(x, top, 2, h - 1);
    };
    const boot = (x, top, w = 7) => {
        g.fillStyle(BOOT.deep);  g.fillRect(x - 1, top - 1, w + 2, 4);
        g.fillStyle(BOOT.dark);  g.fillRect(x, top, w, 3);
        g.fillStyle(BOOT.mid);   g.fillRect(x, top, w, 2);
        g.fillStyle(BOOT.light); g.fillRect(x, top, w - 1, 1);
        g.fillStyle(BOOT.glow);  g.fillRect(x, top, 2, 1);
    };

    if (stance === 'stride') {
        // Trailing leg swung back and lifted, leading leg planted forward
        leg(9, 23, 4);  boot(5, 26, 8);
        leg(18, 22, 5); boot(18, 27, 8);
    } else if (stance === 'pass') {
        // Legs together underneath, the moment the body rises over them
        leg(12, 22, 5); boot(10, 27, 7);
        leg(16, 21, 6); boot(17, 26, 7);
    } else if (stance === 'lunge') {
        // Weight thrown forward onto the front foot
        leg(19, 22, 5); boot(19, 27, 9);
        leg(9, 23, 4);  boot(5, 27, 8);
    } else if (stance === 'brace') {
        leg(10, 22, 6); boot(6, 28, 8);
        leg(18, 22, 6); boot(18, 28, 8);
    } else {
        leg(11, 22, 5); boot(9, 27, 7);
        leg(17, 22, 5); boot(17, 27, 7);
    }
}

/**
 * Breastplate. Deliberately plain: the torso is the one large flat area on the
 * sprite, and everything the character has to say is already being said by the
 * face, the cloak, the lantern and the blade.
 */
function _torso(g, dy) {
    volume(g, profile(12 + dy, [
        [10, 21], [10, 21], [10, 21], [10, 21], [10, 21], [10, 21],
        [11, 20], [11, 20], [11, 20], [11, 20],
    ]), INDIGO, { lu: 0.28, lv: 0.24, spec: 0.16 });

    // Collarbone, so the chest is not one flat plate, then the belt
    g.fillStyle(INDIGO.light, 0.6); g.fillRect(12, 13 + dy, 6, 1);
    g.fillStyle(INDIGO.deep, 0.7);  g.fillRect(11, 14 + dy, 10, 1);
    g.fillStyle(INDIGO.deep);       g.fillRect(11, 19 + dy, 10, 1);
    g.fillStyle(GOLD.dark);         g.fillRect(11, 20 + dy, 10, 1);
    g.fillStyle(GOLD.mid);          g.fillRect(16, 20 + dy, 4, 1);
    g.fillStyle(INDIGO.dark);       g.fillRect(14, 13 + dy, 1, 6);
}

/**
 * The lantern, hung off the belt on the trailing hip. Small and low, so it
 * reads as carried rather than worn — what has to survive at playing size is
 * the colour inside it, not the cage around it.
 */
function _lantern(g, l, dy) {
    g.fillStyle(GOLD.dark);  g.fillRect(10, 18 + dy, 1, 2);
    g.fillStyle(GOLD.deep);  g.fillRect(7, 19 + dy, 5, 7);
    g.fillStyle(GOLD.mid);   g.fillRect(8, 19 + dy, 3, 1); g.fillRect(8, 25 + dy, 3, 1);
    g.fillStyle(GOLD.light); g.fillRect(8, 19 + dy, 2, 1);

    g.fillStyle(0x0a0716); g.fillRect(8, 20 + dy, 3, 5);
    if (l.flame > 0) {
        g.fillStyle(SOUL.mid);   g.fillRect(8, 20 + dy, 3, 5);
        g.fillStyle(SOUL.light); g.fillRect(9, 21 + dy, 1, 3);
    }
    if (l.flame > 1) {
        g.fillStyle(SOUL.light); g.fillRect(8, 20 + dy, 3, 5);
        g.fillStyle(SOUL.glow);  g.fillRect(9, 21 + dy, 1, 3);
        g.fillStyle(SOUL.mid, 0.30); g.fillRect(5, 17 + dy, 9, 11);
    }
    g.fillStyle(GOLD.deep); g.fillRect(8, 22 + dy, 3, 1);
}

/**
 * The face, turned a quarter toward the leading side.
 *
 * Everything about this is in service of one question the player asks
 * constantly and unconsciously: which way is he facing? A perfectly frontal
 * face answers "neither", and a frontal face on a body that is sliding sideways
 * answers "backwards". So the features sit off-centre toward the blade, the
 * trailing side of the skull gets a sliver of shadow, and the far eye is the
 * smaller of the two.
 */
function _head(g, crown, dy) {
    volume(g, ellipse(17, 7 + dy, 4, 4), SKIN, { lu: 0.34, lv: 0.3, spec: 0.16 });

    // Hair: a cap and a short trailing lock. Weighted to the back of the skull,
    // which is the other half of the three-quarter read.
    g.fillStyle(0x2a1d22); g.fillRect(13, 2 + dy, 8, 3);
    g.fillRect(12, 4 + dy, 2, 5); g.fillRect(21, 4 + dy, 1, 3);
    g.fillStyle(0x453036); g.fillRect(15, 2 + dy, 4, 1); g.fillRect(12, 4 + dy, 1, 3);

    // Eyes: near one full, far one clipped by the cheek
    g.fillStyle(0xf2f6ff); g.fillRect(18, 7 + dy, 2, 2); g.fillRect(15, 7 + dy, 1, 2);
    g.fillStyle(0x24408f); g.fillRect(19, 7 + dy, 1, 2); g.fillRect(15, 7 + dy, 1, 1);
    // Brow, nose and jaw on the lit side
    g.fillStyle(0x2a1d22, 0.5); g.fillRect(15, 6 + dy, 6, 1);
    g.fillStyle(SKIN.dark, 0.7); g.fillRect(20, 9 + dy, 1, 1);
    g.fillStyle(SKIN.dark, 0.55); g.fillRect(16, 10 + dy, 3, 1);
    // Shadowed sliver at the back of the head
    g.fillStyle(SKIN.deep, 0.45); g.fillRect(13, 6 + dy, 1, 5);

    if (crown.band) {
        g.fillStyle(crown.band.dark);   g.fillRect(13, 6 + dy, 9, 1);
        g.fillStyle(crown.band.mid);    g.fillRect(13, 5 + dy, 9, 1);
        g.fillStyle(crown.band.light);  g.fillRect(14, 5 + dy, 3, 1);
        g.fillStyle(crown.stone.dark);  g.fillRect(18, 4 + dy, 2, 3);
        g.fillStyle(crown.stone.light); g.fillRect(18, 5 + dy, 2, 1);
        g.fillStyle(crown.stone.glow);  g.fillRect(18, 5 + dy, 1, 1);
    }
}

/** The sword arm, in one of three positions. */
function _arm(g, b, kind, dy) {
    const spans = kind === 'high'
        ? profile(9 + dy, [[21, 24], [22, 25], [23, 26], [23, 26]])
        : kind === 'low'
            ? profile(15 + dy, [[21, 25], [22, 27], [23, 27]])
            : profile(13 + dy, [[21, 24], [22, 25], [22, 25], [22, 25]]);
    volume(g, spans, INDIGO, { lu: 0.4, lv: 0.3, spec: 0.2 });
}

/** The blade, in one of three positions, plus the arc when it is swinging. */
function _blade(g, b, kind, dy) {
    if (kind === 'back') {
        // Wound up over the trailing shoulder, pointing up and back
        volume(g, profile(1 + dy, [
            [25, 26], [25, 26], [24, 26], [24, 25], [23, 25],
            [23, 24], [22, 24], [22, 23], [21, 23], [21, 22],
        ]), b.metal, { lu: 0.3, lv: 0.4, spec: 0.2 });
        g.fillStyle(b.groove.mid); g.fillRect(24, 4 + dy, 1, 3); g.fillRect(23, 7 + dy, 1, 2);
        g.fillStyle(b.guard.dark);  g.fillRect(19, 11 + dy, 5, 2);
        g.fillStyle(b.guard.light); g.fillRect(19, 11 + dy, 3, 1);
        return;
    }

    if (kind === 'across') {
        // Swung through, level, in front of the body
        volume(g, profile(14 + dy, [
            [21, 30], [20, 31], [21, 29],
        ]), b.metal, { lu: 0.2, lv: 0.4, spec: 0.16 });
        g.fillStyle(b.groove.mid);  g.fillRect(22, 15 + dy, 7, 1);
        g.fillStyle(b.groove.glow); g.fillRect(26, 15 + dy, 3, 1);
        g.fillStyle(b.guard.dark);  g.fillRect(19, 13 + dy, 2, 4);
        g.fillStyle(b.guard.light); g.fillRect(19, 13 + dy, 1, 3);

        // The arc the edge just travelled. Cheap, and it is what turns two
        // frames into a swing rather than two unrelated stances.
        g.fillStyle(b.groove.light, 0.55);
        for (const [x, y] of [[27, 8], [29, 10], [30, 12]]) g.fillRect(x, y + dy, 1, 2);
        g.fillStyle(b.groove.glow, 0.35);
        for (const [x, y] of [[25, 7], [28, 9]]) g.fillRect(x, y + dy, 1, 1);
        return;
    }

    // At rest: held upright alongside the leading shoulder
    volume(g, taper(2 + dy, 15 + dy, 2, 1, 25, 1), b.metal, { lu: 0.25, lv: 0.5, spec: 0.2 });
    g.fillStyle(b.metal.glow); g.fillRect(23, 3 + dy, 1, 11);
    g.fillStyle(b.metal.deep); g.fillRect(26, 5 + dy, 1, 9);
    g.fillStyle(0xffffff);     g.fillRect(23, 4 + dy, 1, 4);

    // The rune channel. Runes on the blade and runes on the towers are the same
    // motif — that is the visual claim that the monoliths know this person.
    line(g, 24, 4 + dy, 24, 13 + dy, b.groove.mid);
    g.fillStyle(b.groove.glow); g.fillRect(24, 4 + dy, 1, 2); g.fillRect(24, 11 + dy, 1, 1);

    g.fillStyle(b.guard.dark);  g.fillRect(22, 15 + dy, 6, 2);
    g.fillStyle(b.guard.light); g.fillRect(22, 15 + dy, 4, 1);
    g.fillStyle(0x2e2013);      g.fillRect(24, 17 + dy, 2, 3);
    g.fillStyle(b.guard.mid);   g.fillRect(24, 20 + dy, 2, 1);
}

/**
 * The halo the lantern throws. A separate texture rather than part of the hero
 * so it can pulse, scale and fade on its own clock without rebaking a sprite.
 */
export function drawLanternGlow(g) {
    for (let r = 12; r > 0; r--) {
        g.fillStyle(SOUL.light, 0.030 * (1 - r / 13));
        g.fillCircle(13, 13, r);
    }
    g.fillStyle(SOUL.glow, 0.16); g.fillCircle(13, 13, 4);
}

/**
 * The crescent the edge leaves behind, drawn pointing right so it can be
 * rotated onto whatever Vesper actually swung at. This is what replaced the
 * straight violet beam the auto-attack used to fire: a beam says "ranged
 * weapon", and the character is holding a sword.
 */
export function drawSlash(g) {
    const R = 13;
    for (let i = 0; i <= 34; i++) {
        const a = (-0.62 + (i / 34) * 1.24);
        const x = Math.round(4 + Math.cos(a) * R);
        const y = Math.round(14 + Math.sin(a) * R);
        const t = Math.abs(i / 34 - 0.5) * 2;           // 0 mid-arc, 1 at the tips
        const w = t > 0.85 ? 1 : t > 0.5 ? 2 : 3;
        g.fillStyle(SOUL.mid, 0.55 * (1 - t * 0.7));
        g.fillRect(x - 1, y - 1, w + 2, w + 2);
        g.fillStyle(SOUL.light, 1 - t * 0.5);
        g.fillRect(x, y, w, w);
        if (t < 0.45) { g.fillStyle(0xffffff, 0.8); g.fillRect(x, y, 1, 1); }
    }
}

/**
 * The look × pose → texture seam. Bakes a combination the first time it is
 * asked for and hands back the key; every later call is a cache hit, so an
 * upgrade that changes appearance costs one draw and nothing per frame.
 */
export function bakeHeroTexture(scene, look, pose = 'stand') {
    const key = composedHeroKey(look, pose);
    if (!scene.textures.exists(key)) {
        const g = scene.add.graphics();
        drawHero(g, look, pose);
        g.generateTexture(key, 32, 32);
        g.destroy();
    }
    return key;
}

/**
 * What to hand a sprite for this (look, pose).
 *
 * The imported sprite wins when it is switched on AND actually loaded. That
 * second condition is the whole safety net: a data URI that fails to decode
 * would otherwise hand out a key Phaser has never seen, which renders as its
 * placeholder square with no error anywhere. Falling through to the composed
 * hero means the worst case is the art you already had.
 */
export function ensureHeroTexture(scene, look, pose = 'stand') {
    if (HERO_SPRITE.enabled && scene.textures.exists(HERO_SPRITE.key)) {
        return HERO_SPRITE.key;
    }
    return bakeHeroTexture(scene, look, pose);
}

/** True while the hero's art carries its own walk and swing frames. */
export function heroArtHasPoses() {
    return !HERO_SPRITE.enabled || HERO_SPRITE.poses;
}

/**
 * True while the hero's art is a strip that animates itself.
 *
 * This is the difference between the two ways the hero can be animated. The
 * composed hero has no animations: it has (look × pose) textures, and Hero swaps
 * the texture per frame. The drawn strip is the opposite — one texture, and
 * Phaser's animation manager walks its frames on the artist's own timing. Hero
 * asks this to know which of the two it is driving.
 *
 * Asked of the clip and not of the config on purpose. BootScene only registers
 * the walk once the strip has actually decoded, so this answers false in exactly
 * the cases where the hero has quietly fallen back to the composed sprite — and
 * the pose machine takes over again instead of driving an animation that is not
 * there.
 */
export function heroArtAnimates(scene) {
    return HERO_SPRITE.enabled && !!scene?.anims?.exists(HERO_SPRITE.walkAnim);
}

/**
 * Which way the current art is drawn facing: -1 left, +1 right.
 *
 * A fact about the drawing, not about the hero. The composed Vesper is drawn
 * facing right — everything in `drawHero` is asymmetric in service of that — and
 * the hand-drawn strip faces left. Nothing else in the game needs to know which,
 * as long as it turns the hero through `heroFlipX`.
 */
export function heroArtDir() {
    return HERO_SPRITE.enabled && HERO_SPRITE.facing === 'left' ? -1 : 1;
}

/**
 * Whether the sprite has to be mirrored to head in `dir` (-1 left, +1 right).
 *
 * Mirror when the direction wanted is not the one the art already faces. Writing
 * that as `flipX = headingLeft` instead — which is what this used to be — is only
 * correct for art drawn facing right, and on art drawn facing left it turns the
 * character around exactly when it should not: the hero walks backwards.
 */
export function heroFlipX(dir) {
    return dir !== heroArtDir();
}

/**
 * Where the lantern hangs, relative to the sprite's centre. A fact about the
 * drawing rather than about the hero, which is why it lives here: on the
 * composed sprite the lantern is on a hip, on the imported one it hangs off the
 * helmet, and on art with no lantern at all the halo just sits centred as an
 * aura.
 *
 * Both mirror with `flipX`, and they have to: the halo is an object of its own,
 * so nothing flips it for free, and a lamp offset that ignores the flip lights up
 * the back of the character's head half the time.
 */
export function lanternOffset(flipX) {
    if (HERO_SPRITE.enabled) {
        const dx = HERO_SPRITE.lanternDx;
        return { x: flipX ? -dx : dx, y: HERO_SPRITE.lanternDy };
    }
    return { x: flipX ? 7 : -7, y: 4 };
}
