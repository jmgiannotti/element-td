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
