import * as Phaser from 'phaser';

/**
 * Handles all particle effects in the game to replace expensive Tweens and
 * temporary GameObjects. Emitting particles is significantly faster and doesn't
 * strain the Garbage Collector.
 */
export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Generate a 2x2 white square texture for the sparks
        if (!scene.textures.exists('fx_spark')) {
            const g = scene.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 2, 2);
            g.generateTexture('fx_spark', 2, 2);
        }
        
        // Generate a thin white ring texture
        if (!scene.textures.exists('fx_ring')) {
            const g = scene.make.graphics({ x: 0, y: 0, add: false });
            g.lineStyle(2, 0xffffff, 1);
            g.strokeCircle(8, 8, 7);
            g.generateTexture('fx_ring', 16, 16);
        }

        // Setup the spark emitter
        this.sparkEmitter = scene.add.particles(0, 0, 'fx_spark', {
            emitting: false,
            speed: { min: 25, max: 70 },
            lifespan: { min: 200, max: 340 },
            scale: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            quantity: 4,
            blendMode: 'ADD',
        }).setDepth(16);

        // Setup the ring emitter
        this.ringEmitter = scene.add.particles(0, 0, 'fx_ring', {
            emitting: false,
            speed: 0,
            lifespan: 220,
            scale: { start: 0.3, end: 1.8 },
            alpha: { start: 0.5, end: 0 },
            quantity: 1,
            blendMode: 'ADD',
        }).setDepth(16);
    }

    /**
     * Emits a hit burst at (x, y) with the specified color.
     */
    emitBurst(x, y, color) {
        // We override the tint directly on the emitters before emitting
        this.sparkEmitter.setParticleTint(color);
        this.ringEmitter.setParticleTint(color);

        this.sparkEmitter.emitParticleAt(x, y);
        this.ringEmitter.emitParticleAt(x, y);
    }

    destroy() {
        if (this.sparkEmitter) this.sparkEmitter.destroy();
        if (this.ringEmitter) this.ringEmitter.destroy();
    }
}
