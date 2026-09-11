# 🤖 Guía para Agentes de IA (AGENTS.md)

Este documento es la referencia técnica rápida para cualquier agente o asistente de IA que trabaje en el repositorio **Elemental TD**. Consúltalo antes de implementar o modificar código.

---

## 🎯 1. Visión y Documentación de Tareas
* **Tipo de Juego**: Tower Defense pixel art retro desarrollado con **Phaser 3** y empaquetado con **Vite**.
* **Mecánicas Clave**:
  * **Economía Dual**: Oro (construcción básica y mejoras) y Maná (refinado por Templos o recogido por el Héroe).
  * **Héroe Controlable**: Se mueve por el mapa, combate, absorbe maná y conjura hechizos.
  * **Mazing & Barricadas**: Laberintos dinámicos calculados con pathfinding que nunca deben bloquear el paso total de los enemigos.
  * **Fusiones Elementales**: Combinación de torres adyacentes para crear híbridos (Tier 2) y legendarias (Tier 3).
  * **Jefes Periódicos**: Cada 5 oleadas con ataques telegrafiados y modo infinito tras la victoria.
* **Documento de Tareas**: Todo el backlog y progreso vive en [`user_stories_completo.md`](./user_stories_completo.md).
  * Antes de empezar una tarea, **lee la User Story correspondiente** para conocer sus Criterios de Aceptación (AC).
  * Al completarla, **actualiza su estado a `[✓]`** e indica los archivos tocados en `*Estado:* Implementado en ...`.

---

## 🗺️ 2. Mapa de Arquitectura y Responsabilidades

```
e:/Proyectos/Mini juego TD/
├── js/
│   ├── scenes/          # Escenas de Phaser (flujo principal)
│   ├── entities/        # Objetos del juego con sprite y comportamiento
│   ├── systems/         # Gestores de lógica desacoplada y estado
│   └── data/            # Tablas de datos, balance y Data URIs de sprites
├── index.html           # Canvas fijo (920×480) y controles de escala HTML
└── *.cjs                # Scripts de compilación de sprites Aseprite (.ase → PNG Base64)
```

### 🎬 Escenas (`js/scenes/`)
* **`GameScene.js`**: **Mundo y simulación.** Contiene el grid del terreno, spawnea oleadas, gestiona entidades (`enemies`, `towers`, `hero`) y bucle de combate.
* **`UIScene.js`**: **Interfaz gráfica overlay.** Corre en paralelo sobre `GameScene`. Maneja **exclusivamente** el HUD superior/inferior, barras de recursos, barra de vida de jefes, paneles modales (mejoras, codex, tutorial, pantalla de victoria/derrota) y avisos flotantes (`_flashNotification`).
* **`BootScene.js`**: Carga de texturas procedimentales o desde Data URIs, fuentes y generación de assets en memoria.
* **`TitleScene.js`**: Pantalla de título, selector de opciones y flujo de inicio de partida.
* **Comunicación entre Escenas**: Se realiza mediante el bus de eventos de Phaser:
  * `this.gs.events.emit('evento', datos)` desde `GameScene`.
  * `this.gs.events.on('evento', callback)` en `UIScene`.

### ⚙️ Sistemas (`js/systems/`)
* **`EconomySystem.js`**: Maneja el balance de oro, vidas del jugador, maná crudo y refinado.
* **`WaveManager.js`**: Definición y avance de oleadas (`currentWave`), composiciones procedurales para **Modo Infinito** y detección de jefes.
* **`GridSystem.js`**: Matriz del mapa, detección de caminos con A*, validación para que las barricadas no sellen la salida.
* **`TempleSystem.js`**: Lógica de templos, auras de recolección de maná y escalado de bonificaciones elementales.
* **`FusionSystem.js`**: Detección de adyacencia e interacción de arrastrar/soltar para fusionar torres compatibles.
* **`TelegraphSystem.js`**: Señalización visual en el suelo (líneas, conos, círculos) antes de que un jefe lance una habilidad.
* **`SaveSystem.js`**: Serialización y restauración de estado en `localStorage`.
* **`AudioSystem.js`**: Síntesis de sonido retro procedural y efectos con Web Audio API.
* **`OptionsModal.js`**: Modal de configuración (escala de resolución, volumen y controles).

### 👾 Entidades (`js/entities/`)
* **`Tower.js`**: Estructuras defensivas, detección de objetivos, rango visual, cadencia de disparo y niveles individuales con oro.
* **`Enemy.js`**: Enemigos estándar y jefes. Siguen waypoints de la ruta, evalúan agro hacia el héroe o templos, aplican resistencias/debilidades elementales y canalizan habilidades.
* **`Hero.js`**: Personaje jugable, control de movimiento, rango de absorción de maná e impacto físico.
* **`Projectile.js`**: Proyectiles balísticos, misiles teledirigidos y áreas de impacto.

### 📊 Datos y Balance (`js/data/`)
* **`TowerData.js`**: Stats base de torres puras e híbridas, costos, radios, colores y multiplicadores.
* **`EnemyData.js`**: Tipos de enemigos, velocidades, puntos de vida, afinidades y habilidades de jefes.
* **`WaveData.js`**: Lista secuencial de oleadas base.
* **`Elements.js`**: Reglas de efectividad (`SUPER_MULT = 1.5`, `RESIST_MULT = 0.5`).
* **`*Sprite.js`** (`CoinSprite.js`, `ManaSprite.js`, `BossSprites.js`): Contenedores generados automáticamente con Base64 de sprites compilados.

---

## ⚠️ 3. Reglas de Oro y Restricciones Técnicas

1. **Tipografía y Prohibición de Emojis en Canvas**:
   * La fuente del juego es **`"Press Start 2P"`**.
   * **NUNCA uses emojis Unicode modernos (`👑`, `🔥`, `💧`, `⚙️`, etc.) en strings renderizados con `fontFamily: FONT`**. No están soportados y se rompen en diamantes de reemplazo (`[??]` o `❖❖`).
   * Para iconos, utiliza siempre sprites dedicados (`this.add.image` o `safeTexture`).
2. **Separación Estricta UI vs Gameplay**:
   * **Nunca** pintes elementos de interfaz (botones, paneles fijos, contadores del HUD) en `GameScene`.
   * Todo lo interactivo y relativo a menús pertenece a `UIScene`.
3. **Pipeline de Assets Aseprite (`.ase`)**:
   * Los archivos fuente `.ase` y sprites residen en la carpeta `assets/` (ej. `assets/coin.ase`, `assets/mana.ase`, `assets/gear32.ase`, `assets/Sprite-0002.ase`).
   * Se compilan a Data URIs ejecutando sus scripts Node:
     ```bash
     node update_coin.cjs
     node update_mana.cjs
     node update_gear.cjs
     node update_bosses.cjs
     node update_sprite.cjs
     ```
   * Los scripts actualizan los archivos `js/data/*Sprite.js` que luego son cargados como texturas en `BootScene.js`.
4. **Resolución y Escalado**:
   * El canvas nativo de Phaser es exactamente de **920 × 480 px**.
   * El escalado a pantalla completa o nítido se gestiona en `DisplaySystem.js` sin alterar las coordenadas base internas.
