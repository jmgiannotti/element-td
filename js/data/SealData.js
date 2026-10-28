import { ELEMENTS, TOWER_DATA, FUSION_MAP } from './TowerData.js';

/**
 * Elemental seals (US 12.1): stone discs set into the ground, each carved with
 * one of the four elements. A tower built on a seal of its own element gets
 * that element's bonus.
 *
 * Which stat each element boosts follows what its towers are for. Fire and
 * earth are the heavy hitters, so their seals add damage; water and air are
 * control and tempo, and what those want is to cover more road.
 *
 * Hybrids and legendaries count every element they were made from, so an Ice
 * tower can use a water seal or an air one. That is what keeps seals relevant
 * after the fusions start — and fusion already lets the player choose which of
 * the two tiles the result lands on, so keeping a seal becomes part of that
 * choice.
 *
 * Seals are placed per level (LevelData.seals). They are stone, not grass, so
 * the same art works on any biome.
 */

export const SEAL_BONUS = {
    [ELEMENTS.FIRE]:  { stat: 'damage', mult: 1.2, label: '+20% DAÑO' },
    [ELEMENTS.EARTH]: { stat: 'damage', mult: 1.2, label: '+20% DAÑO' },
    [ELEMENTS.WATER]: { stat: 'range',  mult: 1.2, label: '+20% ALCANCE' },
    [ELEMENTS.AIR]:   { stat: 'range',  mult: 1.2, label: '+20% ALCANCE' },
};

export const SEAL_ELEMENTS = Object.keys(SEAL_BONUS);

/** The pure elements a tower is made of: itself, its two halves, or its parents' halves. */
export function componentsOf(element) {
    const t = TOWER_DATA[element];
    if (!t) return [];
    if (t.parents) return [...new Set(t.parents.flatMap(componentsOf))];
    if (t.tier === 2) {
        const pair = Object.keys(FUSION_MAP).find(k => FUSION_MAP[k] === element);
        return pair ? pair.split('+') : [];
    }
    return [element];
}

/** Whether a tower of `towerElement` draws on a seal of `sealElement`. */
export function sealMatches(sealElement, towerElement) {
    return !!sealElement && componentsOf(towerElement).includes(sealElement);
}
