# 📝 Épicas y User Stories - Nuevas Mecánicas TD

A continuación se detallan las historias de usuario (User Stories) para las nuevas mecánicas propuestas. Están agrupadas por "Épicas" (Epics) para facilitar su gestión en tableros como Jira, Trello o Asana.

Cada historia sigue el formato estándar: **Como [rol], quiero [acción] para [beneficio/valor]**. Se incluyen también Criterios de Aceptación (AC) básicos para guiar el desarrollo.

---

## 🚨 Epic 0: Core UX & MVP (Urgente)

### US 0.1: Visualización de Ruta y Prevención de Bloqueo Absoluto
**Como** jugador estratégico,
**Quiero** ver una línea tenue en el suelo indicando la ruta que tomarán los enemigos y que el sistema me impida colocar una barricada si esta corta completamente el camino,
**Para** poder hacer mazing (laberintos) sin romper el juego ni atascar a los enemigos.

> **Criterios de Aceptación:**
> - El pathfinding recalcula la ruta al arrastrar/seleccionar una barricada y muestra una línea visual del nuevo camino.
> - Si colocar la barricada hace que el pathfinding hacia el final no encuentre ruta (`null`), no se permite la construcción (suena alerta de error).

### US 0.2: Tutorialización Interactiva (Economía Dual)
**Como** jugador nuevo,
**Quiero** un tutorial integrado en la primera oleada que me obligue a recoger mi primer orbe de maná con el héroe y luego me enseñe a colocar un Templo,
**Para** entender prácticamente la diferencia entre la recolección manual y el refinado pasivo del templo.

> **Criterios de Aceptación:**
> - Al caer el primer orbe de maná, el juego destaca el orbe y pide mover al héroe.
> - Luego, guía visualmente (resaltando botones) a comprar y colocar el primer Templo.

### US 0.3: Feedback Visual de Rango y Daño
**Como** jugador,
**Quiero** ver el rango exacto de mis torres/templos al seleccionarlos y ver el daño numérico flotante cuando impactan a un enemigo,
**Para** medir la efectividad de mis defensas y sentir el impacto real al comprar una mejora global.

> **Criterios de Aceptación:**
> - Al hacer clic o pasar el mouse sobre una estructura, se dibuja su rango en el grid.
> - Textos numéricos de daño flotante sobre los enemigos al recibir un proyectil.

---

## 🗡️ Epic 1: Refactorización y Profundidad del Héroe

### US 1.1: Habilidades Activas del Héroe
**Como** jugador,
**Quiero** poder activar habilidades especiales del héroe (como un 'Dash' o un 'Ataque en Área') usando atajos de teclado o botones en la interfaz,
**Para** tener un rol más activo en el combate y poder reaccionar a situaciones de emergencia.

> **Criterios de Aceptación:**
> - El héroe tiene al menos 1 habilidad activa programada.
> - La habilidad tiene un tiempo de recarga (Cooldown) visible en la UI.
> - La habilidad interrumpe el auto-ataque normal durante su ejecución.

### US 1.2: Sistema de Combos de Recolección de Maná
**Como** jugador arriesgado,
**Quiero** recibir un multiplicador de bonificación al recolectar múltiples orbes de maná con el héroe en una ventana de tiempo corta,
**Para** sentir que se me recompensa por exponerme al peligro en lugar de depender solo de los Templos.

> **Criterios de Aceptación:**
> - Si el héroe recoge N orbes en menos de X segundos, el valor del maná otorgado por orbe aumenta.
> - Aparece un texto flotante visual (VFX) indicando el "Combo" y el maná extra obtenido.
> - El multiplicador se reinicia si pasa el tiempo estipulado sin recolectar otro orbe.

---

## 🔮 Epic 2: Sistema de Elementos y Resistencias (Piedra-Papel-Tijera)

### US 2.1: Asignación de Elementos y Resistencias a Enemigos
**Como** jugador estratega,
**Quiero** que los enemigos pertenezcan a diferentes clases elementales que interactúen con los elementos de mis torres,
**Para** que la decisión de qué torres fusionar tenga un impacto táctico en cada oleada.

> **Criterios de Aceptación:**
> - Se añaden propiedades de debilidad y resistencia elemental en `EnemyData.js`.
> - El cálculo de daño en `takeDamage` (o similar) multiplica el daño si la torre ataca la debilidad del enemigo (ej. 150%) y lo reduce si ataca su resistencia (ej. 50%).
> - Indicadores visuales al golpear (texto de daño o colores) muestran si el golpe fue "Súper efectivo" o "Resistido".

### US 2.2: Previsualización de la Siguiente Oleada
**Como** jugador planificador,
**Quiero** poder ver qué tipos de enemigos (y sus elementos) compondrán la próxima oleada antes de que empiece,
**Para** tener tiempo de fusionar y preparar las defensas adecuadas.

> **Criterios de Aceptación:**
> - La UI muestra iconos de los próximos enemigos al lado del botón o temporizador de "Siguiente Oleada".

---

## ⚡ Epic 3: Hechizos Globales (Sumidero de Maná)

### US 3.1: Casteo de Hechizos con Maná
**Como** jugador,
**Quiero** poder gastar el Maná acumulado en hechizos activos globales (como congelar la pantalla o un ataque de meteorito),
**Para** tener un recurso de último recurso para salvar mis vidas cuando las defensas son sobrepasadas.

> **Criterios de Aceptación:**
> - Se añade un panel de "Hechizos" a la UI (`UIScene.js`).
> - Lanzar un hechizo descuenta Maná del `EconomySystem`.
> - Si no hay suficiente Maná, el hechizo está deshabilitado visualmente.
> - El hechizo aplica su efecto en todo el mapa o en un área seleccionada mediante un clic.

---

## 🎯 Epic 4: IA Avanzada de Enemigos y Agro

### US 4.1: Enemigos tipo "Cazadores" (Target: Héroe)
**Como** diseñador de niveles,
**Quiero** que ciertos tipos de enemigos prioricen atacar al Héroe en lugar de seguir la ruta principal,
**Para** forzar al jugador a mover constantemente al héroe y no dejarlo inmóvil en el frente recolectando.

> **Criterios de Aceptación:**
> - Se crea un comportamiento/estado en la IA del enemigo que, al spawnear o al acercarse a X distancia del héroe, cambie su objetivo hacia la posición actual del héroe.
> - Si el héroe muere, el enemigo retoma la ruta principal hacia el final del nivel.

### US 4.2: Enemigos tipo "Saboteadores" (Target: Templos)
**Como** diseñador de niveles,
**Quiero** enemigos que apunten y deshabiliten/destruyan estructuras clave como los Templos,
**Para** que el jugador deba priorizar eliminar ciertas amenazas rápidamente para proteger su economía.

> **Criterios de Aceptación:**
> - Un tipo de enemigo puede salirse del grid para caminar hacia el templo más cercano.
> - Al llegar al templo, aplica un debuff que detiene la recolección de maná o la generación de bufos por X segundos.

---

## 🚨 Epic 5: Persistencia y Flujo de Partida (Urgente — mismo nivel que tu Epic 0)

Con todo lo que ya construiste, llama la atención que no haya guardado de partida ni pantallas de cierre. Sin esto, cualquier testeo real se pierde al recargar la página.

### US 5.1: Guardado Automático de Progreso
**Como** jugador,
**Quiero** que mi partida se guarde automáticamente mientras juego,
**Para** no perder mi progreso si cierro la pestaña o se recarga por error.

> **Criterios de Aceptación:**
> - El estado (oleada actual, oro, maná, estructuras colocadas, vidas) se guarda cada cierto intervalo o en eventos clave (fin de oleada, compra).
> - Al abrir el juego, si hay una partida guardada, se ofrece "Continuar" o "Nueva Partida".
> - Si en algún momento lo probás como artifact dentro de Claude, `localStorage` no funciona ahí — solo aplica este guardado real cuando lo hosteás vos en tu propio dominio.

### US 5.2: Pantalla de Fin de Partida (Victoria y Derrota)
**Como** jugador,
**Quiero** ver un resumen al perder todas mis vidas o al completar la última oleada,
**Para** entender cómo me fue y decidir si reintento.

> **Criterios de Aceptación:**
> - Pantalla de Derrota: oleada alcanzada, oro total generado, tiempo jugado, botón "Reintentar".
> - Pantalla de Victoria: se dispara al completar la oleada final, con resumen similar.

### US 5.3: Pausa
**Como** jugador,
**Quiero** poder pausar el juego con una tecla o botón,
**Para** poder alejarme sin perder vidas mientras tanto.

> **Criterios de Aceptación:**
> - Pausar detiene oleadas, movimiento de enemigos/héroe, y todos los timers de habilidades o hechizos.
> - Un overlay claro indica que está en pausa (para que no se confunda con que se colgó).

---

## ⚙️ Epic 6: Rendimiento y Estabilidad (Técnico)

### US 6.1: Reciclado de Entidades (Object Pooling)
**Como** desarrollador,
**Quiero** reciclar instancias de enemigos, proyectiles, orbes de maná y textos de daño flotante en vez de crear y destruir objetos en cada spawn,
**Para** mantener el framerate estable en oleadas grandes con muchos enemigos y torres disparando a la vez.

> **Criterios de Aceptación:**
> - Enemigos y proyectiles salen de un pool en vez de instanciarse de cero cada vez.
> - El juego se prueba con 40-50 enemigos simultáneos en pantalla sin caída notoria de FPS.
> - Los VFX que crecen con las oleadas (destellos de fusión, textos flotantes) también se reciclan.

---

## 📱 Epic 7: Controles Táctiles

### US 7.1: Soporte Táctil para Héroe y Construcción
**Como** jugador en celular o tablet,
**Quiero** mover al héroe y colocar estructuras con gestos táctiles,
**Para** poder jugar sin depender de teclado y mouse.

> **Criterios de Aceptación:**
> - El héroe se mueve con joystick virtual o "tap to move".
> - Colocar torres/templos/barricadas funciona con tap sobre la casilla del grid.
> - Los botones de la sidebar tienen tamaño cómodo para dedo, no solo para cursor.

---

## 💰 Epic 8: Sumidero de Oro en Oleadas Tardías

### US 8.1: Mejoras Permanentes con Oro Excedente
**Como** jugador en oleadas avanzadas,
**Quiero** invertir oro sobrante en mejoras permanentes de estructuras ya construidas,
**Para** que el oro no deje de tener uso una vez que ya tengo todas las torres que necesito.

> **Criterios de Aceptación:**
> - Al seleccionar una estructura construida, aparece una opción de mejora pagada en oro (daño o cadencia).
> - El costo escala por nivel para que no se vuelva trivial en partidas largas.

---

## 👑 Epic 9: Jefes y Eventos de Oleada (Opcional / Pulido)

### US 9.1: Oleadas de Jefe con Ataque Telegrafiado
**Como** jugador,
**Quiero** que cada cierta cantidad de oleadas aparezca un jefe con un ataque especial anunciado visualmente antes de ejecutarse,
**Para** poder reaccionar en lugar de perder vidas por sorpresa.

> **Criterios de Aceptación:**
> - Al menos un tipo de jefe (podés reusar "Dragón" de tu lista actual) con una habilidad de área.
> - Un indicador visual aparece 1-2 segundos antes de que la habilidad impacte.
> - El jefe otorga una recompensa notoriamente mayor que un enemigo normal.

---

## 🔮 Epic 2 (continuación): Accesibilidad del Sistema Elemental

### US 2.3: Indicadores No Dependientes Solo del Color
**Como** jugador con dificultad para distinguir colores,
**Quiero** que las debilidades y resistencias elementales se indiquen también con íconos, no solo con color,
**Para** poder jugar el sistema de piedra-papel-tijera elemental sin depender de percibir diferencias de color.

> **Criterios de Aceptación:**
> - Cada elemento tiene un símbolo distintivo además de su color.
> - Los textos "Súper efectivo" / "Resistido" (US 2.1) se acompañan de un símbolo (▲/▼) además del color.

---

## 🎯 Epic 10: Fusión Avanzada — Torres Tier 3

### US 10.1: Fusión de Híbridos en Torres Legendarias
**Como** jugador que llegó a oleadas avanzadas,
**Quiero** poder fusionar dos torres híbridas adyacentes (no solo dos básicas) en una torre de tercer nivel,
**Para** tener un techo de poder más alto que recompense mantener el mapa optimizado durante toda la partida, no solo al principio.

> **Criterios de Aceptación:**
> - `FusionSystem` detecta pares de estructuras ya híbridas adyacentes, no solo básicas.
> - Cada combinación Tier 3 tiene una identidad visual claramente distinta (no es "el híbrido pero más grande").
> - Se documenta en el panel de ayuda existente, junto a la tabla de fusiones actual.

---

## 🧱 Epic 11: Barricadas Especializadas

### US 11.1: Barricadas con Efecto, no Solo Bloqueo
**Como** jugador,
**Quiero** poder mejorar mis barricadas para que hagan algo además de bloquear el paso,
**Para** que decidir "dónde hago el laberinto" sea también una decisión de daño, no solo de geometría.

> **Criterios de Aceptación:**
> - Al menos 2 variantes de barricada mejorada (ej: con púas = daño por contacto; con escarcha = ralentiza).
> - El costo de mejora es mayor al de una barricada básica, para que sea una decisión real y no un upgrade automático.

---

## 🗺️ Epic 12: Terreno Elemental

### US 12.1: Casillas Cargadas por Elemento
**Como** jugador,
**Quiero** que ciertas casillas del mapa estén "cargadas" con un elemento, visualmente distintas del resto,
**Para** que construir la torre de ese mismo elemento ahí dé un bonus, premiando leer el mapa además de leer la ruta de enemigos.

> **Criterios de Aceptación:**
> - Cada mapa define de antemano un número fijo de casillas cargadas por elemento (no aleatorio, para poder planificar).
> - Construir una torre del elemento que coincide con la casilla aplica un bonus visible (ej. +20% daño o rango).
> - Construir una torre de otro elemento ahí no tiene penalización — es un bonus opcional, no una restricción.

---

## 🛠️ Epic 13: Panel de Testing (Solo Desarrollo)

Esto no es para el jugador final — es para vos, ahora, mientras seguís iterando mecánicas.

### US 13.1: Consola de Desarrollador
**Como** desarrollador,
**Quiero** un panel oculto (activable con una tecla) que me deje dar oro/maná al instante, saltar a cualquier oleada, spawnear un enemigo específico o activar invulnerabilidad,
**Para** poder probar una mecánica puntual (una fusión Tier 3, un jefe de la oleada 15) sin jugar desde cero cada vez.

> **Criterios de Aceptación:**
> - Panel no visible por defecto; se activa con un atajo de teclado.
> - Incluye como mínimo: sumar oro/maná, saltar de oleada, invulnerabilidad on/off.
> - Queda claramente marcado como modo dev si alguna vez compartís una build pública.
