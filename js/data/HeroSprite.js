/**
 * PRUEBA DE CONCEPTO — un héroe dibujado a mano, en lugar del compuesto.
 *
 * Todo el arte del juego se genera en runtime (ver BootScene), y Vesper en
 * particular se hornea a partir de una receta de slots (ver HeroLook). Este
 * archivo es el experimento contrario: un sprite hecho en Aseprite, metido en
 * el mismo lugar, para ver cómo convive con el tablero generado.
 *
 * Es un interruptor, no una migración. Con `enabled: false` el juego vuelve
 * exactamente al Vesper compuesto sin tocar nada más — las texturas
 * procedurales se siguen horneando en el boot justamente para que la vuelta
 * atrás sea gratis, y para que un fallo de carga caiga en ellas en vez de
 * mostrar el cuadrado placeholder de Phaser.
 *
 * ── Qué NO trae ──────────────────────────────────────────
 * Conviene tenerlo presente al mirarlo en movimiento, porque no son bugs:
 *
 *  · UN SOLO FRAME. No hay ciclo de caminata ni frames de ataque, así que la
 *    figura vuelve a deslizarse. Para compensar, Hero le devuelve el rebote de
 *    caminata que el Vesper compuesto no necesita — ver `poses: false`.
 *  · DE FRENTE. El compuesto está dibujado de perfil mirando a la derecha
 *    justamente para decir hacia dónde va; este mira a cámara, así que el
 *    `flipX` casi no comunica dirección.
 *  · SIN FAROL. El farol es el indicador del combo, y este sprite no lo tiene.
 *    El halo se mantiene, centrado, leyéndose como aura en vez de como lámpara.
 *  · FUERA DE PALETA. Sus 9 colores no salen de las rampas de Palette.js, que
 *    es la regla que mantiene al tablero pareciendo dibujado por una sola mano.
 *    Es la diferencia más visible y la que más conviene mirar.
 *
 * ── Sobre el archivo ─────────────────────────────────────
 * Fuente: `Sprite-0002.ase`, 32×32 RGBA, capas `head`/`bidy`/`legs`/`arms`.
 * Se aplanaron sus capas visibles (las dos ocultas son un boceto anterior,
 * encapuchado) y el resultado se bajó 3px para que los pies queden en y=30,
 * que es donde los tiene el compuesto y donde Hero le pone la sombra.
 *
 * Va embebido como data URI y no como archivo suelto por dos razones: el juego
 * sigue sin depender de assets externos, y el `.ase` está en .gitignore — si el
 * sprite viviera sólo ahí, esto no sobreviviría a un clone.
 */

export const HERO_SPRITE = {
    /** El interruptor. `false` devuelve el Vesper compuesto de HeroLook. */
    enabled: true,

    key: 'hero_imported',

    /** Frames de animación propios. Este no tiene: Hero compensa con el rebote. */
    poses: false,

    /** 'front' o 'side'. Decide cuánto se le puede pedir al flipX. */
    facing: 'front',

    /** Dónde cuelga el farol respecto del centro. Sin farol: centrado, como aura. */
    lanternDx: 0,
    lanternDy: 2,

    png:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADq0lEQVR4Ae3BX0hddQDA8e/v7FqNpWdb5+yOw/AqOUxhI9hsG5YP' +
        '0kO7sQTfLl6kGYy8D2IQE5qRoznYKBAfJvUwQpRZUSiEW+RkCEI0JUxc24r8kx7aPQftNHJ3XOev+4NduFz8c67UQ7DPhyee+C/0' +
        '9U/Ivv4JiQ8BtiAaiUmy9Fy5JPr6JyQpc1OTvFbWiR+CHEUjMWmYForr2BimRZoVLEKJOwvUV33F/J8vsG/nbQ7W/iBYxzZ8ikZi' +
        '8uCBijbDtFBcx8YwLRTXsVlevs8j+YgHD/5GeU6XKF3tp+j95Le2rs8XzrIGDR+ikZg0TAvDtNjMymqSjzpaBCm9H9eiXHj/PQYv' +
        '10vWoLGJaCQmDdMim2FauI6N69hkch2b5qZzMtzQLVo+PE/avp23WYtgA9FITJJimBZrcR0bxTAtXMdG2RsMsbKaROnobBWDl+sl' +
        'KeGGbsEaAmxibzDEymoS17ExTItshmnhOjZpf9ybRTFMCyXc0C3YQIAtsIJF2PdmMEwL17HJ5Hkeiud5+KGxiZXVJJmsYBGKFSwi' +
        'm+d55CqAD65jY5gWRwtnGJvPQ/nl7k9EqrdDIXwz/hRbpeGDYVocLZyh6tB+vh36gvNv7uDL88eoffVF2j/7kYunQmyVhk9Vh/Zj' +
        '7NrBv01jE65jk2m85ySZxntOonieR6bnS8rwQ2MDPVcuCXw4/eksiq7r6LqOruv4JfChuemcnP71Z/J1ncst5WRquHCLTIZp0dHZ' +
        'KvBJ4FNz0zl5684se3bnkXbf88jXdZT4YpLy0hAdna2CHGj4cLG9R1rBIrLl6zpp5aUhrGARF9t7JDkQbKKqulHueuYvlOKSMm7d' +
        'mUXZszuPtPhiku3blklbShQwMtwl8EFjA1XVjZKUpUQBS4kCOjpbRXlpCCW+mCS+mCS+mOSt+ijFJWUsJQpYShSgVFU3SnzYxjr6' +
        '+idkxZHDBJ99mrvTvzMy3CVIeafpg7aHCY83Xj/Bw4SHaexkfmGOjs5WMTs9djZUXNEWa3qbiiOHeenAy23fDX99lg1orGNuapK5' +
        'qUmUkeEuQUpf/4S8efN70o4deYWj1ScIaHm823xBkjIy3CXmpiaZm5rEjwDrGBq6TraxG9dQAloeaWM3rpFtaOg6fglyVBOukzw2' +
        'MNgrSKkJ10keGxjsFeQgQI4qK4+TNjDYi1JZeZy0gcFecqGRo9NnooKUuLNA2ukzUUFK3FkgVwFyVBOuk6OjV8lUE66To6NX+V/6' +
        'B8arTQCv3R6dAAAAAElFTkSuQmCC',
};
