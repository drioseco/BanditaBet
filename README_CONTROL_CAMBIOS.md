# BanditaBet - Control de cambios QA

Fecha de registro: 2026-05-16  
Ultima actualizacion: 2026-05-16 (ronda qa4)  
Contexto: revision QA de flujo Google Sheets + Apps Script + Netlify + mejoras UI.

## Estado general

La app actual usa Google Sheets como base de datos y Apps Script como API. Netlify sirve el frontend estatico desde `web/`.

URL publica:

```txt
https://banditabet-kelpie-a4cd33.netlify.app/
```

Apps Script configurado en `web/js/config.js`:

```txt
https://script.google.com/macros/s/AKfycbwRk_EsmkcK67s2mo2lNRoyzhRlrmrlLBVvSU5zwuCGvtebkXsh91s-oXGqMvDuhj_ITg/exec
```

## Archivos modificados en esta ronda

### `apps-script/Code.gs`

Cambios aplicados:

- `getState_()` ahora marca un partido como `finished` solo si `result_factor > 0`.
- El leaderboard/WO usa la misma regla: un partido cuenta como jugado solo con marcador y factor real.
- `savePicks_()` ya no bloquea picks en partidos con marcador placeholder `0-0` y `result_factor: 0`.
- `savePicks_()` valida que el pick tenga `home_score` y `away_score` numericos antes de escribir.
- `setResult_()` fue corregido para no tocar cuotas base `Fac L`, `Fac E`, `Fac V`.
- `setResult_()` ahora escribe solo la columna de factor final (`IDX.factor`).
- Se agrego helper `isPlayed_(m)`.

Bug critico encontrado:

Antes, al cargar un resultado desde Gestion, si se enviaba un factor, Apps Script hacia esto:

```js
var facCol = resultLetter === 'L' ? IDX.fl : resultLetter === 'V' ? IDX.fv : IDX.fe;
sheet.getRange(loc.row, facCol + 1).setValue(factor);
sheet.getRange(loc.row, IDX.factor + 1).setValue(factor);
```

Eso sobrescribia la cuota original del partido (`Fac L/E/V`) y desordenaba la Sheet. Ya fue eliminado.

Estado correcto actual:

```js
var resultFactor = factor != null && !isNaN(factor) ? factor : (
  resultLetter === 'L' ? parsed.factor_home :
  resultLetter === 'V' ? parsed.factor_away :
                         parsed.factor_draw
);
sheet.getRange(loc.row, IDX.factor + 1).setValue(resultFactor != null && !isNaN(resultFactor) ? resultFactor : '');
```

### `web/js/render-admin.js`

Cambios aplicados:

- El campo `a-factor` ya no se precarga con `result_factor` anterior.
- Queda vacio al seleccionar partido para que el factor sea automatico segun `Fac L/E/V`.
- Si el usuario escribe un factor manual, se manda como override explicito.
- Se corrigio el merge optimista despues de `setResult`, porque Apps Script no devuelve `res.match`; devuelve `matchId`, `home_score`, `away_score`, `result`, `result_factor`.

### `web/index.html`

Cambios aplicados:

- Se elimino el bloque `#hero-logo` del home. Era la imagen grande superior del sticker Bandita Bet, marcada visualmente con una X negra en la captura.
- Label de Gestion cambiado a:

```txt
Factor resultado (opcional)
```

- Placeholder cambiado a:

```txt
auto segun resultado
```

- Cache-buster actualizado a:

```txt
20260516qa3
```

### `web/js/game-fx.js`

Cambios aplicados:

- Badges/rachas ahora usan `hasRes`.
- Evita contar placeholders `0-0` sin factor como partidos jugados.

### `web/js/logo.jsx`

Cambios aplicados:

- Se dejo funcionando solo el badge chico del header (`#logo-badge`).
- Se elimino el render del sticker grande del home (`#hero-logo`), porque ese contenedor ya no existe.
- El render del badge ahora valida que el nodo exista antes de montar React.

### `web/js/*.js`

Cambios mecanicos:

- Imports cache-busted actualizados hasta `20260516qa3`.
- `logo.jsx` ahora se carga con querystring `?v=20260516qa3` para evitar cache del render viejo.

## Verificaciones hechas

Frontend:

```txt
for f in web/js/*.js; do node --check "$f" || exit 1; done
```

Resultado: OK.

Revision especifica del logo grande:

```txt
rg -n "hero-logo|ReactDOM.createRoot\\(document.getElementById\\('hero-logo'\\)" web
```

Resultado: sin ocurrencias en `web/`. El unico registro restante esta en este control de cambios.

Apps Script:

```txt
cp apps-script/Code.gs /private/tmp/Code-check.js
node --check /private/tmp/Code-check.js
```

Resultado: OK.

API publicada:

```txt
GET ?action=health
```

Resultado: OK.

Revision de state publicado antes del fix activo:

- Habia partidos pendientes con `0-0`, `result_factor: 0`, pero `status: finished`.
- Eso inflaba WO en produccion.
- El usuario aclaro que la ultima version ya marca bien WO, asi que el foco real paso a `setResult_()` modificando cuotas base.

## Pendiente para activar cambios

### 1. Apps Script

Estos cambios en `apps-script/Code.gs` son locales. Para que la API real los use:

1. Abrir Google Sheet de BanditaBet.
2. Extensiones -> Apps Script.
3. Reemplazar `Code.gs` por el contenido local actualizado.
4. Guardar.
5. Deploy -> Manage deployments.
6. Editar deployment activo.
7. Version: New version.
8. Deploy.

Importante: si no se redeploya Apps Script, Netlify puede estar actualizado pero la API seguira tocando cuotas base.

### 2. Netlify

Luego subir `web/` nuevamente a Netlify.

La version actual del frontend usa cache-buster:

```txt
20260516qa3
```

Tambien se preparo un ZIP listo para Netlify Drop:

```txt
deploy/banditabet-netlify-drop-20260516qa3.zip
```

Ese ZIP tiene `index.html` en la raiz, que es el formato correcto para subirlo como sitio estatico. Hay otro ZIP generado durante la preparacion (`banditabet-web-20260516qa3.zip`) que contiene la carpeta `web/` completa; preferir el archivo `banditabet-netlify-drop-20260516qa3.zip`.

Nota: en esta maquina no esta instalado Netlify CLI (`netlify not found`), por eso no se hizo deploy directo desde terminal.

---

## Ronda qa4 — 2026-05-16 (segunda sesion del dia)

### Cambios aplicados

#### `web/js/config.js`

- URL de Apps Script actualizada a la del nuevo deployment activo:

```txt
https://script.google.com/macros/s/AKfycbwEUrzwgUgG6702bwFk3JZP_ujkSSsYaOyytku35K7k6v02GGSjvFIMDuYE2tVJcP0d1A/exec
```

La URL anterior (qa3) ya no es la activa. Siempre usar la que esta en `config.js`.

#### `web/css/themes.css` (NUEVO ARCHIVO)

Se creo un sistema de 5 temas de color. Cada tema redefine los tokens de `tokens.css`
(`--bb-cream`, `--bb-ink`, `--bb-maroon`, etc.) usando `data-theme` en `<html>`.
No se modifico `app.css`.

Temas disponibles:

| Key       | Nombre              | Descripcion                          |
|-----------|---------------------|--------------------------------------|
| papel     | V1 Papel (default)  | Cream + borgoña + dorado. Panini 90s |
| nocturna  | V1 Cancha Nocturna  | Dark mode del mismo sistema V1       |
| bone      | V1 Hueso            | Cream sobrio, menos amarillo         |
| modern    | V2 Sport-tech       | Negro + acid green (#D4FF3D)         |
| wc26      | V3 World Cup 2026   | Blanco + rojo/amarillo/verde         |

Activar tema desde JS:

```js
document.documentElement.dataset.theme = 'modern'; // o papel, nocturna, bone, wc26
```

#### `web/index.html`

Tres bloques nuevos:

1. Import de `themes.css` (antes de `app.css`).

2. Script anti-flash en `<head>` que aplica el tema guardado antes del primer render:

```html
<script>
(function(){
  var t = localStorage.getItem('bb-theme');
  if (t) document.documentElement.dataset.theme = t;
})();
</script>
```

3. Picker de 5 dots en `.hdr-right` (antes de `#hdr-live`):

```html
<div class="bb-theme-picker" id="theme-picker">
  <button class="bb-theme-dot" data-theme="papel"    title="..."></button>
  <button class="bb-theme-dot" data-theme="nocturna" title="..."></button>
  <button class="bb-theme-dot" data-theme="bone"     title="..."></button>
  <button class="bb-theme-dot" data-theme="modern"   title="..."></button>
  <button class="bb-theme-dot" data-theme="wc26"     title="..."></button>
</div>
```

4. Script de logica del picker (antes de `logo.jsx`). Guarda preferencia en `localStorage`,
   marca el dot activo con clase `.active`, aplica el tema al `<html>`.

5. Bloque `.title-race` (grafico de barras viejo) reemplazado por:

```html
<div class="race-wrap" id="tr-track"></div>
```

#### `web/js/render-home.js`

Seccion "Title race" reescrita. Ya no renderiza barras de distribucion de puntos.
Ahora renderiza 4 carriles de carrera animada:

- Un carril por jugador, en orden de puntos (lider primero).
- Corredor 🏃 parte desde `left: 3%` y hace transicion CSS a su posicion real
  (`pct = jugador.total / lider.total * 82`). El 82% deja espacio para la copa.
- El lider tiene clase `.running` que activa animacion de rebote CSS continua.
- Copa 🏆 fija al final de cada carril como meta.
- Gap vs lider debajo de cada carril (excepto el lider).
- Animacion escalonada: cada carril se activa 60ms despues del anterior.

#### `web/css/game-fx.css`

Estilos nuevos al final del archivo para la carrera:

- `.race-wrap` — contenedor principal
- `.race-lane` — un carril por jugador
- `.race-lane.leader` — carril del lider con borde mas grueso
- `.race-inner` — pista con fondo semitransparente y borde
- `.race-runner` — posicion absoluta, transition 1.1s ease-out
- `.race-fig.running` — animacion `bb-run` (rebote arriba/abajo, 0.55s infinite)
- `.race-cup` — copa fija a la derecha
- `.race-gap` — texto de diferencia de puntos

#### `web/css/game-fx.css` — segunda revision (pista de atletismo)

La carrera fue rediseñada completamente tras feedback del usuario:

Problemas del diseño anterior:
- El emoji 🏃 miraba a la izquierda (corria de espaldas).
- Los carriles eran demasiado altos (44px).
- No tenia look de pista de atletismo.

Cambios aplicados:

- `scaleX(-1)` en `.race-fig` para que el corredor mire a la derecha.
- Carriles de 30px de alto, sin separacion entre ellos (gap: 0).
- Fondo naranja `#B94D1A` (color pista de atletismo real).
- Lider con carril `#CC5520` (un tono mas brillante).
- `::before` = linea de largada blanca a la izquierda.
- `::after` = tablero blanco/negro (repeating-linear-gradient) como linea de llegada.
- Copa 🏆 al final de cada carril.
- Nombre del jugador a la izquierda (fuera del carril, 48px fijo).
- Gap/estado a la derecha (fuera del carril, 72px fijo): "★ lider" o "−X pts".
- Animacion `bb-stride` solo en `.race-fig.running` (el lider).
- `scaleX(-1)` integrado en ambos estados del keyframe para no perder el flip.

#### `web/js/render-home.js` — ajuste de estructura HTML

- El `<div class="race-gap">` se movio fuera de `.race-inner` (al nivel del carril).
- El lider muestra "★ lider" en lugar de gap.
- Se elimino el `style="color:${c}"` del runner (el color lo da el CSS de la pista).
- Se simplifico el texto de pts: `${total}pts` sin `<small>`.

#### `web/css/game-fx.css` + `web/js/render-home.js` — tercera revision (cancha de futbol)

La pista de atletismo fue reemplazada por una cancha de futbol estirada tras segundo feedback del usuario.

Estructura visual:

```
[DARI ] | CANCHA VERDE ─────────── 🏃 ─────────────────── ╔══╗ | ★ lider
[BLOPA] | ─────────────── 🏃 ───────────────────────────── ║🏆║ | -6.34 pts
[KMI  ] | ───────── 🏃 ─────────────────────────────────── ╚══╝ | -30.02 pts
[PELA ] | ──── 🏃 ──────────────────────────────────────── arco | -161 pts
```

Elementos CSS nuevos:

- `.race-wrap` — padding-top 28px para la copa, position relative.
- `.race-row` — flex horizontal: labels | pitch | goal | gaps.
- `.race-labels` — columna izquierda con nombres de jugadores (fuera de la cancha).
- `.race-pitch` — cancha verde (#2D7D1E) con franjas verticales de pasto
  (repeating-linear-gradient 90deg, alternando cada 48px).
  `::before` = linea central semitransparente.
  `::after` = linea de area grande (a 18% del borde derecho).
  border derecho sin cerrar (lo cierra el arco).
- `.race-lane` — carril dentro de la cancha, flex:1, separado por linea punteada blanca.
- `.race-runner` — posicion absoluta, transition 1.3s ease-out, scaleX(-1) en el emoji.
- `.race-fig.running` — animacion bb-stride solo en el lider.
- `.race-goal` — columna unica que abarca todos los carriles: 32px ancho,
  border blanco (sin borde izquierdo = abierto hacia la cancha), background semitransparente.
- `.race-trophy` — copa UNICA (un solo 🏆) posicionada arriba del arco (top: -26px).
- `.race-gaps` — columna derecha con gaps fuera de la cancha.
- `.race-gap.is-leader` — estilo especial para el lider ("★ lider").

Cambios en render-home.js:

- La seccion "Title race" construye ahora 4 elementos separados:
  labelsEl, pitchEl, goalEl, gapsEl — ensamblados en un rowEl.
- Cada jugador agrega: un `.race-name` a labels, un `.race-lane` a pitch, un `.race-gap` a gaps.
- El arco (goalEl) y la copa se crean una sola vez, no por jugador.
- La animacion escalonada sigue igual: 80ms + 70ms por jugador.

#### `web/img/trophy.svg` (NUEVO ARCHIVO) + jugadores SVG

Cambios aplicados tras pedido del usuario de usar copa estilo Mundial y figuras de jugadores con camisetas de colores.

**`web/img/trophy.svg`** — copa SVG estilo Copa del Mundo (version final, qa5):
- Path real descargado de SVGRepo (silueta exacta de la Copa FIFA World Cup).
- ViewBox 0 0 254.395 254.395.
- Tecnica de colorizado: el path original se usa como `<clipPath id="tc">`.
  Tres `<rect>` recortados por ese clip le dan color:
  1. Gradiente dorado: #F9C232 → #F5A623 (72%) → #D4890A (86%).
     A partir del 86% hace un hard-stop a #4CAF50 (verde base) → #2E7D32 (100%).
  2. Sombra izquierda: rect mitad izquierda, fill #7A4800, opacity .28.
  3. Reflejo derecho: rect diagonal derecho, fill #FDDA6A, opacity .28.
- Verificado visualmente en preview — forma reconocible como Copa del Mundo en dorado.

**`web/js/render-home.js`** — funcion `playerFigureSvg(color, name)`:
- Genera un SVG 26x38px de un jugador corriendo (reducido a 20x28px en qa5).
- Cabeza (circulo piel #F5C9A0).
- Pelo: path oscuro (#3B1F0A) que forma una mata de pelo encima de la cabeza,
  como un arco que cae hacia adelante y atras.
- Camiseta en el color del jugador con inicial centrada (blanca, 4.5px, bold).
- Brazos en el mismo color de la camiseta, postura de carrera.
- Pantalon corto negro (#1a1a1a).
- Piernas y pies: pierna delantera extendida, pierna trasera doblada, botines negros.
- Sombra eliptica debajo del jugador.
- No requiere scaleX(-1) — el SVG ya mira a la derecha.

**Colores por jugador** (definidos en `apps-script/Code.gs` y replicados en frontend):
- Dari: #1E4FB8 (azul cobalto)
- Kmi: #E8442C (tomate)
- Blopa: #E8B33D (dorado)
- Pela: #2E6B3A (pasto)

**Cambios en CSS (`game-fx.css`)**:
- `.race-wrap` padding-top: 48px (aumentado para dar espacio a la copa SVG mas grande).
- `.race-lane` min-height: 46px (aumentado para el SVG del jugador).
- `.race-runner` — la clase `.running` ahora va en el runner completo (no en .race-fig).
- `.race-fig` — es un div contenedor del SVG, sin transform (el SVG ya mira derecho).
- `.race-trophy-img` — `<img>` centrada DENTRO del arco con `top:50%; left:50%; transform:translate(-50%,-50%)`, width:28px. (qa5: antes estaba top:-44px por encima del arco; movida adentro por pedido del usuario).
- `.race-wrap` — padding-top reducido de 48px a 12px, ya que la copa no sobresale hacia arriba.
- Keyframe `bb-stride` ajustado para operar sobre translateY sin scaleX.

### Estado del deploy

ZIP listo para Netlify Drop:

```txt
deploy/banditabet-netlify-drop-20260516qa5.zip
```

Incluye todos los cambios de qa3 + qa4 + qa5:
- fix cuotas base (qa3)
- temas de color — 5 paletas (qa4)
- cancha de futbol animada con copa SVG real (qa4→qa5)
- jugadores SVG con camisetas de colores, pelo y tamano reducido (qa5)
- copa movida dentro del arco (qa5)
- seccion "Picks pendientes" en home (qa5)

Usar ESTE ZIP si hay que redesplegar. El qa4.zip es obsoleto.

### Feature: Picks pendientes (qa5)

Nueva seccion en el home, entre "Clasificacion" y "Carrera al titulo".

**Ubicacion en el codigo:**
- `web/index.html` — `<div id="pending-picks"></div>` con sdiv "Picks pendientes"
- `web/js/render-home.js` — funcion `renderPendingPicks()` (linea ~68), llamada desde `renderHome()`
- `web/css/game-fx.css` — bloque `/* PICKS PENDIENTES */` al final

**Logica:**
1. Filtra `matches` por `isFut(m) && !hasRes(m)`, ordena por fecha, toma los proximos 8.
2. Para cada partido llama `hasPick(m, player.id)` por cada jugador.
3. Calcula urgencia con `hoursUntil(m)`:
   - < 6h → 🔴 badge rojo + fondo rojo tenue en la fila
   - 6–24h → ⏰ badge naranja + fondo amarillo tenue
   - 24–72h → badge amarillo neutro
   - > 72h → sin badge
4. Resumen por jugador (chips arriba): cuantos picks pendientes tiene y si alguno es urgente.

**HTML generado:**

```
┌─ chips de resumen ───────────────────────────────────────────────┐
│  [Dari — 2 pendientes 🟡]  [Blopa — ✅ Al día]  [Kmi — 🔴 1 urg] │
└──────────────────────────────────────────────────────────────────┘
┌─ tabla ──────────────────────┬────────┬────────┬────────┬────────┐
│ Partido                      │  Dari  │  Blopa │  Kmi   │  Pela  │
├──────────────────────────────┼────────┼────────┼────────┼────────┤
│ ⚡2h  MCI vs RMA  Hoy        │   ✗    │   ✓    │   ✗    │   ✓    │
│ ⏰8h  BAR vs ATM  Dom        │   ✓    │   ✗    │   ✓    │   ✗    │
│ 3d    LIV vs CHE  Mie        │   ✓    │   ✓    │   ✓    │   ✓    │
└──────────────────────────────┴────────┴────────┴────────┴────────┘
```

**Cache-buster**: bumpeado a `qa5` en todos los imports JS e `index.html`.

**Navegacion interna (qa5 fix):**
- `state.js` ahora exporta `setState` en el import de `render-home.js`
- Cada celda (✓ y ✗), cada nombre de partido y cada chip de jugador tienen `data-nav-player` y `data-nav-sheet`
- Event delegation via `root.onclick` — un solo listener que reemplaza al anterior en cada re-render
- Al hacer click: `setState({ picker, currentPickSheet })` + `localStorage.setItem('bb_picker')` + `window.bbGoTo('picks')`
- El torneo se infiere de `m.competition_id` (default: `'liga'`)
- Click en nombre del partido → lleva al primer jugador con pick pendiente en ese partido
- Hover visual: celda escala 1.25x, nombre del partido y columna de jugador subrayan

Apps Script ya esta deployado con la URL activa. No requiere re-deploy de backend.

### Pendiente / QA recomendado

1. Verificar que los 5 dots de tema aparecen en el header (top-right, antes del sync pill).
2. Hacer click en cada dot y confirmar que la paleta cambia al instante sin reload.
3. Recargar la pagina y confirmar que el tema persiste (localStorage).
4. Verificar la carrera animada en el home: 4 carriles, corredores que se mueven, copa al final.
5. Confirmar que el bloque anterior (barras cruzadas azules) ya no aparece.

### Nota para retomar con Codex o Claude

Leer este archivo primero. Estado actual del repo:

- `web/js/config.js` — URL de Apps Script correcta (qa4).
- `web/css/themes.css` — 5 temas, sistema listo.
- `web/css/game-fx.css` — estilos de carrera al final del archivo.
- `web/js/render-home.js` — carrera animada en seccion "Title race" (~linea 116).
- `web/index.html` — picker en `.hdr-right`, script anti-flash en `<head>`.
- `deploy/banditabet-netlify-drop-20260516qa5.zip` — ZIP listo para subir.

## Riesgo a revisar en el Sheet

Revisar el partido que se actualizo "el otro dia". Probablemente una columna de cuota base (`Fac L`, `Fac E` o `Fac V`) fue reemplazada por el factor final que se ingreso manualmente desde Gestion.

La restauracion deberia hacerse con la cuota original del partido, no con el factor final.

## Siguiente QA recomendado

1. En una copia del Sheet o con un partido controlado, cargar un resultado desde Gestion sin escribir factor.
2. Confirmar que solo cambian:
   - marcador local
   - marcador visita
   - resultado
   - factor final
   - puntos por jugador
   - status por jugador
3. Confirmar que NO cambian:
   - `Fac L`
   - `Fac E`
   - `Fac V`
   - picks de jugadores
   - nombres/equipos/fecha
4. Repetir con factor manual escrito y confirmar que solo cambia factor final, no cuotas base.

## Nota para retomar con Claude o Codex

Pedirle que lea primero este archivo completo. Contexto resumido:

- Bug de cuotas base: RESUELTO en qa3. `setResult_()` ya no toca `Fac L/E/V`.
- Sticker grande con X negra: RESUELTO en qa3. `#hero-logo` eliminado.
- URL Apps Script: ACTUALIZADA en qa4 (ver `config.js`).
- Temas de color: IMPLEMENTADOS en qa4 (5 paletas, picker en header).
- Carrera al titulo: REEMPLAZADA en qa4 (carriles animados con 🏃 y 🏆).
- Copa SVG: SVGRepo path real colorizado con clipPath + linearGradient (qa5).
- Jugadores SVG: reducidos a 20x28px, con pelo oscuro agregado (qa5).
- Copa movida de encima del arco a adentro del arco (qa5).
- Seccion "Picks pendientes" agregada al home: matriz de proximos 8 partidos x jugadores, con urgencia visual (qa5).
- Banditas FC · Plantel Oficial: 4 cromos Panini (fotos reales de los jugadores, stats inventadas, frases, foil holografico, efecto hover de tilt) (qa5).
- Navegacion interna: celdas y filas de "Picks pendientes" son clicables y llevan al jugador correspondiente en la vista de Picks (qa5).
- Cronicas Banditas FC: seccion de noticias en el home con la historia "Blopa rompe lineas · la trencita" (jugada 02 del bundle de diseño), incluye minimapa SVG de la cancha con los 4 jugadores posicionados, narracion del partido y voces del campo en estilo Caveat (qa5).
- Album de la temporada: nueva seccion en el home (qa6) que materializa la "Fase 1 · Shell de Album" del bundle handoff v3. Cada fecha jugada se convierte en una pagina con cromos por partido x jugador, en 4 estados visuales: PLENO (foil holografico animado), ACIERTO (saturacion normal), MISS (greyscale 70%), WO (silueta punteada). Top 2 fechas mas recientes en orden cronologico inverso.
- Vista Stats reescrita completa (qa7): 10 bloques nuevos que toman la data REAL y la convierten en historias — pick de la temporada (hero), premios raros (7 awards), evolucion sparkline, calendario heatmap por fecha, H2H matrix 4x4, gemelos & rivales, tendencias L/E/V por jugador, marcadores favoritos top 3, split Liga vs Experto, WO grid (heredado).

### Feature: Banditas FC · Plantel (qa5)

Seccion nueva en `s-home` entre "Clasificacion" y "Picks pendientes".
Implementa el diseño de `Banditas FC.html` exportado desde Claude Design.

**Archivos:**
- `web/img/characters/` — fotos de los 4 jugadores (blopa.png, dari.png, pela.png, kmi.png)
- `web/js/render-home.js` — constante `PLANTEL` con datos estaticos + `renderPlantel()` (llamada desde `renderHome()`)
- `web/css/game-fx.css` — bloque `BANDITAS FC — PLANTEL` al final

**Datos estaticos por jugador (Panini stats — son de fantasia, no vienen del Sheet):**

| Jugador | Num | Pos      | Stats destacadas         | Frase                                        |
|---------|-----|----------|--------------------------|----------------------------------------------|
| Blopa   | #10 | Enganche | VISIÓN 88, GAMBETA 82    | "Yo la pongo donde quiero, hermano."         |
| Dari    | #04 | Stopper  | FUERZA 92, BARDEO 88     | "Pidan la pelota, yo se las quito igual."    |
| Pela    | #08 | Volante  | PULMÓN 99, VELOCIDAD 95  | "Si no terminé reventado, no jugué."         |
| Kmi     | #07 | Extremo  | CAÑO 96, EGO 99          | "¿Caño? Cuál caño, eso fue magia."           |

**Efectos visuales:**
- Cada cromo tiene leve rotacion aleatoria (-1.2°, +0.8°, -0.6°, +1.4°) para look sticker real
- Hover: vuelve a 0° y escala 1.03x
- Franja holografica en el top del cromo (gradiente animable)
- Nameplate estilo panini abajo de la foto
- Barras de stats coloreadas con el color del jugador
- Footer "COLECCIONÁ LOS 4" + firma Caveat "¡pegalos en tu álbum!"

El ZIP activo para produccion es `deploy/banditabet-netlify-drop-20260516qa8.zip`.

---

## Ronda qa8 — 2026-05-16 (cuarta sesion del dia)

### QA setResult_() — resultado

Revision completa del codigo `setResult_()` en `apps-script/Code.gs`.

**Conclusion: el fix de qa3 esta correcto y activo.**

Columnas que escribe `setResult_()`:
- `IDX.hScore` — marcador local
- `IDX.aScore` — marcador visita
- `IDX.result` — resultado L/E/V
- `IDX.factor` — factor final (col 20 liga / col 19 experto)
- `IDX.points[pName]` — puntos por jugador
- `IDX.statuses[pName]` — status por jugador (P/Ac/ )

Columnas que NO toca (confirmado):
- `IDX.fl` (col 8/7) — Fac L: intacta
- `IDX.fe` (col 9/8) — Fac E: intacta
- `IDX.fv` (col 10/9) — Fac V: intacta

La funcion lee `parsed.factor_home/draw/away` para calcular el factor final, pero no escribe de vuelta a esas columnas. Solo escribe en `IDX.factor`. El Apps Script no necesita redeploy adicional.

### Feature: Logros · Cromos especiales (qa8)

Nueva seccion en `s-home` entre "Banditas FC · Plantel" y "Picks pendientes".
Materializa el concepto de cromos desbloqueables del bundle handoff v3.

**Archivos modificados:**
- `web/index.html` — `<div id="logros"></div>` con sdiv "Logros · Cromos especiales", cache buster a qa8
- `web/js/app.js` — cache buster a qa8 (todos los imports de render files)
- `web/js/game-fx.js` — 3 badges nuevos en BADGE_DEFS + reescritura completa de `computeBadgesFor()`
- `web/js/render-home.js` — constante LOGROS_DEF + funcion `renderLogros()`, llamada desde `renderHome()`
- `web/css/game-fx.css` — bloque "LOGROS · CROMOS ESPECIALES" al final

**Los 9 logros disponibles:**

| Key | Ico | Titulo | Condicion |
|---|---|---|---|
| `pleno` | ◎ | El primer pleno | Acerto el marcador exacto al menos una vez |
| `pleno_solo` | ★ | Pleno solitario | Unico en clavar ese marcador en un partido |
| `doblete` | ⚡ | Doblete | 2 plenos en la misma fecha |
| `hat_trick` | 🎩 | Hat-trick | 3 plenos en la misma fecha |
| `streak_3` | 🔥 | Racha x3 | 3 P o Ac seguidos |
| `streak_5` | 🔥 | En llamas | 5 P o Ac seguidos |
| `perfect_round` | 👑 | Jornada perfecta | Todos los partidos de una fecha: P o Ac |
| `goleador` | ⚽ | El goleador | Pleno exacto en partido con 4+ goles reales |
| `zero_wo` | 🏅 | Sin un WO | Toda la temporada sin dejar de marcar |

**Logica de deteccion en `computeBadgesFor()` (game-fx.js):**
- Un scan cronologico por partidos cerrados para: pleno, pleno_solo, goleador, streak_3, streak_5, zero_wo
- Agrupacion por round (competition_id::round_id) para: doblete, hat_trick, perfect_round
- `goleador`: requiere pleno exacto Y que `home_score + away_score >= 4` en el partido real (no en el pick)
- `zero_wo`: se activa solo si hay al menos un partido jugado y el jugador no tiene ningun WO

**Visual por sticker:**
- **Desbloqueado** (`.logro-st-on`): foto del jugador, borde solido en color del jugador, badge del logro (circulo dorado top-right), "✓ LOGRADO" en verde
- **Bloqueado** (`.logro-st-off`): foto en greyscale + oscurecida, mascara semitransparente, "?" gigante en cream tenue, borde dashed, "pendiente" en gris
- Rotaciones pseudo-aleatorias por posicion (-1.5°, +0.8°, -0.6°, +1.2°) — misma tecnica que Album y Plantel
- Hover: endereza y escala 1.08x

**Visual de la seccion:**
- Header con counter "X / 36 cromos desbloqueados" + texto de hint
- Cards de logro inactivas (nadie lo desbloqueo) en opacity 72%, sin box-shadow
- Cards activas (al menos un jugador lo desbloqueo): border ink, box-shadow 4px

**Cache buster**: bumpeado a `qa8` en index.html, app.js, render-home.js, game-fx.js.

### Archivos clave (estado qa8)

- `README_CONTROL_CAMBIOS.md` — historial completo (este archivo)
- `apps-script/Code.gs` — backend, sin cambios en qa8
- `web/js/config.js` — URL de API (sin cambios)
- `web/js/game-fx.js` — BADGE_DEFS (9 logros) + computeBadgesFor() completo
- `web/js/render-home.js` — LOGROS_DEF + renderLogros() agregado
- `web/index.html` — seccion #logros agregada, qa8
- `web/js/app.js` — qa8
- `web/css/game-fx.css` — bloque LOGROS al final

### Pendiente en qa8

- No se genero ZIP de deploy (pendiente subir a Netlify junto con qa9)
- Ver ronda qa9 para las siguientes features

---

## Ronda qa9 — 2026-05-16 (quinta sesion del dia)

### Feature: Cronica auto de la ultima fecha (qa9)

Nueva seccion en `s-home` entre "Carrera al titulo" y "Cronicas Banditas FC".
Genera un articulo periodistico automatico a partir de los datos reales de la ultima jornada cerrada (todos los partidos con resultado).

**Archivos modificados:**
- `web/index.html` — `<div id="cronica-auto"></div>` con sdiv "Cronica · Ultima fecha", cache buster a qa9
- `web/js/app.js` — cache buster a qa9
- `web/js/game-fx.js` — cache buster a qa9
- `web/js/render-home.js` — constantes `CA_QUOTES`, `CA_LEADS` + funcion `renderCronicaAuto()`, llamada desde `renderHome()`
- `web/css/game-fx.css` — bloque "CRONICA AUTO" al final

**Logica de deteccion de la ultima fecha:**
1. Agrupa todos los partidos por `competition_id::round_id`
2. Filtra grupos donde TODOS los partidos tienen `hasRes()` (marcador y factor)
3. Ordena por fecha del partido mas reciente del grupo, descendente
4. Toma el primer grupo = ultima fecha cerrada
5. Si no hay ninguna fecha cerrada, muestra placeholder

**Estructura del articulo generado:**

```
┌─ LIGA DE PRIMERA · FECHA 3 · sabado 14 de junio   [⬆ COMPARTIR] ─┐
│                                                                    │
│  ┌─ DARI · ganó la fecha · 12.45 pts · 1P · 2Ac ─────────────┐   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Dari se quedó con la fecha 3 — 12.45 puntos, 1 pleno y nadie...  │
│                                                                    │
│  ⭐ El pleno del día                                               │
│  Dari clavó 2–1 en Boca vs River. Cuota 2.5 → +7.5 pts.          │
│                                                                    │
│  PARTIDO POR PARTIDO          D   K   B   P                       │
│  Boca 2–1 River               ★   ✓   ✗   WO                      │
│  Independiente 1–1 Racing     ✓   ✗   ✓   ✓                       │
│                                                                    │
│  PUNTOS DE LA FECHA                                                │
│  ★ 1  Dari       12.45   1P · 2Ac                                 │
│     2  Kmi        6.00   0P · 2Ac                                 │
│     3  Blopa      3.50   0P · 1Ac                                 │
│     4  Pela       0.00   0P · 0Ac · 1WO                           │
│                                                                    │
│  📣 VESTUARIO                                                      │
│  Dari    "Pedí la pelota y la metí. Así de fácil."                │
│  Kmi     "El caño al marcador salió limpio. Eso es talento."      │
│  Blopa   "Tácticamente no me dieron el partido que necesitaba."   │
│  Pela    "¿WO? Pero yo corrí igual aunque no haya marcado."       │
└────────────────────────────────────────────────────────────────────┘
```

**Sistema de frases (`CA_QUOTES`):**
Cada jugador tiene 4 frases segun su rendimiento en la fecha:
- `won` — gano la fecha (mas puntos)
- `ok` — al menos 1 pleno o 2+ aciertos
- `wo` — tuvo al menos 1 WO y rendimiento bajo
- `bad` — mayoria misses, sin plenos ni 2 aciertos

**Sistema de lead (`CA_LEADS`):**
3 templates de parrafo inicial. El indice se elige con
`charCodeAt(last char of roundName) % 3` para que sea estable
por jornada pero varie entre fechas.

**Boton Compartir:**
- Desktop: `navigator.clipboard.writeText(url)` + toast "✓ Link copiado"
- Mobile: `navigator.share({ title, url })` (Web Share API nativa)
- URL compartida = URL de la pagina sin hash

**Estado vacio:** si no hay fechas cerradas muestra mensaje placeholder.
La seccion se renderiza sola en cuanto Apps Script devuelva una fecha con todos los resultados.

### Archivos clave (estado qa9)

- `web/js/render-home.js` — CA_QUOTES, CA_LEADS, renderCronicaAuto() (nuevo), renderLogros() (qa8)
- `web/css/game-fx.css` — bloque CRONICA AUTO al final (despues de LOGROS)
- `web/index.html` — seccion #cronica-auto agregada, qa9
- `web/js/app.js` — qa9
- `web/js/game-fx.js` — qa9

### Pendiente en qa9

- No se genero ZIP de deploy (pendiente subir a Netlify)
- Sistema XP + misiones: siguiente feature (gamificacion profunda, requiere extender Apps Script)

---

## Ronda qa10 — 2026-05-16 (sexta sesion del dia)

### Feature: Toggle de orden en la vista Partidos (qa10)

Problema: con muchas jornadas jugadas habia que scrollear todo hasta abajo para ver los
proximos partidos. Ahora hay un boton "↓ Reciente / ↑ Antiguo" en la barra de filtros.

**Comportamiento:**
- Default: `sortDesc = true` — mas reciente primero (jornadas en orden descendente, partidos
  dentro de la jornada de mas nuevo a mas viejo). Util para ver picks pendientes sin scrollear.
- Al clickear el boton alterna a `sortDesc = false` — orden cronologico ascendente (primera
  jornada al tope, clasico). El estado persiste en session (variable de modulo).
- El boton se etiqueta dinamicamente: "↓ Reciente" cuando esta en modo desc, "↑ Antiguo" en asc.
- El boton se posiciona a la derecha de la fila de filtros via `margin-left: auto`.

**Alcance — Liga y Experto comparten el mismo toggle:**
`sortDesc` es una variable de modulo unica en `render-fixtures.js`. Cuando el usuario cambia
entre "Liga de Primera" y "Partidos Experto", se llama la misma `renderFixtures()` que
re-renderiza la lista filtrada por `currentSheet`; el orden vigente se conserva entre torneos.
Comportamiento intencional: si se quiere orden independiente por torneo, se puede extender
a `let sortDesc = { liga: true, experto: true }` en una iteracion futura.

**Archivos modificados:**
- `web/js/render-fixtures.js`:
  - Agrega `let sortDesc = true` a nivel de modulo (estado UI puro, no en store global).
  - En `renderFixtures()`, despues del ultimo filtro de jornada, appenda `.ft.ft-sort` button.
  - En el sort de `ordered`: `sortDesc ? db - da : da - db` (rounds) y fechas espejadas.
- `web/css/game-fx.css`: bloque `.ft.ft-sort` — transparente, menor opacidad, `margin-left: auto`.

### Feature: Navegacion interna desde Picks Pendientes (qa5)

Cada elemento de la tabla "Picks pendientes" en el home es ahora un link interno
que lleva al jugador correspondiente en la vista de Picks (`s-picks`).

**Archivos:**
- `web/js/render-home.js`:
  - Import de `setState` agregado a la linea 5
  - Atributos `data-nav-player` y `data-nav-sheet` en celdas, chips, headers de columna y nombre del partido
  - Event delegation via `root.onclick` (un solo listener, se reemplaza en cada re-render)
- `web/css/game-fx.css`: clase `.pp-nav` con cursor:pointer + hover (scale 1.25x en celdas, subrayado en links)

**Comportamiento:**

| Click en               | Destino                                                            |
|------------------------|--------------------------------------------------------------------|
| ✗ celda de jugador     | Picks del jugador, torneo del partido (`competition_id`)           |
| ✓ celda de jugador     | Igual — para que revise el pick que ya marco                       |
| Nombre del partido     | Primer jugador con pick pendiente en ese partido                   |
| Chip de resumen        | Picks de ese jugador                                               |
| Header de columna      | Picks de ese jugador                                               |

**Como funciona:**
```js
root.onclick = e => {
  const el = e.target.closest('[data-nav-player]');
  if (!el) return;
  const sheet = el.dataset.navSheet;
  if (sheet) setState({ currentPickSheet: sheet });
  setState({ picker: el.dataset.navPlayer });
  localStorage.setItem('bb_picker', el.dataset.navPlayer);
  window.bbGoTo('picks', null);
};
```

`window.bbGoTo('picks')` ya dispara `renderPicks()` internamente (ver `app.js:35`),
asi que con eso basta para refrescar la vista con el nuevo jugador y torneo.

### Feature: Cronicas Banditas FC (qa5)

Seccion nueva en `s-home` entre "Picks pendientes" y "Momentos del torneo".
Publica la "Jugada 02 · Blopa rompe lineas · la trencita" (slide 3 del bundle de
diseño `Banditas FC.html`) como una cronica deportiva al estilo diario.

**Archivos:**
- `web/index.html` — `<div id="cronicas"></div>` con sdiv "Cronicas Banditas FC"
- `web/js/render-home.js` — funcion `renderCronicas()` (datos hardcodeados de la escena),
  llamada desde `renderHome()`
- `web/css/game-fx.css` — bloque `CRÓNICAS BANDITAS FC` al final

**Estructura visual:**

```
┌─ EN VIVO · MIN 44 ──────────── JUGADA 02 · FECHA 1 ─┐
│                                                      │
│  ┌─[02]─┐ BLOPA ROMPE LÍNEAS                         │
│  └──────┘  · la trencita 🚂 ·                        │
│            Persecución pasada la mitad · ...         │
│                                                      │
│  ┌────────────────────────┐  ┌──────────────────┐   │
│  │  [minimapa cancha SVG] │  │ Blopa rompe la   │   │
│  │  P    K  D    B→●      │  │ línea con la     │   │
│  │  solo                  │  │ pelota...        │   │
│  │  [≈ 40 MTS GAP]        │  │                  │   │
│  └────────────────────────┘  │ 📣 Voces del     │   │
│                              │ campo:           │   │
│                              │ "¡no me alcanzan!"│   │
│                              │ — Blopa          │   │
│                              │ ...              │   │
│                              └──────────────────┘   │
│                                                      │
│                                  2 — 1 · VISITA      │
└──────────────────────────────────────────────────────┘
```

**Elementos clave:**
- Badge "EN VIVO" con animacion de pulso rojo
- Numero de jugada en un cuadro estilo Panini (maroon + box-shadow dura)
- Titulo en Anton italic mayusculas, con la palabra clave en bordó
- Minimapa SVG de la cancha (600x240): pasto verde con stripes, lineas blancas,
  flecha de la "trencita" hacia la derecha, gap marker entre Pela y el resto,
  4 dots de jugadores con sus iniciales (P, K, D, B) y la pelota junto a Blopa
- Narracion con nombres de jugadores en su color asignado
- Bocadillos en Caveat dentro de una caja dark con borde gold
- Footer con marcador grande "2 — 1"

**Iteracion: ambas jugadas como feed de noticias**

Posteriormente se refactorizo `renderCronicas()` para mostrar las dos jugadas
del bundle como un feed de noticias apilado (mas reciente arriba):

- **Jugada 02** (min 44') — "Blopa rompe líneas · la trencita 🚂"
- **Jugada 01** (min 38') — "Kmi habilita a Dari · caño + definición"

Estructura del codigo:
- Array `CRONICAS` con dos objetos data (positions, overlay SVG por jugada,
  narration, voces, score).
- Funcion helper `cronicaHtml(c)` que genera el HTML de una cronica.
- IDs de SVG markers/patterns sufijados con el numero de jugada
  (`cron-arr-01`, `cron-arr-02`, `stripes-01`, `stripes-02`) para evitar
  colisiones al renderizar ambos SVG en la misma pagina.
- `overlay(num)` es una funcion lambda para inyectar el `num` en el
  `marker-end="url(#cron-arr-${num})"`.
- `#cronicas` en CSS: flex column con gap de 22px entre articulos.

### Feature: Album de la temporada (qa6)

Seccion nueva en `s-home` entre "Picks pendientes" y "Carrera al titulo".
Materializa la **Fase 1 · Shell de Album** del bundle handoff v3 (`Bandita bet (3).zip`,
4 propuestas de diseño + recomendacion en fases).

**Concepto:** cada fecha jugada se convierte en una pagina del album Panini.
Por cada partido finalizado se renderiza una mini-card con 4 stickers (uno por
jugador) mostrando el estado de su pick en ese partido.

**Archivos:**
- `web/index.html` — `<div id="album"></div>` con sdiv "Álbum de la temporada"
- `web/js/render-home.js` — funcion `renderAlbum()` (linea ~302), llamada desde `renderHome()`
- `web/css/game-fx.css` — bloque "ÁLBUM DE LA TEMPORADA"

**Logica de agrupacion:**
1. Filtra `matches` por `hasRes(m)` (resultado cargado)
2. Agrupa por `${competition_id}::${round_id}`
3. Resuelve `round.name` y `competition.name` desde `state.rounds` y `state.competitions`
4. Ordena por fecha del partido mas reciente del grupo, descendente
5. Renderiza top 2 fechas (para no alargar demasiado el home)

**Estados visuales por sticker (segun `pick.status`):**

| Estado    | CSS class            | Visual                                                       |
|-----------|----------------------|--------------------------------------------------------------|
| **P**     | `.album-st-P`        | Foil holografico animado (gradient shift) + glow gold + ★    |
| **Ac**    | `.album-st-Ac`       | Cream limpio, label "✓ ACIERTO" en pasto                     |
| **miss**  | `.album-st-miss`     | `filter: grayscale(70%)` + opacity .65 + label rojo          |
| **WO**    | `.album-st-WO`       | Border dashed, foto greyscale 100% opacity .35, sin sombra   |

Cada sticker tiene rotacion pseudo-aleatoria (-2deg a +2deg) basada en el match
id y la posicion del jugador para look de coleccion real. Hover endereza y escala.

**Estado vacio:** si no hay partidos jugados, muestra "📒 Sin fechas jugadas todavía. Pegale al primer pleno y armás página."

**Cache-buster bumpeado a `qa6`** en todos los imports JS e `index.html`.
ZIP activo: `deploy/banditabet-netlify-drop-20260516qa6.zip`.

### Feature: Vista Stats reescrita (qa7)

**Contexto:** la vista anterior eran WO + insight cards genericas (top pick, efectividad, fixtures totales). El usuario dijo "está muy fome". Reescritura completa con 10 bloques data-driven.

**Archivos:**
- `web/index.html` — `#s-stats` ahora tiene 10 contenedores con sdiv cada uno
  (stat-hero, stat-awards, stat-evolution, stat-heatmap, stat-h2h, stat-pairs,
  stat-tendencias, stat-marcadores, stat-split, wo-grid).
- `web/js/render-stats.js` — reescrito de 102 a ~590 lineas.
  Estructura: `computeAllStats()` (un solo paso por matches/picks) + 10 renderers
  consumidores + `renderStats()` orchestrator.
- `web/css/game-fx.css` — bloque "STATS VIEW — version alive" al final, despues de Cronicas.

**Los 10 bloques (en orden):**

| # | Bloque | Que muestra | Tecnica |
|---|--------|-------------|---------|
| 1 | **Pick de la temporada** | El pleno mas caro del año (player + match + score + factor + pts) | Hero card con ribbon, shadow color, score gigante |
| 2 | **Premios raros** | 7 awards: El Profeta (mas P), El Bardo (mas WO), El Optimista (avg goles mas alto), El Cuidadoso (avg goles mas bajo), El Centrista (mas E pickeados), Racha caliente (max P/Ac seguidos), Racha fria (max miss seguidos) | Grid auto-fit minmax 150px |
| 3 | **Evolucion de la polla** | Sparkline SVG con 4 series superpuestas — puntos acumulados por partido cronologico, gridlines + labels X/Y + leyenda + dot en el ultimo punto | SVG inline 720x220, lineas suavizadas |
| 4 | **Calendario · ganador por fecha** | Una celda por jornada cerrada con el color del ganador, inicial + nombre corto (F1, F2, C·Final) + puntos ganados. Tooltip con nombre completo | Flex row, hover scale 1.1 |
| 5 | **H2H · la rivalidad** | Matriz 4x4 con celdas `wa · wb` (partidos donde jugador de fila sumo mas puntos que el de columna). Verde / rojo / amarillo segun ratio | Grid `n × n`, head row + diagonal — |
| 6 | **Gemelos & rivales** | 2 cards: par con mas picks identicos (gemelos) + par con mas L vs V opuestos (rivales) | Grid 2 col |
| 7 | **Tendencias de apuesta** | Stacked bar L/E/V por jugador (% de picks que terminaron en cada resultado segun el propio pick) | 3 segments colored: cobalt/amber/tomate |
| 8 | **Marcadores favoritos** | Top 3 scores recurrentes por jugador con barra de frecuencia y `n/total` | Lista ordenada por marcador |
| 9 | **Liga vs Experto** | Split por jugador: puntos + plenos + efectividad% en cada competencia | 2 rows per card |
| 10 | **WO por jugador** | Mismo de antes — heredado, color-coded por ratio relativo | (sin cambios) |

**Computacion en `computeAllStats()`:**
Hace UN SOLO scan cronologico de los partidos cerrados, llenando para cada jugador:
- contadores: pj, plenos, aciertos, misses, wo, points
- LEV tendency, goalsSum/goalsN, marcadores, perComp split
- rachas (current/max caliente y fria)
- best pick personal, cumulative snapshot por partido

Despues calcula derivados cross-player: pick de la temporada, H2H matrix,
pares (gemelos/rivales), winner por round (para el heatmap).

**Cache-buster bumpeado a `qa7`** en todos los imports JS e `index.html`.
ZIP activo: `deploy/banditabet-netlify-drop-20260516qa7.zip`.

### Bundle handoff v3 — 2026-05-16 (tercer drop de diseño)

Archivo: `/Users/darioriosecofigueroa/Downloads/Bandita bet (3).zip`

Contiene **4 propuestas de direccion completas** (no skins, son almas distintas):

| # | Propuesta | Metafora | Fase plan combinado |
|---|-----------|----------|---------------------|
| 01 | **El Album** | Panini · coleccionismo | Fase 1 · ALTA |
| 02 | **El Broadcast** | ESPN + Polymarket · data-first | Fase 4 · BAJA |
| 03 | **El Club** | FIFA · niveles + misiones + badges | Fase 2 · MEDIA |
| 04 | **El Relato** | Magazine deportivo · cronica auto | Fase 3 · MEDIA |

La **slide 6** del deck recomienda combinarlas en capas, empezando por Album.

**Mapeo de lo ya implementado contra cada propuesta:**

| Direccion | % implementado | Detalle                                                                 |
|-----------|---------------:|-------------------------------------------------------------------------|
| Album     | ~60%           | ✅ Tema papel · paleta Panini · fuentes · Plantel · Album por fecha     |
| Relato    | ~25%           | ✅ Cronicas Banditas FC (Jugada 01 + 02 con minimapa SVG)               |
| Club      | 0%             | ❌ Niveles, XP, misiones, badges                                         |
| Broadcast | 0%             | ❌ Live ticker, sparklines, H2H, Power Rankings                          |

### Proximos pasos recomendados

**Para cerrar Fase 1 (Album) — orden por impacto:**

1. **Cromos faltantes / desbloqueables** — placeholders punteados con achievements
   por destrabar (ej: "5 plenos seguidos", "Pleno + Acierto en el mismo partido").
   Esfuerzo bajo, mucho engagement.
2. **Hall of Fame · 15 años** — campeones por temporada, records, momentos legendarios.
   Depende de tener data historica accesible en el Sheet.
3. **Intercambio** (opcional · Panini puro) — mecanica social para "regalar" un sticker.

**Otras direcciones disponibles:**

4. **Cronica auto de la ultima fecha** (Fase 3 Relato) — endpoint que toma resultados
   del Sheet y genera articulo HTML con drop cap, citas, polaroid. URL compartible.
   Growth engine. Esfuerzo medio.
5. **Sistema de niveles + XP + misiones** (Fase 2 Club) — gamificacion mas profunda.
   Requiere extender Apps Script con tabla de XP/badges. Esfuerzo alto.
6. **Vista Broadcast opt-in** (Fase 4) — toggle "modo pro" con sparklines y H2H.
   Esfuerzo medio-alto. Baja prioridad.

### Archivos clave (estado qa6)

- `README_CONTROL_CAMBIOS.md` (este archivo) — historial completo
- `apps-script/Code.gs` — backend (Apps Script Web App)
- `web/js/config.js` — URL de API
- `web/js/state.js` — store (`getState`, `setState`, `subscribe`)
- `web/js/app.js` — navegacion (`bbGoTo`), boot, picker global
- `web/js/render-home.js` — **home view (multiples secciones)**:
  - `renderPlantel()` — cromos Panini
  - `renderPendingPicks()` — matriz partidos x jugadores con navegacion interna
  - `renderAlbum()` — album de la temporada por fecha
  - `renderCronicas()` — feed de noticias Banditas FC (jugada 01 + 02)
  - Standings, race al titulo, narrative feed
- `web/js/render-picks.js` — vista de Picks (destino de la navegacion interna)
- `web/js/render-admin.js` — gestion de resultados
- `web/css/themes.css` — sistema de 5 temas
- `web/css/game-fx.css` — **bloques al final, en orden:**
  - carrera al titulo (cancha)
  - picks pendientes
  - Banditas FC · plantel
  - album de la temporada (qa6)
  - cronicas Banditas FC
- `web/img/characters/` — avatares (blopa, dari, pela, kmi)
- `web/img/trophy.svg` — copa Mundial dentro del arco
- `web/js/render-stats.js` — **vista Stats completa (qa7)**: `computeAllStats()` + 10 renderers
- `deploy/banditabet-netlify-drop-20260516qa7.zip` — ZIP activo

### Feature: Sistema XP + Misiones (qa10)

Gamificacion frontend-only computada desde los picks existentes. No requiere cambios en Apps Script.

**XP por accion:**
- Pleno exacto (P): +10 XP
- Solo pleno (nadie mas acerto): +5 XP bonus
- Goleador (pleno en partido con 4+ goles): +3 XP bonus
- Acierto resultado (Ac): +5 XP
- Racha 3+: +5 XP bonus de temporada
- Racha 5+: +15 XP bonus de temporada

**Niveles:**
| XP minimo | Nombre   | Icono |
|-----------|----------|-------|
| 0         | Promesa  | ⚽    |
| 30        | Puntero  | 🥇    |
| 80        | Crack    | ⚡    |
| 160       | Figurita | ★     |
| 300       | Leyenda  | 👑    |

**9 misiones con progreso individual:**
1. Primera sangre — primer pleno (0/1)
2. Doblete — 2 plenos en la misma jornada (progreso 0-2)
3. Hat-trick — 3 plenos en la misma jornada (progreso 0-3)
4. Racha x3 — 3 aciertos consecutivos (progreso 0-3)
5. Racha x5 — 5 aciertos consecutivos (progreso 0-5)
6. Ojo clinico — unico en acertar marcador exacto (0/1)
7. Jornada perfecta — todos los picks de una jornada P o Ac (0/1)
8. El goleador — pleno en partido con 4+ goles (0/1)
9. Centurion — acumular 100 XP (progreso dinamico 0-100)

**UI: seccion "XP · Nivel · Misiones" en el home**
- Fila superior: 4 tarjetas XP (una por jugador) con barra de progreso animada al nivel siguiente.
- Tabla de misiones: filas = misiones, columnas = jugadores. Cada celda muestra barra
  de progreso proporcional + estado (fraccion o ✓ si completada).

**Archivos modificados:**
- `web/js/game-fx.js`:
  - `LEVEL_DEFS` (array de 5 niveles con min XP, nombre, icono)
  - `computeXPFor(playerId)` — devuelve `{ xp, level, next, progress }`
  - `MISSION_DEFS` (array de 9 objetos con `check()` individual)
  - `computeMissionsFor(playerId)` — devuelve array con `{ ...def, progress, done }`
  - Cache buster bumpeado a qa10
- `web/js/render-home.js`:
  - Import extendido: `computeXPFor, LEVEL_DEFS, computeMissionsFor`
  - Nueva funcion `renderMisiones()` — XP cards + tabla de misiones
  - `renderHome()` llama `renderMisiones()` despues de `renderLogros()`
  - Cache buster bumpeado a qa10
- `web/index.html`:
  - `<div id="misiones"></div>` con sdiv "XP · Nivel · Misiones"
  - Cache buster bumpeado a qa10
- `web/js/app.js` — cache buster a qa10
- `web/js/render-fixtures.js` — cache buster a qa10
- `web/css/game-fx.css` — bloque XP/misiones CSS (~120 lineas)

### Bug fix: cache buster desalineado (qa10)

**Problema:** `api.js`, `render-picks.js`, `render-stats.js` y `render-admin.js` mantenian
imports con `?v=20260516qa7`, mientras el resto de la app usaba `?v=20260516qa10`.
El browser trata cada query string unica como un modulo independiente — por lo tanto
`state.js?v=qa7` y `state.js?v=qa10` son dos instancias separadas del store.

**Efecto:** `bootstrapState()` (en api.js) escribia en la instancia qa7 del state,
pero todos los renderers leian de la instancia qa10. Resultado: la app cargaba pero
no mostraba datos del backend — sincronizacion rota.

**Fix:** bumpeado `qa7 → qa10` en los 4 archivos restantes:
- `web/js/api.js`
- `web/js/render-picks.js`
- `web/js/render-stats.js`
- `web/js/render-admin.js`

**Verificacion:** `grep -rn "qa[0-9]" web/js/ | grep -v "qa10"` → sin resultados.
ZIP regenerado: `deploy/banditabet-netlify-drop-20260516qa10.zip`.

### Pendiente en qa10

- Subir ZIP a Netlify (drag-drop)
- Verificar en produccion que la sync funciona correctamente
