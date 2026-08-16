/**
 * VESPER, DIBUJADO A MANO — el arte que el juego usa para el héroe.
 *
 * Todo lo demás en pantalla se genera en runtime (ver BootScene), y el héroe
 * también se puede componer por slots (ver HeroLook). Pero para el personaje
 * gana el dibujo: una figura de 32px hecha a mano se lee más limpia que la
 * misma figura ensamblada por código, y el héroe es lo que el jugador mira todo
 * el tiempo. Lo procedural queda como red de seguridad y como pista de dónde
 * puede volver a entrar más adelante.
 *
 * ── Qué trae este sprite ─────────────────────────────────
 *  · CUATRO CUADROS de caminata, en una tira horizontal de 128×32. Phaser la
 *    carga como spritesheet y la anima; el ciclo es una animación de verdad, no
 *    un intercambio de texturas. El cuadro 0 dobla como pose quieta.
 *  · FAROL COLGANDO del casco, del lado de adelante. Es el indicador del combo:
 *    el halo de `HERO_GLOW_KEY` se le monta encima y crece con la racha, así que
 *    `lanternDx`/`lanternDy` tienen que apuntarle a la lámpara.
 *  · DAGA en la mano de atrás, apuntando arriba.
 *
 * ── Qué sigue faltando ───────────────────────────────────
 * No son bugs; es lo que este archivo todavía no puede dar, y es exactamente la
 * lista de lo que valdría la pena dibujar o volver a resolver por código:
 *
 *  · SIN CUADROS DE ATAQUE. El swing se lee por el tajo (`HERO_SLASH_KEY`) y la
 *    estocada que Hero le tweenea encima, no por el sprite.
 *  · SIN CUADROS PROPIOS PARA CADA LADO. Mira a la izquierda y el juego espeja
 *    el sprite para ir a la derecha, así que a la derecha el farol y la daga
 *    cambian de mano. Es lo normal en pixel art y se nota poco; lo que importa
 *    es que `facing` diga la verdad, porque de ahí sale el espejado.
 *  · SIN SLOTS. Manto, corona, espada y farol son cuatro tablas que se
 *    multiplican por cinco poses en HeroLook; una tira es una combinación sola.
 *    Un accesorio nuevo acá es un cuadro nuevo dibujado a mano.
 *
 * ── Sobre el archivo ─────────────────────────────────────
 * Fuente: `Sprite-0002.ase`, 32×32 RGBA, 4 frames a 100ms. Capas visibles
 * `head`, `bidy`, `legs`, `arms`, `swk` y `Layer 3`; hay otras ocultas que son
 * bocetos previos, y el exportador respeta tanto el ojo de la capa como el del
 * grupo que la contiene. `node update_sprite.cjs` rehace la tira de abajo: aplana
 * las capas visibles de cada cuadro, resuelve las celdas linkeadas, y baja el
 * conjunto lo necesario para que los pies apoyen en y=30 —donde Hero le pone la
 * sombra— conservando el rebote que el dibujo tiene entre cuadros.
 *
 * Va embebido como data URI y no se carga como archivo suelto para que el juego
 * siga sin depender de assets externos: es la misma regla que hace que todo lo
 * demás se dibuje en el boot. El `.ase` está versionado al lado, así que la
 * fuente sobrevive a un clone y el sprite se puede regenerar.
 */

export const HERO_SPRITE = {
    /**
     * El interruptor. `false` devuelve el Vesper compuesto de HeroLook, con sus
     * poses y sus slots, sin tocar nada más — las texturas procedurales se
     * siguen horneando en el boot justamente para que la vuelta atrás sea
     * gratis, y para que un fallo de carga caiga en ellas en vez de mostrar el
     * cuadrado placeholder de Phaser.
     */
    enabled: true,

    key: 'hero_imported',

    /**
     * El arte trae sus propios cuadros. Con esto Hero deja de agregarle el
     * rebote de relleno que usa para el arte de un solo cuadro: el dibujo ya
     * sube y baja solo entre frames, y dos rebotes sobre un mismo cuerpo se
     * pelean.
     */
    poses: true,

    // ── La tira ─────────────────────────────
    // Los dos los reescribe update_sprite.cjs leyéndolos del .ase.
    frameCount: 4,
    frameMs: 100,

    /** Cuadro quieto, y el ciclo de caminata en el orden en que se reproduce. */
    idleFrame: 0,
    walkFrames: [0, 1, 2, 3],
    /** Nombre de la animación que crea BootScene. */
    walkAnim: 'hero_walk',

    /**
     * Hacia dónde está dibujada la figura: `'left'` o `'right'`.
     *
     * Es de lo que depende el espejado. Hero pide "quiero ir para allá" y
     * `heroFlipX` decide si hay que espejar comparando contra esto; si el valor
     * miente, el héroe camina de espaldas justo en la mitad de los casos. El
     * Vesper compuesto de HeroLook está dibujado mirando a la derecha; este mira
     * a la izquierda: la cara cae del lado izquierdo del casco, la cresta con el
     * farol va hacia atrás, y la daga queda en la mano de adelante.
     */
    facing: 'left',

    /**
     * Dónde cuelga el farol respecto del centro del sprite. Del lado de adelante
     * y arriba, colgando del casco. Se espeja con el `flipX` porque la lámpara
     * está de un lado: si no, el halo se le enciende en la nuca.
     */
    lanternDx: 10,
    lanternDy: -5,

    png:
        'data:image/png;base64,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',
};
