import * as Phaser from 'phaser';
import {
    TEMPLE_DATA, UPGRADE_TRACKS, TRACK_ORDER, templeCost, upgradeCost,
} from '../data/TempleData.js';

/**
 * Owns everything about temples: what the next one costs, which motes each one
 * harvests, and the per-element upgrade levels that buff every tower of that
 * element on the map.
 *
 * Upgrade levels live here rather than on the Temple entity on purpose —
 * fusing two temples destroys the buildings, and the knowledge they bought
 * should survive that.
 */
export class TempleSystem {
    constructor(scene) {
        this.scene = scene;
        /** element → { damage, fireRate, range } level counters */
        this.levels = {};
    }

    // ── Building ─────────────────────────────────
    get standing() {
        return this.scene.temples.filter(t => t.alive).length;
    }

    get nextCost() {
        return templeCost(this.standing);
    }

    hasTemple(element) {
        return this.scene.temples.some(t => t.alive && t.element === element);
    }

    /** Every element the player can currently spend maná on. */
    unlockedElements() {
        const seen = [];
        for (const t of this.scene.temples) {
            if (t.alive && !seen.includes(t.element)) seen.push(t.element);
        }
        return seen;
    }

    // ── Upgrades ─────────────────────────────────
    levelOf(element, track) {
        return this.levels[element]?.[track] ?? 0;
    }

    isMaxed(element, track) {
        return this.levelOf(element, track) >= UPGRADE_TRACKS[track].maxLevel;
    }

    costOf(element, track) {
        return upgradeCost(track, this.levelOf(element, track));
    }

    /** Percentage shown in the UI, e.g. 40 for "+40%". */
    bonusPct(element, track) {
        return Math.round(UPGRADE_TRACKS[track].step * this.levelOf(element, track) * 100);
    }

    /** Multiplier a tower applies to one of its base stats. */
    multiplier(element, track) {
        const lvl = this.levelOf(element, track);
        if (lvl === 0) return 1;
        const bonus = UPGRADE_TRACKS[track].step * lvl;
        // fireRate is a cooldown: a shorter one is the improvement.
        return track === 'fireRate' ? 1 / (1 + bonus) : 1 + bonus;
    }

    canUpgrade(element, track) {
        return this.hasTemple(element)
            && !this.isMaxed(element, track)
            && this.scene.economySystem.mana >= this.costOf(element, track);
    }

    buyUpgrade(element, track) {
        if (!this.canUpgrade(element, track)) return false;

        const cost = this.costOf(element, track);
        if (!this.scene.economySystem.spendMana(cost)) return false;

        const l = this.levels[element] || (this.levels[element] = {
            damage: 0, fireRate: 0, range: 0,
        });
        l[track]++;

        // Towers cache nothing, but their range ring is a real display object.
        for (const tower of this.scene.towers) {
            if (tower.alive && tower.element === element) tower.refreshStats();
        }
        for (const temple of this.scene.temples) {
            if (temple.alive && temple.element === element) temple.celebrate();
        }

        this.scene.events.emit('temple-upgraded', element, track, l[track]);
        return true;
    }

    /** Total levels bought for an element — used for the temple's rank pips. */
    totalLevels(element) {
        return TRACK_ORDER.reduce((sum, t) => sum + this.levelOf(element, t), 0);
    }

    towerCount(element) {
        return this.scene.towers.filter(t => t.alive && t.element === element).length;
    }

    /**
     * The nearest upgrade the player could still save up for, across every
     * element they have a temple for. Drives the maná progress bar, which is
     * what turns "keep collecting" into a visible goal.
     */
    cheapestUpgrade() {
        let best = null;
        for (const element of this.unlockedElements()) {
            for (const track of TRACK_ORDER) {
                if (this.isMaxed(element, track)) continue;
                const cost = this.costOf(element, track);
                if (!best || cost < best.cost) best = { element, track, cost };
            }
        }
        return best;
    }

    // ── Sanctuary ────────────────────────────────
    /**
     * The temple sheltering this point, or null. Consecrated ground: a velador
     * that has Vesper cornered gives up the chase the moment he reaches one.
     *
     * ── Why a temple, and why this radius ────────────────
     * Hunting the hero to the death made the answer to a velador "do not bring
     * the hero out", which is the opposite of what the hunt is for. A place to
     * break line of sight turns it back into a question about routes. And the
     * temple is the right place: it already draws its absorption ring on the
     * ground at all times, so the safe zone needs no new UI and the player has
     * been looking at its exact shape since they built it.
     *
     * ── Why a shut temple does not shelter ───────────────
     * The predicate is the same one absorption uses, deliberately. A sabotaged
     * temple hides its ring — if it still sheltered, the only drawing of the safe
     * zone on screen would be lying about where the safe zone is. So a sillar
     * putting a temple out also puts out its sanctuary, and the two Epic 4
     * enemies end up with something to say to each other.
     */
    shelterAt(x, y) {
        for (const t of this.scene.temples) {
            if (!t.alive || t.disabled) continue;
            if (Phaser.Math.Distance.Between(t.x, t.y, x, y) <= t.absorbRadius) return t;
        }
        return null;
    }

    // ── Mana absorption ──────────────────────────
    /**
     * Towers never touch motes. Life force flows into temples, and into the
     * hero when he walks over some.
     *
     * Temples get first refusal even when the hero is closer: only a temple
     * refines a mote above face value, so standing next to your own temple
     * must never cost you maná. The hero is reach, not throughput.
     */
    updateAbsorption(motes) {
        const hero = this.scene.hero;
        const heroActive = hero && !hero.isDead;
        if (this.scene.temples.length === 0 && !heroActive) return;

        for (const mote of motes) {
            if (!mote.alive || mote.collecting) continue;

            const temple = this._nearestTemple(mote);
            if (temple) {
                mote.collectBy(temple);
                continue;
            }

            if (heroActive) {
                const d = Phaser.Math.Distance.Between(
                    hero.x, hero.y, mote.sprite.x, mote.sprite.y
                );
                if (d <= hero.absorbRadius) mote.collectBy(hero);
            }
        }
    }

    /**
     * Closest covering temple, so order in the list never decides the winner.
     *
     * A temple held shut by a sillar is skipped entirely rather than losing a
     * contest — it has to be as if it were not there, or a working temple two
     * tiles further away would still lose the mote to it and the sabotage would
     * cost the player twice.
     */
    _nearestTemple(mote) {
        let best = null;
        let bestDist = Infinity;
        for (const temple of this.scene.temples) {
            if (!temple.alive || temple.disabled) continue;
            const d = Phaser.Math.Distance.Between(
                temple.x, temple.y, mote.sprite.x, mote.sprite.y
            );
            if (d <= temple.absorbRadius && d < bestDist) {
                best = temple;
                bestDist = d;
            }
        }
        return best;
    }

    /** Data helper for the UI. */
    dataFor(element) {
        return TEMPLE_DATA[element];
    }
}
