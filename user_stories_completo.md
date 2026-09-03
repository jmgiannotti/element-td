# 📝 Épicas y User Stories - Nuevas Mecánicas TD (Actualizado)

A continuación se detallan las historias de usuario (*User Stories*) para las mecánicas y sistemas del juego. Están agrupadas por **Épicas** para facilitar su seguimiento y gestión de desarrollo.

Cada historia sigue el formato estándar: **Como [rol], quiero [acción] para [beneficio/valor]**, acompañada de sus **Criterios de Aceptación (AC)** y su estado de implementación actual.

---

## 🚨 Epic 0: Core UX, Controles y Feedback Básico

### US 0.1: Visualización de Ruta y Prevención de Bloqueo Absoluto [✓]
**Como** jugador estratégico,  
**Quiero** ver una línea tenue en el suelo indicando la ruta que tomarán los enemigos y que el sistema me impida colocar una barricada si esta corta completamente el camino,  
**Para** poder hacer *mazing* (laberintos) sin romper el juego ni atascar a los enemigos.

> **Criterios de Aceptación:**
> - El pathfinding recalcula la ruta al arrastrar/seleccionar una barricada y muestra una línea visual del nuevo camino.
> - Si colocar la barricada hace que el pathfinding hacia el final no encuentre ruta (`null`), no se permite la construcción (suena alerta de error).
> 
> *Estado:* **Implementado** en `GameScene._barricadeOutcome()` y `RouteView.js`.

### US 0.2: Tutorialización Interactiva (Economía Dual) [✓]
**Como** jugador nuevo,  
**Quiero** un tutorial integrado en la primera oleada que me obligue a recoger mi primer orbe de maná con el héroe y luego me enseñe a colocar un Templo,  
**Para** entender prácticamente la diferencia entre la recolección manual y el refinado pasivo del templo.

> **Criterios de Aceptación:**
> - Al caer el primer orbe de maná, el juego destaca el orbe y pide mover al héroe.
> - Luego, guía visualmente (resaltando botones) a comprar y colocar el primer Templo.
> - Se previene spam o solapamiento de mensajes guía durante eventos simultáneos.
> 
> *Estado:* **Implementado** en `TutorialSystem.js` con los pasos `COLLECT`, `TEMPLE`, `DONE`.

### US 0.3: Feedback Visual de Rango y Daño [✓]
**Como** jugador,  
**Quiero** ver el rango exacto de mis torres/templos al seleccionarlos, el nivel de la torre/templo e info que tiene, en caso de combinación cuáles serían los nuevos stats y ver el daño numérico flotante cuando impactan a un enemigo,  
**Para** medir la efectividad de mis defensas y sentir el impacto real al comprar una mejora global.

> **Criterios de Aceptación:**
> - Al hacer clic o pasar el mouse sobre una estructura, se dibuja su rango en el grid.
> - Textos numéricos de daño flotante sobre los enemigos al recibir un proyectil con color acorde al elemento.
> 
> *Estado:* **Implementado** en `Tower.setSelected()` y `FloatingText.damage()`.

### US 0.4: Cancelación Universal con Clic Derecho [✓]
**Como** jugador,  
**Quiero** poder cancelar cualquier acción en curso (colocar torres, templos, barricadas o armar un hechizo) haciendo clic derecho en cualquier momento,  
**Para** no cometer errores de construcción involuntarios y tener control total sobre el cursor.

> **Criterios de Aceptación:**
> - Hacer clic derecho durante el modo de colocación de torres, templos o barricadas deselecciona la estructura y oculta el grid/rango.
> - Hacer clic derecho con un hechizo seleccionado (ej. Luna / R) desarma el hechizo sin gastar maná ni dispararlo.
> 
> *Estado:* **Implementado** en `GameScene._cancelPlacement()` y `GameScene._handleClick()`.

### US 0.5: Líneas en Suelo para Conexión de Fusiones [✓]
**Como** jugador táctico,  
**Quiero** ver una línea en el suelo que una las torres compatibles para fusionar en lugar de un resplandor genérico,  
**Para** identificar de un vistazo claro qué pares de torres puedo combinar sin saturar la pantalla de efectos.

> **Criterios de Aceptación:**
> - Las torres adyacentes fusionables se conectan visualmente con una línea de energía en el suelo.
> - La primera vez que se colocan dos estructuras compatibles adyacentes, aparece un mensaje explicativo indicando que se pueden arrastrar una sobre otra para fusionarse.
> - Al arrastrar o inspeccionar, la UI ofrece una vista previa de la torre resultante.
> 
> *Estado:* **Implementado** en `FusionSystem.js` y `UIScene.js`.

### US 0.6: Registro de Rendimiento y Daño por Estructura [✓]
**Como** jugador analítico,  
**Quiero** ver el daño total infligido y los enemigos eliminados (*kills*) por cada torre al seleccionarla y en la pantalla de fin de partida,  
**Para** identificar qué fusiones y posiciones fueron las más eficientes y optimizar mis partidas futuras.

> **Criterios de Aceptación:**
> - Cada instancia de `Tower` acumula `totalDamageDealt` y `enemiesKilled`.
> - La tarjeta de inspección de la torre muestra estos números en tiempo real.
> - La pantalla de Victoria/Derrota destaca la "Torre MVP" de la partida.
> 
> *Estado:* **Implementado** en `Tower.js`, `Projectile.js`, `Enemy.js`, `FusionSystem.js`, `GameScene.js` y `UIScene.js`.

---

## 🗡️ Epic 1: Refactorización y Profundidad del Héroe

### US 1.1: Habilidades Activas del Héroe [✓]
**Como** jugador,  
**Quiero** poder activar habilidades especiales del héroe (como un 'Dash' o un 'Ataque en Área') usando atajos de teclado o botones en la interfaz,  
**Para** tener un rol más activo en el combate y poder reaccionar a situaciones de emergencia.

> **Criterios de Aceptación:**
> - El héroe tiene habilidades activas programadas (Dash, Quake).
> - La habilidad tiene un tiempo de recarga (Cooldown) visible en la UI.
> - La habilidad interrumpe el auto-ataque normal durante su ejecución.
> 
> *Estado:* **Implementado** en `Hero.useAbility()` y `UIScene._refreshHeroHud()`.

### US 1.2: Sistema de Combos de Recolección de Maná [✓]
**Como** jugador arriesgado,  
**Quiero** recibir un multiplicador de bonificación al recolectar múltiples orbes de maná con el héroe en una ventana de tiempo corta,  
**Para** sentir que se me recompensa por exponerme al peligro en lugar de depender solo de los Templos.

> **Criterios de Aceptación:**
> - Si el héroe recoge N orbes en menos de X segundos, el valor del maná otorgado por orbe aumenta.
> - Aparece un texto flotante visual (VFX) indicando el "Combo" y el maná extra obtenido.
> - El multiplicador se reinicia si pasa el tiempo estipulado sin recolectar otro orbe.
> 
> *Estado:* **Implementado** en `Hero.absorbMote()` y `HeroData.js`.

---

## 🔮 Epic 2: Sistema de Elementos y Resistencias (Piedra-Papel-Tijera)

### US 2.1: Asignación de Elementos y Resistencias a Enemigos [✓]
**Como** jugador estratega,  
**Quiero** que los enemigos pertenezcan a diferentes clases elementales que interactúen con los elementos de mis torres,  
**Para** que la decisión de qué torres fusionar tenga un impacto táctico en cada oleada.

> **Criterios de Aceptación:**
> - Se añaden propiedades de debilidad y resistencia elemental en `EnemyData.js`.
> - El cálculo de daño multiplica si la torre ataca la debilidad del enemigo (ej. 150%) y lo reduce si ataca su resistencia (ej. 50%).
> - Indicadores visuales al golpear (texto de daño o colores) muestran si el golpe fue "Súper efectivo" o "Resistido".
> 
> *Estado:* **Implementado** en `effectOf()` en `Elements.js` y `FloatingText.damage()`.

### US 2.2: Previsualización de la Siguiente Oleada [✓]
**Como** jugador planificador,  
**Quiero** poder ver qué tipos de enemigos (y sus elementos) compondrán la próxima oleada antes de que empiece,  
**Para** tener tiempo de fusionar y preparar las defensas adecuadas.

> **Criterios de Aceptación:**
> - La UI muestra iconos y cantidad de los próximos enemigos al lado del botón de "Siguiente Oleada".
> - Al pasar el cursor sobre los iconos se despliega información de sus stats y debilidades.
> 
> *Estado:* **Implementado** en `UIScene._refreshWavePreview()`.

### US 2.3: Indicadores No Dependientes Solo del Color (Accesibilidad) [✓]
**Como** jugador con dificultad para distinguir colores,  
**Quiero** que las debilidades y resistencias elementales se indiquen también con íconos, no solo con color,  
**Para** poder jugar el sistema elemental sin depender de percibir diferencias de color.

> **Criterios de Aceptación:**
> - Cada elemento tiene un símbolo distintivo además de su color.
> - Los textos de efectividad se acompañan de símbolos (▲/▼) además del color.
> 
> *Estado:* **Implementado** en `Elements.js` (`EFFECT_MARK`).

---

## ⚡ Epic 3: Hechizos Globales (Sumidero de Maná)

### US 3.1: Casteo de Hechizos con Maná y Apuntado Libre [✓]
**Como** jugador,  
**Quiero** poder gastar el Maná acumulado en hechizos activos globales seleccionando dónde tirarlos en el mapa o mediante atajos de teclado,  
**Para** tener un recurso de último momento para salvar mis vidas cuando las defensas son sobrepasadas.

> **Criterios de Aceptación:**
> - Panel de Hechizos en la UI (inferior izquierda) con coste, icono y atajo ('R').
> - Al hacer clic en el botón o presionar el atajo, el cursor entra en modo apuntado con radio visible.
> - El hechizo se dispara exactamente donde se hace clic en el mapa (no obligado sobre el héroe).
> - Se cancela limpiamente con clic derecho.
> - El clic en el botón de la UI no dispara el hechizo debajo del botón por error.
> 
> *Estado:* **Implementado** en `SpellSystem.js`, `UIScene._buildSpellHud()` y `GameScene._handleClick()`.

### US 3.2: Más Variedad de Hechizos
**Como** jugador,  
**Quiero** tener al menos 3 hechizos diferentes (daño en área, control de masas, utilidad/curación) para elegir,  
**Para** que la decisión de gastar maná sea estratégica y dependa de la situación de la partida.

> **Criterios de Aceptación:**
> - Se añaden al menos 2 hechizos adicionales (ej. curación de héroe / escudo a templos, congelación masiva).
> - Cada hechizo tiene un coste, cooldown y efecto visual distintivo.
> - La barra de hechizos en la UI se expande para soportar múltiples ranuras.
> 
> *Estado:* **Pendiente**.

---

## 🎯 Epic 4: IA Avanzada de Enemigos y Agro

### US 4.1: Enemigos tipo "Cazadores" (Target: Héroe) y Retorno [✓]
**Como** diseñador de niveles,  
**Quiero** que ciertos enemigos prioricen atacar al Héroe si se acerca, pero que regresen a su ruta a mayor velocidad si el héroe se aleja demasiado (leash),  
**Para** forzar al jugador a micro-gestionar al héroe sin romper el flujo de avance de los enemigos.

> **Criterios de Aceptación:**
> - El enemigo persigue al héroe cuando entra en su radio de visión/agro.
> - Si el héroe se aleja más allá de la distancia límite (*leash*) o se refugia en un templo, el enemigo abandona la persecución y regresa a la carretera con velocidad aumentada (ej. 2.5x).
> 
> *Estado:* **Implementado** en `Enemy._thinkAgro()`, `Enemy._chase()` y `EnemyData.js` (Velador).

### US 4.2: Enemigos tipo "Saboteadores" (Target: Templos) [✓]
**Como** diseñador de niveles,  
**Quiero** enemigos que apunten y deshabiliten temporalmente estructuras clave como los Templos,  
**Para** que el jugador deba priorizar eliminar ciertas amenazas rápidamente para proteger su economía.

> **Criterios de Aceptación:**
> - El enemigo se desvía de la ruta para caminar hacia el templo más cercano.
> - Al llegar al templo, aplica un debuff que detiene la absorción de maná por X segundos y luego retoma su ruta.
> 
> *Estado:* **Implementado** en `Enemy._chase()` (Sillar) y `Temple.sabotage()`.

---

## 🚨 Epic 5: Persistencia, Menús y Flujo de Partida

### US 5.1: Guardado Automático y Sistema de Checkpoints [✓]
**Como** jugador,  
**Quiero** que mi partida se guarde automáticamente y que al recargar en medio de una oleada se restaure el estado limpio del inicio de la misma,  
**Para** no perder mi progreso ni poder duplicar recursos cerrando y abriendo el juego a mitad de oleada.

> **Criterios de Aceptación:**
> - Se crea una instantánea (*snapshot*) al inicio de cada oleada (oro, maná, vidas, salud y posición del héroe, torres, templos y barricadas construidas).
> - Guardar y salir en medio de una oleada restaura el checkpoint del inicio de dicha oleada sin duplicar oro ganado durante el combate.
> - Al completar una oleada se genera un autoguardado persistente en `localStorage`.
> 
> *Estado:* **Implementado** en `SaveSystem.js` y `GameScene.js`.

### US 5.2: Pantalla de Fin de Partida (Victoria y Derrota) [✓]
**Como** jugador,  
**Quiero** ver una pantalla de resumen al perder todas mis vidas o al completar la última oleada,  
**Para** entender mis estadísticas finales y tener opciones claras de reinicio.

> **Criterios de Aceptación:**
> - Pantalla de Derrota al llegar a 0 vidas con botón de "Reintentar".
> - Pantalla de Victoria al completar la oleada 20 con felicitaciones y resumen.
> - Borra los datos de guardado para permitir una nueva partida limpia.
> 
> *Estado:* **Implementado** en `UIScene._showEndScreen()`.

### US 5.3: Pantalla de Título y Menú Principal [✓]
**Como** jugador,  
**Quiero** una pantalla de inicio atractiva con el nombre del juego, opciones de comenzar, continuar partida guardada, opciones y tutorial,  
**Para** tener un punto de entrada claro y profesional al juego.

> **Criterios de Aceptación:**
> - Escena `TitleScene` con título "ELEMENTAL TD: MARCAS DE CENIZA".
> - Botón "COMENZAR" (nueva partida con confirmación si ya hay guardado).
> - Botón "CONTINUAR" que indica la oleada guardada (deshabilitado si no hay partida).
> - Botones de "OPCIONES" y "¿CÓMO JUGAR?".
> 
> *Estado:* **Implementado** en `TitleScene.js`.

### US 5.4: Menú de Opciones In-Game (Modal Flotante) [✓]
**Como** jugador,  
**Quiero** acceder a un menú de opciones durante la partida mediante un icono discreto en la esquina superior derecha,  
**Para** ajustar el sonido, reiniciar o guardar y salir al menú principal sin estorbar la visión del tablero.

> **Criterios de Aceptación:**
> - Icono de tuerca traslúcido en la esquina superior derecha (`GAME_WIDTH - 24, 24`).
> - Al hacer clic, abre un modal `OptionsModal` que pausa la interacción con el juego.
> - Opciones disponibles: Alternar Sonido, Guardar y Salir al Menú Principal, Reiniciar Partida, Volver.
> 
> *Estado:* **Implementado** en `OptionsModal.js` y `UIScene._buildTopRightGear()`.

### US 5.5: Control de Velocidad (x1 / x2) y Sincronización [✓]
**Como** jugador impaciente,  
**Quiero** poder alternar la velocidad del juego entre 1x y 2x y que todas las mecánicas (incluyendo la cadencia de disparo de las torres y la UI al recargar) funcionen en proporción exacta,  
**Para** que las oleadas avancen más rápido sin que mis torres pierdan efectividad.

> **Criterios de Aceptación:**
> - El botón 'VEL 1x' / 'VEL 2x' duplica la velocidad del juego.
> - La cadencia de disparo de las torres (`Tower.js`) escala con `delta`, disparando el doble de rápido en 2x.
> - Al guardar en 2x y reingresar, la UI refleja el estado real (`VEL 2x` en naranja) sin requerir dobles clics para desincronizar.
> 
> *Estado:* **Implementado** en `Tower.js`, `GameScene.js` y `UIScene._buildGlobalControls()`.

### US 5.6: Pausa
**Como** jugador,  
**Quiero** pausar el juego con la barra espaciadora o botón de pausa dedicado,  
**Para** atender interrupciones de la vida real sin perder vidas.

> **Criterios de Aceptación:**
> - Pausar detiene oleadas, proyectiles, movimiento y temporizadores.
> - Se muestra un cartel visible de "PAUSA".
> 
> *Estado:* **Implementado** en `UIScene.js` con soporte completo de pausa gráfica y control del tiempo.

---

## ⚙️ Epic 6: Rendimiento y Estabilidad Técnica

### US 6.1: Reciclado de Entidades (Object Pooling)
**Como** desarrollador,  
**Quiero** reciclar instancias de enemigos, proyectiles, orbes de maná y textos de daño flotante en vez de instanciar y destruir objetos en cada frame,  
**Para** mantener 60 FPS estables en oleadas avanzadas con 40+ enemigos y cientos de proyectiles simultáneos.

> **Criterios de Aceptación:**
> - Pools reutilizables para proyectiles (`Projectile`) y enemigos (`Enemy`).
> - Reducción en la presión del Garbage Collector del navegador.
> 
> *Estado:* **Implementado**. Los enemigos y proyectiles utilizan un sistema riguroso de pooling estático que recicla las entidades sin destruir sus GameObjects de Phaser.

### US 6.2: Optimización de Rendering y Gestión de Tweens
**Como** jugador,  
**Quiero** que los gráficos que no importan se simplifiquen o eliminen,  
**Para** asegurar compatibilidad fluida en dispositivos de gama media o navegadores con aceleración gráfica limitada.

> **Criterios de Aceptación:**
> - Los efectos de chispas y partículas liberan sus tweens inmediatamente tras finalizar.
> - Los rangos de torres solo se procesan cuando están activos o en hover.
> 
> *Estado:* **Implementado**. Se reemplazaron los tweens de impactos por un `ParticleSystem` centralizado y se eliminaron los gráficos de rango redundantes de las torres, usando un único gráfico compartido.

---

## 📱 Epic 7: Controles Táctiles y Móvil

### US 7.1: Soporte Táctil para Héroe y Construcción ⏸️
**Como** jugador en dispositivos móviles o tablets,  
**Quiero** mover al héroe y colocar estructuras mediante gestos táctiles directos,  
**Para** disfrutar del juego sin necesidad de periféricos de ratón y teclado.

> **Criterios de Aceptación:**
> - "Tap to move" con marcador de onda arcana o joystick virtual flotante/configurable para el héroe.
> - Drag & Drop táctil directo desde la barra lateral o selección de celda adaptada a dedos.
> - Botón flotante `[ ✕ CANCELAR ]` para cancelar modos de colocación, venta o hechizos sin clic derecho.
> - Prevención de gestos nativos del navegador (`touch-action: none`) y escalado automático responsivo.
> 
> *Estado:* **En Pausa**. Deshabilitado temporalmente para PC a fin de evitar elementos flotantes o interferencias con el control de ratón/teclado. Se mantendrá el código base para reactivarlo cuando se prepare el build/modo específico para dispositivos móviles.

---

## 💰 Epic 8: Sumidero de Oro en Oleadas Tardías

### US 8.1: Mejoras Individuales de Estructuras con Oro Excedente [✓]
**Como** jugador en oleadas avanzadas,  
**Quiero** invertir el oro sobrante en mejorar directamente torres ya construidas (aumentando daño o rango individual),  
**Para** que el oro siga teniendo valor estratégico una vez que el mapa esté lleno de estructuras.

> **Criterios de Aceptación:**
> - Al hacer clic en una torre construida, se habilita una opción de "Mejorar nivel" pagando oro.
> - El costo escala exponencialmente por nivel.
> 
> *Estado:* **Implementado** en `Tower.js`, `TowerData.js`, `GameScene.js`, `SaveSystem.js` y `UIScene.js`.

---

## 👑 Epic 9: Jefes y Eventos de Oleada

### US 9.1: Oleadas de Jefe con Ataques Telegrafiados [✓]
**Como** jugador,  
**Quiero** enfrentarme a jefes especiales cada 5 oleadas que ejecuten habilidades de área anunciadas visualmente en el suelo,  
**Para** tener un combate clímax donde deba mover activamente al héroe y reposicionar defensas.

> **Criterios de Aceptación:**
> - Jefes con barra de vida superior prominente y habilidades especiales (ej. rugido que aturde torres, fuego en línea recta).
> - Telegrafiado visual 1.5s antes del impacto para dar tiempo de esquivar con el héroe.
> 
> *Estado:* **Implementado** en `EnemyData.js`, `Enemy.js`, `WaveData.js`, `WaveManager.js`, `Tower.js`, `TelegraphSystem.js`, `BootScene.js`, `UIScene.js`, `GameScene.js` y `AudioSystem.js`.

---

## 🎯 Epic 10: Fusión Avanzada — Torres Tier 3 (Legendarias)

### US 10.1: Fusión de Híbridos en Torres Legendarias
**Como** jugador avanzado,  
**Quiero** poder fusionar dos torres híbridas adyacentes en una torre legendaria de Nivel 3 con habilidades pasivas únicas,  
**Para** alcanzar el máximo techo de poder y optimización del tablero.

> **Criterios de Aceptación:**
> - `FusionSystem` detecta combinaciones válidas entre híbridos de Nivel 2.
> - Torres Tier 3 con identidades y proyectiles únicos (ej. Tormenta de Ceniza, Templo Ancestral).
> - Registro documentado en la pestaña de Fusiones del panel de ayuda.
> 
> *Estado:* **Pendiente**.

---

## 🧱 Epic 11: Barricadas Especializadas

### US 11.1: Barricadas con Efectos Tácticos
**Como** jugador,  
**Quiero** poder encantar o mejorar barricadas para que apliquen efectos a los enemigos que caminen a su lado (púas de daño, escarcha ralentizadora),  
**Para** que la arquitectura del laberinto sea también una herramienta de daño activo.

> **Criterios de Aceptación:**
> - Opciones de barricada con púas (daño físico de contacto) y barricada de hielo (aura de ralentización adyacente).
> - Coste de mejora adicional en oro/maná.
> 
> *Estado:* **Pendiente**.

---

## 🗺️ Epic 12: Terreno Elemental

### US 12.1: Casillas de Suelo con Afinidad Elemental
**Como** jugador,  
**Quiero** que ciertas casillas del mapa posean afinidad con un elemento natural (Fuego, Agua, Tierra, Rayo) otorgando un bonus a las torres colocadas allí,  
**Para** incentivar la lectura del terreno y variar la colocación de torres entre partidas.

> **Criterios de Aceptación:**
> - Casillas del grid marcadas visualmente con runas elementales.
> - Colocar una torre del elemento coincidente otorga un +20% de daño o rango.
> 
> *Estado:* **Pendiente**.

---

## 🛠️ Epic 13: Herramientas de Desarrollo y Testing

### US 13.1: Consola / Panel de Desarrollador
**Como** desarrollador / tester,  
**Quiero** un panel de depuración activable por atajo de teclado (ej. `F1` o `~`) que permita sumar oro/maná, saltar oleadas y probar invulnerabilidad,  
**Para** validar mecánicas complejas y balancear oleadas sin tener que jugar 20 minutos cada vez.

> **Criterios de Aceptación:**
> - Botones para: `+500 Oro`, `+500 Maná`, `Saltar a Oleada N`, `Matar todos los enemigos`, `Modo Dios`.
> - Oculto y desactivado por defecto en builds públicas.
> 
> *Estado:* **Pendiente**.

---

## 🗺️ Epic 14: Sistemas de Juego Avanzados y Múltiples Niveles

### US 14.1: Arquitectura Modular de Niveles y Selector de Mapas (`LevelData`)
**Como** jugador y desarrollador,  
**Quiero** que el juego desacople los mapas, rutas y oleadas en estructuras de datos independientes (`LevelData`) y ofrezca un selector de mapas en el menú principal,  
**Para** poder jugar múltiples niveles con trazados, biomas, puntos de entrada/salida y desafíos únicos, y permitir agregar fácilmente nuevos mapas sin modificar la lógica interna del motor.

> **Criterios de Aceptación:**
> - **Capa de Datos `LevelData` (`js/data/LevelData.js` o `levels/`)**: Cada nivel define:
>   - Identificador único (`id`), nombre (`name`) y descripción táctica.
>   - Bioma visual (`biome`: `'grass'`, `'volcano'`, `'snow'`, `'dungeon'`).
>   - Dimensiones de cuadrícula, punto de spawn de enemigos y punto de salida hacia el templo central.
>   - Trazado de `waypoints` propio (soporte para curvas, pasillos y bifurcaciones).
>   - Bloques rompibles iniciales con vida y coordenadas.
>   - Recursos iniciales (oro y vidas iniciales configurables por nivel).
>   - Lista de oleadas o generador procedural asignado al mapa.
> - **Desacoplamiento del Motor (`GameScene`, `GridSystem`, `Enemy`, `RouteView`)**:
>   - Se elimina la constante estática `WAYPOINTS` hardcodeada de `GridSystem.js`, `Enemy.js` y `RouteView.js`.
>   - `GridSystem` construye su matriz de caminos dinámicamente según el `LevelData` recibido.
>   - `Enemy.js` y `RouteView.js` leen las rutas dinámicamente desde `gridSystem.waypoints`.
>   - `GameScene` renderiza el suelo y decoraciones basándose en el bioma del nivel.
> - **Selector de Mapas en `TitleScene`**:
>   - Interfaz en el menú principal que permite previsualizar y seleccionar el mapa antes de iniciar la partida.
> - **Persistencia Multimapa (`SaveSystem`)**:
>   - `SaveSystem` incluye el `levelId` en el guardado para restaurar exactamente el mapa y sus obstáculos guardados.
> 
> *Estado:* **Pendiente**.

### US 14.2: Modo Sin Fin (Endless Mode) [✓]
**Como** jugador veterano,  
**Quiero** que tras superar la oleada base de cualquier mapa pueda continuar jugando en un modo infinito con dificultad y recompensas crecientes,  
**Para** probar mis defensas al límite y registrar puntuaciones récord.

> **Criterios de Aceptación:**
> - Botón interactivo de "MODO INFINITO" en la pantalla de victoria (`UIScene.js`) que descongela la partida y emite el inicio de la siguiente oleada.
> - Generación procedural de composiciones infinitas en `WaveManager.js`, con escalado exponencial de enemigos (+10% por oleada), reducción progresiva de intervalos y jefes periódicos cada 5 oleadas.
> - Adaptación visual del contador de oleadas a formato infinito (`OLEADA X/∞`) en el HUD superior de `UIScene.js`.
> 
> *Estado:* **Implementado** en `WaveManager.js` y `UIScene.js`.

### US 14.3: Banda Sonora Ambiental y Música Dinámica
**Como** jugador,  
**Quiero** escuchar música ambiental atmosférica que se intensifique durante las oleadas y vuelva a la calma en la fase de preparación,  
**Para** una experiencia auditiva envolvente acorde a la estética oscura del juego.

> **Criterios de Aceptación:**
> - Bucle musical de fondo con control de volumen independiente en opciones.
> - Transición sutil entre calma (preparación) y tensión (oleada activa).
> 
> *Estado:* **Pendiente**.

### US 14.4: Modificadores de Dificultad (Mutadores)
**Como** jugador veterano,  
**Quiero** poder elegir dificultades superiores (Normal, Difícil, Noche de Ceniza) con mutadores activos antes de empezar,  
**Para** afrontar nuevos retos si el juego base ya me resulta sencillo.

> **Criterios de Aceptación:**
> - Selector de dificultad antes de iniciar una nueva partida en el menú principal.
> - Modificadores seleccionables: enemigos con mayor velocidad, menos vidas iniciales, templos más vulnerables al sabotaje.
> 
> *Estado:* **Pendiente**.

---

## 🎨 Epic 15: Pulido Visual y Game Feel

### US 15.1: Feedback Visual y Sonoro Avanzado
**Como** jugador,  
**Quiero** que cada acción importante (fusión completada, muerte de enemigos élite, habilidades del héroe) tenga efectos de sonido y partículas distintivas y satisfactorias,  
**Para** sentir el peso y recompensa de cada decisión en el juego.

> **Criterios de Aceptación:**
> - Sonidos únicos por tipo de impacto elemental.
> - Efecto de explosión de chispas pulido al fusionar estructuras.
> 
> *Estado:* **Pendiente**.

### US 15.2: Tooltips Extendidos y Claridad de Interfaz
**Como** jugador,  
**Quiero** tooltips detallados que desglosen los cálculos de estadísticas (daño base + bonus de templo + multiplicador elemental),  
**Para** tomar decisiones numéricas informadas sin adivinar fórmulas.

> **Criterios de Aceptación:**
> - Tooltips formateados con cifras exactas y comparativas claras.
> 
> *Estado:* **Pendiente**.

### US 15.3: Sprite Pixel Art en `.ase` para Elemento Fuego (`🔥`)
**Como** creador y jugador,  
**Quiero** crear un sprite pixel art dedicado para el elemento Fuego en Aseprite,  
**Para** reemplazar el emoji `🔥` en la definición de torres, codex, vista previa de oleadas y tooltips sin fallos de tipografía.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_fire.ase` (resolución 8×8 o 16×16 px).
> - Paleta cálida ignea (`#FFA22C`, `#E85D16`, `#FF4500`).
> - Exportación a PNG e integración en Phaser sustituyendo el emoji de fuego.
> - Excelente legibilidad a escala nativa en interfaz y tooltips.
> 
> *Estado:* **Pendiente**.

---

### US 15.4: Sprite Pixel Art en `.ase` para Elemento Agua (`💧`)
**Como** creador y jugador,  
**Quiero** crear un sprite pixel art dedicado para el elemento Agua en Aseprite,  
**Para** sustituir el emoji `💧` por una gota/orbe acuático nítido y estilizado.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_water.ase` (resolución 8×8 o 16×16 px).
> - Paleta celeste y azul cian (`#74D2F5`, `#2E9BD8`).
> - Integración en `TowerData.js`, codex y fichas informativas.
> - Silueta reconocible de gota o gema líquida.
> 
> *Estado:* **Pendiente**.

---

### US 15.5: Sprite Pixel Art en `.ase` para Elemento Aire (`💨`)
**Como** creador y jugador,  
**Quiero** crear un sprite pixel art para el elemento Aire en Aseprite,  
**Para** reemplazar el emoji de viento `💨` por un vórtice o ráfaga pixel art representativa.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_air.ase` (resolución 8×8 o 16×16 px).
> - Paleta eólica suave (`#C3D7E2`, `#88A0B2`, `#FFFFFF`).
> - Reemplazo del emoji en codex, panel de construcción y tooltips.
> - Claridad visual sin confundirse con efectos de humo.
> 
> *Estado:* **Pendiente**.

---

### US 15.6: Sprite Pixel Art en `.ase` para Elemento Tierra (`🟤`)
**Como** creador y jugador,  
**Quiero** diseñar un sprite pixel art para el elemento Tierra en Aseprite,  
**Para** dejar atrás el emoji sustituto `🟤` y mostrar una roca o gema telúrica genuina.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_earth.ase` (resolución 8×8 o 16×16 px).
> - Paleta ocre/térrea (`#C4924F`, `#8F6234`, `#5D4037`).
> - Icono con forma de roca o runa de piedra facetada.
> - Reemplazo completo en datos elementales y codex.
> 
> *Estado:* **Pendiente**.

---

### US 15.7: Sprite Pixel Art en `.ase` para Híbrido Hielo (`❄️`)
**Como** creador y jugador,  
**Quiero** crear un sprite en Aseprite para el elemento híbrido Hielo (Agua + Aire),  
**Para** sustituir el emoji `❄️` por un cristal de escarcha estilizado acorde al juego.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_ice.ase` (resolución 8×8 o 16×16 px).
> - Paleta escarchada brillante (`#92EBF5`, `#36B6CC`, `#E0F7FA`).
> - Forma de copo o cristal de hielo puntiagudo.
> - Reemplazo en tarjetas de fusión y códice de enemigos.
> 
> *Estado:* **Pendiente**.

---

### US 15.8: Sprite Pixel Art en `.ase` para Híbrido Tormenta (`⚡`)
**Como** creador y jugador,  
**Quiero** diseñar un rayo pixel art en Aseprite para el elemento Tormenta (Aire + Fuego),  
**Para** reemplazar el emoji `⚡` con un relámpago enérgico y contrastado.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_storm.ase` (resolución 8×8 o 16×16 px).
> - Paleta eléctrica (`#FFE45C`, `#FFF59D`, acentos violetas `#6B45D6`).
> - Silueta de rayo angular con buen impacto visual en tamaño pequeño.
> - Reemplazo del emoji en datos de torres híbridas y UI.
> 
> *Estado:* **Pendiente**.

---

### US 15.9: Sprite Pixel Art en `.ase` para Híbrido Lava (`🌋`)
**Como** creador y jugador,  
**Quiero** crear un sprite en Aseprite para el elemento híbrido Lava (Tierra + Fuego),  
**Para** sustituir el emoji `🌋` por una gota o roca de magma fundido ardiente.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_lava.ase` (resolución 8×8 o 16×16 px).
> - Paleta volcánica intensa (`#FF8A2B`, `#D43D0A`, núcleo `#FFEB3B`).
> - Representación de magma escurriendo o fragmento incandescente.
> - Integración en el panel de fusiones y fichas de daño en el tiempo.
> 
> *Estado:* **Pendiente**.

---

### US 15.10: Sprite Pixel Art en `.ase` para Híbrido Lodo (`🌀`)
**Como** creador y jugador,  
**Quiero** diseñar un sprite en Aseprite para el elemento híbrido Lodo (Tierra + Agua),  
**Para** reemplazar el emoji `🌀` por una mancha o remolino de fango cohesivo.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_mud.ase` (resolución 8×8 o 16×16 px).
> - Paleta pantanosa y cieno (`#62C3A8`, `#2C8D74`, `#3E2723`).
> - Distinción visual clara respecto al elemento tierra puro.
> - Reemplazo del emoji en codex y preview de torres de control de masas.
> 
> *Estado:* **Pendiente**.

---

### US 15.11: Sprite Pixel Art en `.ase` para Corazón de Vidas (`♥`)
**Como** creador y jugador,  
**Quiero** diseñar un icono de corazón pixel art en Aseprite para el contador de vidas,  
**Para** retirar el carácter de texto `♥` del HUD y lograr un indicador nítido y pulsante.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_heart.ase` (resolución 8×8 o 16×16 px).
> - Paleta rubí viva (`#FF1744`, `#D50000`, reflejo blanco `#FF8A80`).
> - Versión opcional de corazón roto o atenuado al estar en peligro de derrota.
> - Reemplazo en el texto superior de vidas de `UIScene.js`.
> 
> *Estado:* **Pendiente**.

---

### US 15.12: Sprite Pixel Art en `.ase` para Corona de Jefes (`👑`)
**Como** creador y jugador,  
**Quiero** crear una corona real dorada en Aseprite para identificar a los jefes,  
**Para** evitar errores de sustitución en la fuente "Press Start 2P" y tener un marcador de jefe imponente.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_crown.ase` (resolución 8×8 o 16×16 px).
> - Paleta de oro brillante con rubíes (`#FFD54F`, `#FFB300`, acentos `#D50000`).
> - Integración en el preview inferior de oleadas de jefe y anuncios de victoria/alerta.
> - Perfecta nitidez al escalarse o acompañar sprites de enemigos.
> 
> *Estado:* **Pendiente**.

---

### US 15.13: Sprite Pixel Art en `.ase` para Orbe / Mota de Maná (`✦`) [✓]
**Como** creador y jugador,  
**Quiero** diseñar un orbe de maná refinado en Aseprite,  
**Para** sustituir el símbolo textual `✦` en costes de hechizos, barra de templo y notificaciones.

> **Criterios de Aceptación:**
> - Archivo fuente: `mana.ase` (resolución 21×24 px).
> - Paleta violeta / amatista luminosa con núcleo brillante y halo místico.
> - Script de compilación `update_mana.cjs` que convierte `mana.ase` en Data URI en `ManaSprite.js`.
> - Carga de textura `'mana_mote'` en `BootScene.js` e integración en tarjeta de recursos y HUD de `UIScene.js`.
> 
> *Estado:* **Implementado** en `mana.ase`, `update_mana.cjs`, `ManaSprite.js`, `BootScene.js` y `UIScene.js`.

---

### US 15.14: Sprite Pixel Art en `.ase` para Moneda de Oro (`🪙`) [✓]
**Como** creador y jugador,  
**Quiero** contar con un sprite dedicado de moneda de oro en Aseprite,  
**Para** estandarizar el recurso de oro en la tarjeta HUD, costes de compra y venta de torres.

> **Criterios de Aceptación:**
> - Archivo fuente: `coin.ase` (resolución 17×17 px).
> - Paleta de oro reluciente (`#FFD700`, `#FFB300`, borde `#B78103`).
> - Script de compilación `update_coin.cjs` que convierte `coin.ase` en Data URI en `CoinSprite.js`.
> - Carga de textura `'icon_coin'` en `BootScene.js` y uso generalizado en el HUD y costes de torres de `UIScene.js`.
> 
> *Estado:* **Implementado** en `coin.ase`, `update_coin.cjs`, `CoinSprite.js`, `BootScene.js` y `UIScene.js`.

---

### US 15.15: Sprite Pixel Art en `.ase` para Engranaje de Opciones (`⚙️`)
**Como** creador y jugador,  
**Quiero** diseñar un icono de engranaje mecánico en Aseprite,  
**Para** reemplazar el carácter textual `⚙` en el botón de ajustes del HUD y modal de opciones.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_gear.ase` (resolución 12×12 o 16×16 px).
> - Paleta metálica técnica (`#90CAF9`, `#546E7A`, borde `#263238`).
> - Estado interactivo normal y hover (iluminado en `#FFD54F`).
> - Integración en el botón superior derecho de `UIScene` y título de `OptionsModal`.
> 
> *Estado:* **Pendiente**.

---

### US 15.16: Sprite Pixel Art en `.ase` para Indicadores de Efectividad (`▲` y `▼`)
**Como** creador y jugador,  
**Quiero** crear flechas de efectividad de combate personalizadas en Aseprite,  
**Para** reemplazar los triángulos de texto `▲` (Súper Efectivo) y `▼` (Resistido).

> **Criterios de Aceptación:**
> - Archivos fuente: `icon_effective_up.ase` (dorado/verde) e `icon_resist_down.ase` (gris azulado).
> - Tamaño compacto de 7×7 u 8×8 px.
> - Uso en números flotantes de combate, codex elemental y comparativas de daño.
> - Alto contraste visual contra cualquier fondo de terreno.
> 
> *Estado:* **Pendiente**.

---

### US 15.17: Sprite Pixel Art en `.ase` para Altavoz y Silencio (`🔊` / `🔇`)
**Como** creador y jugador,  
**Quiero** diseñar iconos de sonido activo y mute en Aseprite,  
**Para** disponer de controles audiovisuales directos y comprensibles visualmente.

> **Criterios de Aceptación:**
> - Archivos fuente: `icon_sound_on.ase` e `icon_sound_off.ase` (12×12 o 16×16 px).
> - Altavoz con ondas sonoras (on) y altavoz tachado en rojo suave (off).
> - Integración en el botón de alternar sonido del modal de opciones y barra rápida.
> 
> *Estado:* **Pendiente**.

---

### US 15.18: Sprite Pixel Art en `.ase` para Botón de Iniciar Oleada (`▶`)
**Como** creador y jugador,  
**Quiero** diseñar una flecha de reproducción/play rúnica en Aseprite,  
**Para** reemplazar el carácter `▶` en el botón principal de inicio de oleada.

> **Criterios de Aceptación:**
> - Archivo fuente: `icon_play_wave.ase` (resolución 8×8 o 12×12 px).
> - Paleta de esmeralda y oro (`#81C784`, `#FFFFFF`, acentos `#4CAF50`).
> - Acompaña el texto "OLEADA" en la barra lateral con estilo arcade/fantasía.
> 
> *Estado:* **Pendiente**.

