import * as Phaser from 'phaser';
import { WAYPOINTS, TILE_SIZE } from './GridSystem.js';

// Above the terrain and the build grid so the line is never buried by a
// boulder, but well under the buildings and the placement cursor.
const D_ROUTE = 0.7;

// Short marks with wide gaps: a dotted line rather than a dashed one. The
// airiness of the dotting is what makes the line read as faint — the marks
// themselves have to stay fairly opaque or they dissolve into the road.
const DOT = 3;
const GAP = 9;
const PERIOD = DOT + GAP;

// Marching ants, crawling toward the exit. Slow enough to read as drift rather
// than as blinking: the dots cover one full period roughly once a second.
const SPEED = 12; // px/s

/**
 * The line on the ground showing where enemies will walk.
 *
 * Shown while something is on the build cursor, and between rounds whether or
 * not you are building — those are the two moments the route is a thing you act
 * on. During a wave it goes away: the enemies walking it are the better answer
 * to where the route goes.
 *
 * Hovering a legal cell with a barricade also draws the detour that barricade
 * would carve, so a maze can be judged before it is paid for rather than after.
 */
export class RouteView {
    constructor(scene) {
        this.scene = scene;
        this.gfx = scene.add.graphics().setDepth(D_ROUTE).setVisible(false);
        this.previewGfx = scene.add.graphics().setDepth(D_ROUTE + 0.01).setVisible(false);

        this.route = null;
        this.routeTrail = null;
        this.preview = null;
        this.previewTrail = null;
        this.phase = 0;

        this.refresh();
    }

    /** Recompute the canonical spawn → exit route. */
    refresh() {
        const from = WAYPOINTS[0];
        const to = WAYPOINTS[WAYPOINTS.length - 1];
        this.route = this.scene.gridSystem.findPath(from.col, from.row, to.col, to.row);
        this.routeTrail = this._trail(this.route);
        this._draw();
    }

    setActive(on) {
        if (this.gfx.visible === on) return;
        this.gfx.setVisible(on);
        this.previewGfx.setVisible(on);
    }

    get active() {
        return this.gfx.visible;
    }

    showPreview(route) {
        // The hover hands back the same cached array while the cursor stays in
        // one cell, so identity is enough to skip rebuilding the trail.
        if (this.preview === route) return;
        this.preview = route;
        this.previewTrail = this._trail(route);
        this._draw();
    }

    hidePreview() {
        if (!this.preview) return;
        this.preview = null;
        this.previewTrail = null;
        this._draw();
    }

    /**
     * Driven by the raw clock rather than the scene's, so the crawl keeps its
     * pace when the player switches the game to double speed — it is chrome,
     * not a simulated thing.
     */
    update(time) {
        if (!this.gfx.visible) return;

        const phase = (time / 1000) * SPEED;
        if (Math.abs(phase - this.phase) < 0.5) return; // nothing would move
        this.phase = phase;
        this._draw();
    }

    _draw() {
        this.gfx.clear();
        this.previewGfx.clear();

        // While a detour is on offer the current route steps right back, so the
        // two are never bright at once and the standing route is free to be as
        // legible as it needs to be the rest of the time.
        this._stroke(this.gfx, this.routeTrail, this.preview ? 0.14 : 0.8);
        this._stroke(this.previewGfx, this.previewTrail, 0.95);
    }

    /**
     * Walks the route emitting one dot per period, straight into the graphics.
     * Nothing is allocated here — this runs every frame, and a few hundred
     * throwaway arrays per frame is exactly the kind of churn that turns a
     * decoration into a frame-rate problem.
     */
    _stroke(gfx, trail, alpha) {
        if (!trail || alpha <= 0) return;

        for (let pass = 0; pass < 2; pass++) {
            // Dark pass underneath first: gold on tan dirt is close enough in
            // value that the dots need their own edge to sit on.
            if (pass === 0) gfx.lineStyle(3, 0x000000, alpha * 0.6);
            else gfx.lineStyle(2, 0xFFD54F, alpha);

            const verts = trail;

            // Where in the dot/gap cycle the route starts. Subtracting the
            // phase is what sends the dots forward, toward the exit.
            let cycle = ((-this.phase % PERIOD) + PERIOD) % PERIOD;
            let on = cycle < DOT;
            let used = on ? cycle : cycle - DOT;

            for (let i = 0; i < verts.length - 1; i++) {
                const a = verts[i];
                const b = verts[i + 1];
                const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
                if (len < 0.001) continue;

                let t = 0;
                while (t < len - 0.001) {
                    const take = Math.min((on ? DOT : GAP) - used, len - t);
                    if (on) {
                        gfx.lineBetween(
                            a.x + ((b.x - a.x) * t) / len,
                            a.y + ((b.y - a.y) * t) / len,
                            a.x + ((b.x - a.x) * (t + take)) / len,
                            a.y + ((b.y - a.y) * (t + take)) / len,
                        );
                    }
                    t += take;
                    used += take;
                    if (used >= (on ? DOT : GAP) - 0.001) {
                        on = !on;
                        used = 0;
                    }
                }
            }
        }
    }

    /**
     * Cell path → the polyline the dots march along. Cheap, but it only has to
     * happen when the route itself changes rather than once a frame.
     */
    _trail(cells) {
        if (!cells || cells.length < 2) return null;
        return cells.map(c => ({
            x: c.col * TILE_SIZE + TILE_SIZE / 2,
            y: c.row * TILE_SIZE + TILE_SIZE / 2,
        }));
    }
}
