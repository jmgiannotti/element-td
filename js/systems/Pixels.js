/**
 * The pixel-art toolkit every generated texture in the game is built from.
 *
 * Lives on its own so that anything which draws — BootScene's terrain and
 * buildings, HeroLook's composable hero — assembles its sprites out of exactly
 * the same primitives. A shared toolkit is most of what "one art direction"
 * means in practice: shapes come from the same generators, shading obeys the
 * same light, and outlines are made the same way.
 *
 * Conventions, held everywhere:
 *  · A *ramp* is five stops, dark to light. Sprites are assembled out of ramp
 *    stops, never out of a colour invented for one sprite.
 *  · A *shape* is { y0, spans }: one [x0, x1] pair per row, null for a gap.
 *    Silhouettes described as spans can share one shading routine.
 *  · The light is always top-left.
 */

export const NEIGHBOURS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
];

/** Small deterministic PRNG so textures look the same every run. */
export function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function pick(rnd, arr) {
    return arr[Math.floor(rnd() * arr.length) % arr.length];
}

// ─── Shape toolkit ──────────────────────────────────────
// A shape is { y0, spans }, one [x0, x1] pair per row (or null for an empty
// row). Building silhouettes out of spans rather than out of literal fillRect
// calls is what lets every rounded form in the game share one shading routine.

/** Even-width ellipse centred between cx-1 and cx. */
export function ellipse(cx, cy, rx, ry) {
    const spans = [];
    for (let y = -ry; y <= ry; y++) {
        const t = 1 - (y * y) / ((ry + 0.45) * (ry + 0.45));
        const w = Math.round(rx * Math.sqrt(Math.max(0, t)));
        spans.push(w <= 0 ? null : [cx - w, cx + w - 1]);
    }
    return { y0: cy - ry, spans };
}

/** Straight-sided body: half-width w0 at y0 growing to w1 at y1. */
export function taper(y0, y1, w0, w1, cx = 16, curve = 1) {
    const spans = [];
    const n = Math.max(1, y1 - y0);
    for (let i = 0; i <= n; i++) {
        const w = Math.round(w0 + (w1 - w0) * Math.pow(i / n, curve));
        spans.push(w <= 0 ? null : [cx - w, cx + w - 1]);
    }
    return { y0, spans };
}

/** Pointed at the top, round at the bottom — water drops, flames, orbs of force. */
export function teardrop(cx, top, bot, rx) {
    const spans = [];
    const n = Math.max(1, bot - top);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        let w;
        if (t < 0.6) w = rx * Math.pow(t / 0.6, 0.62);
        else {
            const s = (t - 0.6) / 0.4;
            w = rx * Math.sqrt(Math.max(0, 1 - s * s * 0.94));
        }
        const ww = Math.round(w);
        spans.push(ww <= 0 ? null : [cx - ww, cx + ww - 1]);
    }
    return { y0: top, spans };
}

/** Literal spans, for the handful of shapes no generator describes. */
export function profile(y0, spans) {
    return { y0, spans };
}

/** Nibbles the silhouette so a rock never comes out as a smooth solid. */
export function rough(shape, seed, amt = 1) {
    const rnd = makeRng(seed);
    return {
        y0: shape.y0,
        spans: shape.spans.map((s) => {
            if (!s) return null;
            const x0 = s[0] + Math.round((rnd() * 2 - 1) * amt);
            const x1 = s[1] + Math.round((rnd() * 2 - 1) * amt);
            return x1 >= x0 ? [x0, x1] : null;
        }),
    };
}

/**
 * Paints a shape: a sealed one-pixel silhouette in the ramp's darkest stop,
 * then a body shaded radially away from the light — specular chip, lit face,
 * body, shaded far side. Every rounded thing in the game is this routine with
 * a different profile, which is precisely what keeps them a family.
 */
export function volume(g, shape, r, opts = {}) {
    const {
        outline = true, lu = 0.33, lv = 0.26, spec = 0.16, band = 0.26,
        flat = false, alpha = 1,
    } = opts;
    const { y0, spans } = shape;

    if (outline) {
        const filled = new Set();
        for (let i = 0; i < spans.length; i++) {
            if (!spans[i]) continue;
            for (let x = spans[i][0]; x <= spans[i][1]; x++) filled.add(`${x},${y0 + i}`);
        }
        g.fillStyle(r.deep, alpha);
        for (const key of filled) {
            const [x, y] = key.split(',').map(Number);
            for (const [dx, dy] of NEIGHBOURS) {
                if (!filled.has(`${x + dx},${y + dy}`)) g.fillRect(x + dx, y + dy, 1, 1);
            }
        }
    }

    const n = spans.length;
    for (let i = 0; i < n; i++) {
        const s = spans[i];
        if (!s) continue;
        const y = y0 + i;
        const w = s[1] - s[0];
        const v = n > 1 ? i / (n - 1) : 0.5;
        for (let x = s[0]; x <= s[1]; x++) {
            const u = w > 0 ? (x - s[0]) / w : 0.5;
            const d = Math.hypot(u - lu, v - lv);
            const c = flat ? r.mid
                : d < spec ? r.glow
                    : d < spec + band ? r.light
                        : d < spec + band * 2 ? r.mid
                            : r.dark;
            g.fillStyle(c, alpha);
            g.fillRect(x, y, 1, 1);
        }
    }
}

/**
 * Fills a run-length character map. Rows are strings, `legend` maps a character
 * to a colour or [colour, alpha]; anything unmapped — '.' by convention — stays
 * transparent. Used for the shapes that are drawn rather than generated.
 */
export function blit(g, rows, legend, ox = 0, oy = 0) {
    for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            const paint = legend[ch];
            if (paint === undefined) { x++; continue; }
            let run = 1;
            while (x + run < row.length && row[x + run] === ch) run++;
            const [col, alpha] = Array.isArray(paint) ? paint : [paint, 1];
            g.fillStyle(col, alpha);
            g.fillRect(ox + x, oy + y, run, 1);
            x += run;
        }
    }
}

/** One-pixel line, for bones and bolts — the two things spans cannot describe. */
export function line(g, x0, y0, x1, y1, color, alpha = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.fillStyle(color, alpha);
    for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
    }
}

/** Soft elliptical contact shadow. Every free-standing thing gets one. */
export function groundShadow(g, cx, cy, rx, ry, a = 0.24) {
    for (let y = -ry; y <= ry; y++) {
        const t = 1 - (y * y) / ((ry + 0.4) * (ry + 0.4));
        const w = Math.round(rx * Math.sqrt(Math.max(0, t)));
        if (w <= 0) continue;
        g.fillStyle(0x000000, a * (1 - Math.abs(y) / (ry + 1.2)));
        g.fillRect(cx - w, cy + y, w * 2, 1);
    }
}

/**
 * Plots a pixel addressed by (i = position along an edge, k = depth inward)
 * so one routine can draw the same motif on all four sides of a tile.
 */
export function edgePixel(g, side, i, k, color, alpha = 1) {
    if (i < 0 || i > 31 || k < 0 || k > 31) return;
    g.fillStyle(color, alpha);
    if (side === 'top') g.fillRect(i, k, 1, 1);
    else if (side === 'bottom') g.fillRect(i, 31 - k, 1, 1);
    else if (side === 'left') g.fillRect(k, i, 1, 1);
    else g.fillRect(31 - k, i, 1, 1);
}


/** deep = outline / core shadow · dark = shaded face · mid = body · light = lit face · glow = specular. */
export const ramp = (deep, dark, mid, light, glow) => ({ deep, dark, mid, light, glow });
