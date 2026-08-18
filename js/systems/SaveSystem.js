import { Tower } from '../entities/Tower.js';
import { Temple } from '../entities/Temple.js';
import { BARRICADE_COST } from './EconomySystem.js';
import { TILE } from './GridSystem.js';

const SAVE_KEY = 'elemental-td:save-v1';

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
                .map(t => ({ col: t.col, row: t.row, element: t.element, paid: t.paidCost }));
            templesToSave = gameScene.temples
                .filter(t => t.alive)
                .map(t => ({ col: t.col, row: t.row, element: t.element, paid: t.paidCost }));
            barricadesToSave = Array.from(gameScene.barricades.entries()).map(([key, cost]) => {
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r, cost };
            });
            breakableBlocksToSave = Array.from(gameScene.breakableBlocks.entries()).map(([key, hp]) => {
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r, hp };
            });
            templeLevelsToSave = { ...gameScene.templeSystem.levels };
        }

        const data = {
            version: 1,
            timestamp: Date.now(),
            gold: goldToSave,
            mana: manaToSave,
            lives: livesToSave,
            currentWave: currentWave,
            autoWave: gameScene.waveManager.autoWave ?? false,
            hero: heroData,
            towers: towersToSave,
            temples: templesToSave,
            barricades: barricadesToSave,
            breakableBlocks: breakableBlocksToSave,
            templeLevels: templeLevelsToSave,
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
            gameScene.waveManager.waveActive = false;
            gameScene.waveManager.autoWave = data.autoWave ?? false;

            // 3. Restore TempleSystem upgrade levels
            if (data.templeLevels) {
                gameScene.templeSystem.levels = { ...data.templeLevels };
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
                    }
                }
            }

            // 6. Restore Barricades
            if (data.barricades) {
                for (const b of data.barricades) {
                    gameScene.gridSystem.grid[b.row][b.col] = TILE.BARRICADE;
                    gameScene._setDecor(b.col, b.row, 'tile_barricade');
                    gameScene.barricades.set(`${b.col},${b.row}`, b.cost ?? BARRICADE_COST);
                }
            }

            // 7. Restore Towers
            if (data.towers) {
                for (const t of data.towers) {
                    const tower = new Tower(gameScene, t.col, t.row, t.element, t.paid ?? 20);
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

    static clearSave() {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
    }
}
