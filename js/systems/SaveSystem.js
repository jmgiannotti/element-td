import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';
import { BARRICADE_COST } from './EconomySystem.js';
import { TILE } from './GridSystem.js';

const SAVE_KEY = 'elemental-td:save-v1';
// Kept apart from the save on purpose: a save is one game in progress and is
// wiped when it ends; progress is what the player has done across all of them.
const PROGRESS_KEY = 'elemental-td:progress-v1';

export class SaveSystem {
    static hasSave() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            return !!data && typeof data.gold === 'number' && data.lives > 0;
        } catch {
            return false;
        }
    }

    static getSummary() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || data.lives <= 0) return null;
            return {
                levelId: data.levelId || 'valle_sagrado',
                wave: data.currentWave ?? 0,
                gold: data.gold ?? 0,
                mana: data.mana ?? 0,
                lives: data.lives ?? 20,
                towersCount: data.towers?.length ?? 0,
                templesCount: data.temples?.length ?? 0,
                timestamp: data.timestamp ?? Date.now(),
            };
        } catch {
            return null;
        }
    }

    static getSaveData() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    static saveGame(gameScene) {
        if (!gameScene || gameScene.gameOver || gameScene.gameWon) return false;

        let currentWave;
        let goldToSave;
        let manaToSave;
        let livesToSave;

        let heroData = null;
        let towersToSave, templesToSave, barricadesToSave, breakableBlocksToSave, templeLevelsToSave;
        let overchargeToSave, mapStateToSave;

        if (gameScene.waveManager.waveActive && gameScene.waveStartCheckpoint) {
            // Mid-wave save: checkpoint is the EXACT START of the current wave.
            const cp = gameScene.waveStartCheckpoint;
            currentWave = cp.waveIndex;
            goldToSave = cp.gold;
            manaToSave = cp.mana;
            livesToSave = cp.lives;

            // Hero state at wave start
            heroData = gameScene.hero ? {
                posX: cp.heroPosX ?? gameScene.hero.posX,
                posY: cp.heroPosY ?? gameScene.hero.posY,
                hp: cp.heroHp ?? gameScene.hero.hp,
                maxHp: gameScene.hero.maxHp,
                manaCollected: cp.heroManaCollected ?? 0,
            } : null;

            towersToSave = cp.towers || [];
            templesToSave = cp.temples || [];
            barricadesToSave = cp.barricades || [];
            breakableBlocksToSave = cp.breakableBlocks || [];
            templeLevelsToSave = cp.templeLevels || {};
            overchargeToSave = cp.templeOvercharge || {};
            mapStateToSave = cp.mapState ?? null;
        } else {
            // Prep phase (between waves) or post-wave save:
            currentWave = gameScene.waveManager.currentWave;
            goldToSave = gameScene.economySystem.gold;
            manaToSave = gameScene.economySystem.mana;
            livesToSave = gameScene.economySystem.lives;

            heroData = gameScene.hero ? {
                posX: gameScene.hero.posX,
                posY: gameScene.hero.posY,
                hp: gameScene.hero.hp,
                maxHp: gameScene.hero.maxHp,
                manaCollected: gameScene.hero.manaCollected ?? 0,
            } : null;

            towersToSave = gameScene.towers
                .filter(t => t.alive)
                .map(t => ({
                    col: t.col,
                    row: t.row,
                    element: t.element,
                    paid: t.paidCost,
                    level: t.level || 1,
                    upg: t.upgradeSpent || 0,
                    damageDealt: t.totalDamageDealt || 0,
                    kills: t.enemiesKilled || 0,
                }));
            templesToSave = gameScene.temples
                .filter(t => t.alive)
                .map(t => ({ col: t.col, row: t.row, element: t.element, paid: t.paidCost }));
            barricadesToSave = Array.from(gameScene.barricades.entries()).map(([key, cost]) => {
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r, cost, enchant: gameScene.barricadeSystem.typeAt(c, r) };
            });
            breakableBlocksToSave = Array.from(gameScene.breakableBlocks.entries()).map(([key, hp]) => {
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r, hp };
            });
            templeLevelsToSave = SaveSystem.copyLevels(gameScene.templeSystem.levels);
            overchargeToSave = { ...gameScene.templeSystem.overcharge };
            mapStateToSave = gameScene.mapEvents ? gameScene.mapEvents.serialize() : null;
        }

        const data = {
            version: 1,
            timestamp: Date.now(),
            levelId: gameScene.levelData.id,
            gold: goldToSave,
            mana: manaToSave,
            lives: livesToSave,
            currentWave: currentWave,
            hero: heroData,
            towers: towersToSave,
            towerHistory: gameScene.towerHistory || [],
            temples: templesToSave,
            barricades: barricadesToSave,
            breakableBlocks: breakableBlocksToSave,
            templeLevels: templeLevelsToSave,
            // Sobrecarga purchases and the map's own state (MapEventSystem).
            // Both optional: saves from before them load with neither.
            templeOvercharge: overchargeToSave,
            mapState: mapStateToSave,
        };

        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[SaveSystem] Error al guardar partida:', e);
            return false;
        }
    }

    static loadGame(gameScene, saveData = null) {
        const data = saveData || this.getSaveData();
        if (!data || !gameScene) return false;

        try {
            // 1. Restore economy
            gameScene.economySystem.gold = data.gold ?? 110;
            gameScene.economySystem.mana = data.mana ?? 0;
            gameScene.economySystem.lives = data.lives ?? 20;

            // 2. Restore wave state (ready before wave starts)
            gameScene.waveManager.currentWave = data.currentWave ?? 0;
            // No rest timer after a load: the player starts the wave when
            // they have had a look, as on the first one.
            gameScene.waveManager.waveActive = false;
            gameScene.waveManager.restTimer = 0;

            // 3. Restore TempleSystem upgrade levels
            if (data.templeLevels) {
                gameScene.templeSystem.levels = SaveSystem.copyLevels(data.templeLevels);
            }
            if (data.templeOvercharge) {
                gameScene.templeSystem.overcharge = { ...data.templeOvercharge };
            }
            if (data.mapState && gameScene.mapEvents) {
                gameScene.mapEvents.restore(data.mapState);
            }

            // 4. Restore Hero
            if (data.hero && gameScene.hero) {
                const hero = gameScene.hero;
                if (data.hero.posX != null) {
                    hero.posX = data.hero.posX;
                    hero.sprite.x = data.hero.posX;
                }
                if (data.hero.posY != null) {
                    hero.posY = data.hero.posY;
                    hero.sprite.y = data.hero.posY;
                }
                if (data.hero.hp != null) hero.hp = data.hero.hp;
                if (data.hero.manaCollected != null) hero.manaCollected = data.hero.manaCollected;
                // Stop any in-progress movement so the hero stays put
                hero.targetPos = null;
                hero.moving = false;
                // Snap all visual sub-elements to the restored position
                hero.shadow.setPosition(hero.posX, hero.posY + 14);
                hero.hpBg.setPosition(hero.posX, hero.posY - 21);
                hero.collectField.setPosition(hero.posX, hero.posY);
                hero.comboLabel.setPosition(hero.posX, hero.posY - 32);
            }

            // 5. Restore breakable blocks status
            if (data.breakableBlocks) {
                const savedKeys = new Set(data.breakableBlocks.map(b => `${b.col},${b.row}`));
                for (const [key] of Array.from(gameScene.breakableBlocks.entries())) {
                    if (!savedKeys.has(key)) {
                        const [c, r] = key.split(',').map(Number);
                        gameScene.breakableBlocks.delete(key);
                        gameScene.gridSystem.grid[r][c] = TILE.PATH;
                        gameScene._setDecor(c, r, null);
                        gameScene._paintCell(c, r);
                    }
                }
                for (const b of data.breakableBlocks) {
                    const key = `${b.col},${b.row}`;
                    if (gameScene.breakableBlocks.has(key)) {
                        gameScene.breakableBlocks.set(key, b.hp);
                    } else if (gameScene.gridSystem.grid[b.row]?.[b.col] === TILE.PATH) {
                        // One the level did not start with: a meteor's rock.
                        gameScene.addBlock(b.col, b.row, b.hp);
                    }
                }
            }

            // 6. Restore Barricades
            if (data.barricades) {
                for (const b of data.barricades) {
                    gameScene.gridSystem.grid[b.row][b.col] = TILE.BARRICADE;
                    gameScene._setDecor(b.col, b.row, 'tile_barricade');
                    gameScene.barricades.set(`${b.col},${b.row}`, b.cost ?? BARRICADE_COST);
                    if (b.enchant) gameScene.barricadeSystem.restore(b.col, b.row, b.enchant);
                }
            }

            // 7. Restore Towers
            if (data.towerHistory) {
                gameScene.towerHistory = [...data.towerHistory];
            }
            if (data.towers) {
                for (const t of data.towers) {
                    const tower = new Tower(gameScene, t.col, t.row, t.element, t.paid ?? 20, t.level ?? 1, t.upg ?? 0);
                    tower.totalDamageDealt = t.damageDealt || 0;
                    tower.enemiesKilled = t.kills || 0;
                    tower.sprite.setScale(1);
                    gameScene.towers.push(tower);
                    gameScene.occupiedCells.add(`${t.col},${t.row}`);
                }
            }

            // 8. Restore Temples
            if (data.temples) {
                for (const t of data.temples) {
                    const temple = new Temple(gameScene, t.col, t.row, t.element, t.paid ?? 60);
                    temple.sprite.setScale(1);
                    if (temple.field) temple.field.setScale(1);
                    gameScene.temples.push(temple);
                    gameScene.occupiedCells.add(`${t.col},${t.row}`);
                }
            }

            gameScene.fusionSystem.refresh(true);
            gameScene.events.emit('path-changed');
            gameScene.events.emit('gold-changed', gameScene.economySystem.gold);
            gameScene.events.emit('mana-changed', gameScene.economySystem.mana);
            gameScene.events.emit('lives-changed', gameScene.economySystem.lives);
            return true;
        } catch (e) {
            console.error('[SaveSystem] Error al cargar partida:', e);
            return false;
        }
    }

    /** Temple levels copied one level deep — each element's counters too. */
    static copyLevels(levels) {
        return Object.fromEntries(Object.entries(levels || {}).map(([el, l]) => [el, { ...l }]));
    }

    static clearSave() {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
    }

    // ─── Progress across games ───────────────────────────
    /** levelId → { completed, bestWave }. Empty when nothing is stored. */
    static getProgress() {
        try {
            const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
            return data && typeof data === 'object' ? data : {};
        } catch {
            return {};
        }
    }

    /**
     * Records what a game reached on a map: `completed` once the last base wave
     * falls (it never goes back to false), and the furthest wave cleared, which
     * is how endless runs are compared.
     */
    static recordProgress(levelId, { completed = false, wave = 0 } = {}) {
        if (!levelId) return;
        const all = SaveSystem.getProgress();
        const prev = all[levelId] || { completed: false, bestWave: 0 };
        all[levelId] = {
            completed: prev.completed || completed,
            bestWave: Math.max(prev.bestWave || 0, wave),
        };
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
        } catch {
            // Private window or blocked storage: progress just is not kept.
        }
    }
}
