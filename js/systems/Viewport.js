/**
 * Supersampling, done by hand.
 *
 * `config.resolution` looks like the obvious way to do this and is a dead end:
 * Phaser removed it in 3.16 and there is nothing behind the name in 4.x. Setting
 * it does not error, does not warn, and does not do anything — the canvas keeps
 * its 920×480 backing store and every pixel gets stretched. So the buffer has to
 * be sized explicitly and the cameras zoomed to match.
 *
 * The canvas is `SUPER` times the world in each axis and each scene's camera is
 * zoomed by `SUPER`, so the world coordinate system never changes: everything in
 * the game still lives in 920×480, and only the buffer it lands in is larger.
 * That is also why pointer positions have to be read through the camera instead
 * of straight off the pointer — see `pointerWorld`.
 */

// The world every scene is laid out in: 640px of board plus a 280px sidebar.
export const VIEW_W = 920;
export const VIEW_H = 480;

/**
 * How many buffer pixels each game pixel gets. Fixed rather than derived from
 * the window.
 *
 * 4 puts the buffer at 3680×1920 — near 4K UHD, and finer than any size the
 * slider can ask for, so the final CSS step is always a downscale. Downward is
 * the direction supersampling works in: there is surplus detail to average away,
 * which is what turns a fractional resize into even antialiasing instead of a
 * pixel grid with two different pixel sizes in it.
 *
 * Holding it constant is what makes the rest simple. Nothing has to be rebuilt
 * when the player drags the slider, no camera is re-zoomed mid-game, and text
 * can be rasterised once at a resolution that is guaranteed to match the buffer.
 */
export const SUPER = 4;

/**
 * Points a scene's camera at the world through the supersampled buffer.
 *
 * Must be called from every scene's create(). GameScene builds a fresh camera
 * every time the game restarts, so this cannot be done once at boot.
 */
export function applyViewport(scene) {
    const cam = scene.cameras.main;
    if (!cam) return;
    cam.setZoom(SUPER);
    // With the camera sized to the buffer and zoomed by SUPER, the region it
    // shows is exactly VIEW_W × VIEW_H. Centring that on the world's midpoint
    // puts world (0,0) back in the top-left corner, where every hardcoded
    // coordinate in the game expects to find it.
    cam.centerOn(VIEW_W / 2, VIEW_H / 2);
}

// The board's share of the screen: the 920×480 world minus the 280px sidebar.
export const BOARD_W = 640;
export const BOARD_H = 480;

// Board zooms that keep a texel a whole number of buffer pixels (SUPER × k):
// 4, 3 or 2 buffer pixels — 32, 24 or 16 screen pixels a tile. Anything in
// between would put two pixel sizes in the same sprite.
const BOARD_ZOOMS = [1, 0.75, 0.5];

/** The largest crisp zoom at which a world of this size fits on the board. */
export function boardZoom(worldW, worldH) {
    return BOARD_ZOOMS.find(k => worldW * k <= BOARD_W && worldH * k <= BOARD_H)
        ?? BOARD_ZOOMS[BOARD_ZOOMS.length - 1];
}

/**
 * GameScene's camera for a level of `worldW × worldH`. A standard 640×480
 * board keeps the full-screen camera every scene uses. A larger one gets a
 * camera of its own over just the board area, zoomed out to the largest crisp
 * zoom that fits and centred in the space left over — so the world keeps its
 * own coordinates (a tile is still 32 world pixels; ranges and speeds do not
 * change) and only how big it looks on screen does.
 */
export function applyBoardViewport(scene, worldW, worldH) {
    if (worldW <= BOARD_W && worldH <= BOARD_H) {
        applyViewport(scene);
        return 1;
    }
    const cam = scene.cameras.main;
    const k = boardZoom(worldW, worldH);
    const vw = worldW * k, vh = worldH * k;
    const ox = Math.floor((BOARD_W - vw) / 2), oy = Math.floor((BOARD_H - vh) / 2);
    cam.setViewport(ox * SUPER, oy * SUPER, vw * SUPER, vh * SUPER);
    cam.setZoom(SUPER * k);
    cam.centerOn(worldW / 2, worldH / 2);
    return k;
}

/**
 * A point in `scene`'s world, in the 920×480 view the other scenes lay out
 * in. The same point on a standard board; on a zoomed-out one, where the board
 * camera actually draws it — which is what UI hung over the map has to follow.
 */
export function worldToView(scene, x, y) {
    // The camera's own transform (zoom about the viewport's centre), from its
    // scroll rather than `worldView`, which is only refreshed on render — and
    // UI scenes ask before the board's first frame.
    const cam = scene.cameras.main;
    const hw = cam.width / 2, hh = cam.height / 2;
    return {
        x: (cam.x + hw + (x - cam.scrollX - hw) * cam.zoom) / SUPER,
        y: (cam.y + hh + (y - cam.scrollY - hh) * cam.zoom) / SUPER,
    };
}

/**
 * Pointer position in world coordinates.
 *
 * `pointer.x` is in buffer space, which is `SUPER` times too large. Resolved
 * through the camera rather than by dividing, because the camera is the thing
 * that actually defines the mapping.
 */
export function pointerWorld(scene, pointer) {
    return scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
}
