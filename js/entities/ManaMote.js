import * as Phaser from 'phaser';

export class ManaMote {
    constructor(scene, x, y, value = 12) {
        this.scene = scene;
        this.value = value;
        this.alive = true;
        this.collecting = false;
        this.lifetime = 8000;
        this.elapsed = 0;

        this.sprite = scene.add.sprite(x, y, 'mana_mote');
        this.sprite.setScale(0.6);
        this.sprite.setDepth(8);

        // Scatter outward from spawn point
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 20;
        scene.tweens.add({
            targets: this.sprite,
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            duration: 400,
            ease: 'Quad.easeOut',
        });

        // Floating bob animation
        this.bobTween = scene.tweens.add({
            targets: this.sprite,
            y: '-=3',
            duration: 700 + Math.random() * 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: 400,
        });
    }

    update(_time, delta) {
        if (!this.alive || this.collecting) return;

        this.elapsed += delta;

        // Blink during last 2 seconds
        if (this.elapsed > this.lifetime - 2000) {
            this.sprite.alpha = 0.4 + Math.abs(Math.sin(this.elapsed * 0.008)) * 0.6;
        }

        if (this.elapsed >= this.lifetime) {
            this.destroy();
        }
    }

    /**
     * Begin suction toward whatever is harvesting this mote — in practice a
     * Temple, which decides how much life force it refines out of the raw
     * value before crediting it.
     */
    collectBy(collector) {
        if (!this.alive || this.collecting) return;
        this.collecting = true;

        if (this.bobTween) this.bobTween.stop();

        this.scene.tweens.add({
            targets: this.sprite,
            x: collector.x,
            y: collector.y,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 280,
            ease: 'Quad.easeIn',
            onComplete: () => {
                if (collector.absorbMote) collector.absorbMote(this.value);
                else this.scene.events.emit('mana-collected', this.value);
                this.destroy();
            },
        });
    }

    destroy() {
        this.alive = false;
        this.collecting = false;
        if (this.bobTween) {
            this.bobTween.stop();
            this.bobTween = null;
        }
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
