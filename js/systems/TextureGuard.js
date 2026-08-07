/**
 * Guards against Phaser's `__MISSING` placeholder — the black square with a
 * green diagonal — ever reaching the screen.
 *
 * Phaser returns that placeholder silently whenever a texture key is not in
 * the Texture Manager, which turns a one-line typo (or a `generateTexture`
 * call that failed to register) into a mystery visual bug. Routing every
 * runtime texture lookup through here swaps in a sane fallback and names the
 * offending key in the console instead.
 */

const reported = new Set();

export function safeTexture(scene, key, fallback) {
    if (scene.textures.exists(key)) return key;

    if (!reported.has(key)) {
        reported.add(key);
        console.error(
            `[TextureGuard] Falta la textura "${key}". ` +
            `Se usa "${fallback}" en su lugar. ` +
            `Revisá BootScene: la textura no se generó o el nombre no coincide.`
        );
    }
    return scene.textures.exists(fallback) ? fallback : '__DEFAULT';
}
