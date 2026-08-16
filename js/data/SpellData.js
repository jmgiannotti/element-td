/**
 * LOS HECHIZOS — the only thing in the game that spends maná outside a temple.
 *
 * ── Why they exist ───────────────────────────────────────
 * Maná had exactly one buyer: temple upgrades. That is a ladder, not a
 * decision — every mote you collect is already spoken for, and once the tracks
 * are maxed the resource stops meaning anything. A spell is the other buyer:
 * expensive, instant, and gone. It turns "I am saving for CADENCIA 4" into a
 * question you have to answer while a wave is leaking.
 *
 * So the price is deliberately in the same range as an upgrade (see
 * UPGRADE_TRACKS in TempleData). Casting has to cost you a rank you wanted.
 *
 * ── Why the hero casts them ──────────────────────────────
 * The fiction already had the answer. The Vigilia's lantern does not give
 * light, it *keeps* it: every mote Vesper drinks goes in there. A spell is
 * Vesper giving the whole lantern back at once — which is why the hero has to
 * be alive to cast, why the hero stands still to do it, and why the animation
 * is the light he was holding leaving him.
 *
 * ── The two axes a spell has ─────────────────────────────
 *   COST   maná spent, and the cooldown before it can be spent again.
 *   SHAPE  what it does where — a radius around a point the player clicks.
 *
 * Adding a spell is an entry here plus a `_cast<Name>` in SpellSystem and an
 * icon in BootScene. The UI, the hotkey, the targeting cursor, the maná check
 * and the cooldown wipe are all driven off this table.
 */

export const SPELLS = {
    luna: {
        key: 'luna',
        label: 'LUNA',
        hotkey: 'R',
        /** Baked by BootScene; also what the sidebar button shows. */
        icon: 'spell_luna',

        // ── Cost ────────────────────────────────
        // One CADENCIA rank, roughly. Enough that casting is a choice you can
        // regret, cheap enough that it is not a once-a-run trophy.
        cost: 120,
        cooldown: 25000,

        // ── Shape ───────────────────────────────
        /** Clicked on the map. The moon lands where you point, not on the hero. */
        targeted: true,
        radius: 92,
        // Kills a slime (30), a specter (40) or a golem (80) outright and takes
        // most of a dragon (200). A rescue, not a wave-clear: the cooldown is
        // long enough that it cannot be the plan.
        damage: 130,
        slow: 0.5,
        slowDuration: 2600,

        // ── Timing ──────────────────────────────
        /** Vesper wraps himself in the light he was keeping. */
        channelMs: 620,
        /** Then the sky answers, and it takes this long to arrive. */
        fallMs: 1300,
        /** Desde qué ángulo entra, en grados. 0 = vertical, positivo = desde la izquierda. */
        fallAngle: 28,

        color: 0xCFDDE9,
        colorHex: '#CFDDE9',
        // Body copy only. Cost and cooldown are rendered from the numbers above
        // so they can never fall out of step with the rules that govern.
        desc: [
            'Vesper devuelve el farol entero y',
            'el cielo contesta: una luna cae donde',
            'apuntes. 130 de daño y 50% mas lentos.',
        ],
    },
};

export const SPELL_ORDER = ['luna'];

/** `LUNA  [R]  ·  120✦  ·  25s` — name, key, price and recharge in one line. */
export function spellHeading(key) {
    const s = SPELLS[key];
    return `${s.label}  [${s.hotkey}]  ·  ${s.cost}✦  ·  ${s.cooldown / 1000}s`;
}
