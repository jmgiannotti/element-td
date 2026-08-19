import * as Phaser from 'phaser';

/**
 * Ethereal arcane aura effect rendered beneath and around mana motes on the floor.
 * Blends rhythmic breathing pulses, orbiting arcane wisps, and floating micro-sparks.
 */
export class ManaAuraEffect {
    constructor(scene, x, y) {
        this.scene = scene;
        this.alive = true;
        this.time = Math.random() * 100;

        // Container anchored at the mote world position
        this.container = scene.add.container(x, y).setDepth(7.5);

        // Ground shadow on the grass/road
        this.shadow = scene.add.ellipse(0, 8, 14, 6, 0x000000, 0.28);
        this.container.add(this.shadow);

        // Additive glowing aura halo
        this.auraGraphics = scene.add.graphics();
        this.auraGraphics.setBlendMode(Phaser.BlendModes.ADD);
        this.container.add(this.auraGraphics);

        // Orbiting arcane wisps
        this.sparks = [
            { angle: Math.random() * Math.PI * 2, dist: 10, speed: 2.6, size: 1.5, color: 0xB388FF },
            { angle: Math.random() * Math.PI * 2, dist: 13, speed: -2.1, size: 1.2, color: 0x74D2F5 },
            { angle: Math.random() * Math.PI * 2, dist: 8,  speed: 3.2, size: 1.0, color: 0xF1E6FF },
        ];

        // Floating upward sparks
        this.risingSparks = [];
        this.spawnSparkTimer = 0;
    }

    update(_time, delta) {
        if (!this.alive || !this.auraGraphics) return;

        this.time += delta * 0.003;
        const t = this.time;

        const g = this.auraGraphics;
        g.clear();

        // Pulsing breathing rhythm (~1.8s cycle)
        const pulse = 0.85 + 0.15 * Math.sin(t * 3.5);
        const r1 = 13 * pulse;
        const r2 = 8 * pulse;
        const r3 = 4.5 * pulse;

        // 1. Concentric radial glow in SOUL palette
        // Outer faint violet corona
        g.fillStyle(0x5B2BB0, 0.22 * pulse);
        g.fillCircle(0, 0, r1);

        // Mid vibrant soul glow
        g.fillStyle(0x8F5CE8, 0.35 * pulse);
        g.fillCircle(0, 0, r2);

        // Inner bright violet/cyan radiance
        g.fillStyle(0xB388FF, 0.50 * pulse);
        g.fillCircle(0, 0, r3);

        // Specular core spark
        g.fillStyle(0xF1E6FF, 0.70 * pulse);
        g.fillCircle(0, 0, 2.0);

        // 2. Orbiting arcane wisps
        for (const spark of this.sparks) {
            spark.angle += spark.speed * (delta / 1000);
            const sx = Math.cos(spark.angle) * spark.dist;
            const sy = Math.sin(spark.angle) * (spark.dist * 0.55); // 2.5D perspective

            // Core spark
            g.fillStyle(spark.color, 0.9);
            g.fillCircle(sx, sy, spark.size);

            // Glow halo around spark
            g.fillStyle(spark.color, 0.28);
            g.fillCircle(sx, sy, spark.size * 2.4);
        }

        // 3. Occasional drifting spark floating upward
        this.spawnSparkTimer += delta;
        if (this.spawnSparkTimer >= 450 && this.risingSparks.length < 3) {
            this.spawnSparkTimer = 0;
            this.risingSparks.push({
                x: (Math.random() - 0.5) * 8,
                y: 2,
                vy: -(10 + Math.random() * 8),
                life: 1.0,
                color: Math.random() < 0.6 ? 0xB388FF : 0x74D2F5,
                size: 0.8 + Math.random() * 0.6,
            });
        }

        for (let i = this.risingSparks.length - 1; i >= 0; i--) {
            const sp = this.risingSparks[i];
            sp.y += sp.vy * (delta / 1000);
            sp.life -= (delta / 1000) * 1.5;

            if (sp.life <= 0) {
                this.risingSparks.splice(i, 1);
                continue;
            }

            g.fillStyle(sp.color, sp.life * 0.75);
            g.fillCircle(sp.x, sp.y, sp.size);
        }
    }

    setPosition(x, y) {
        if (this.container) {
            this.container.setPosition(x, y);
        }
    }

    setAlpha(alpha) {
        if (this.container) {
            this.container.setAlpha(alpha);
        }
    }

    destroy() {
        this.alive = false;
        if (this.container) {
            this.container.destroy();
            this.container = null;
        }
    }
}
