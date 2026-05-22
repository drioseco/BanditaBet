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

---

## Ronda qa11 — 2026-05-18

### Migracion de hosting: Netlify → Vercel (qa11)

Netlify agoto los creditos del plan gratuito. Se migro a Vercel via GitHub.

**Pasos realizados:**
1. Inicializado repo Git local en `/Users/darioriosecofigueroa/Projects/BanditaBet/`
2. Creado `.gitignore`: `.DS_Store`, `.claude/`, `deploy/*.zip`, `_assets-source/`, `_legacy/`, `node_modules/`, `.env`
3. Primer commit: `BanditaBet qa10 — full project initial commit`
4. Repo en GitHub: `https://github.com/drioseco/BanditaBet`
5. Proyecto en Vercel: `https://vercel.com/dario-s-projects5/bandita-bet`
6. Root Directory configurado a `web` en Vercel Build and Deployment settings
7. Redeploy forzado para aplicar el cambio de Root Directory

**URL publica actual:**

```txt
https://bandita-bet.vercel.app
```

**Deploy automatico:** cada push a `main` en GitHub dispara un redeploy en Vercel (~3 segundos).

**Nota de seguridad:** el token personal de GitHub (`ghp_h1RH...`) fue expuesto durante la sesion.
El usuario fue dirigido a `github.com/settings/tokens` para revocarlo.
El remote URL fue limpiado: `git remote set-url origin https://github.com/drioseco/BanditaBet.git`.

### Homepage cleanup — reduccion de secciones (qa11)

El home tenia 9+ secciones que generaban demasiado scroll, especialmente en celular.
Se redujo a 4 secciones esenciales.

**Secciones que se mantienen:**
1. Hero (La Carrera al Titulo) — banner con lider, KPIs, progreso de temporada
2. Clasificacion — standings con barras proporcionales
3. Picks Pendientes — matriz de proximos partidos x jugadores
4. Cronica · Ultima Fecha — articulo auto-generado de la ultima jornada cerrada

**Secciones removidas del home:**
- Banditas FC · Plantel Oficial (cromos Panini)
- Logros · Cromos Especiales
- XP · Nivel · Misiones
- Album de la Temporada
- Carrera al Titulo (cancha de futbol animada)
- Cronicas Banditas FC (jugadas manuales)
- Momentos del Torneo (narrative feed)

**Archivos modificados:**
- `web/index.html` — eliminados los `<div>` y `sdiv` de las 7 secciones removidas
- `web/js/render-home.js` — eliminadas las llamadas a `renderPlantel()`, `renderLogros()`,
  `renderMisiones()`, `renderAlbum()`, `renderCronicas()`, el bloque de title race, y el
  narrative feed. Las funciones siguen en el archivo (no se eliminaron) por si se quieren
  reubicar en otras vistas en el futuro.

### Fix contraste tema Modern Sport-tech (qa11)

El tema Modern tenia problemas graves de contraste: amarillo/neon sobre blanco, negro sobre negro.

**Causa raiz:** `--bb-maroon` se usaba tanto como fondo (hero) como color de texto (posiciones,
gaps, acentos). Al ser neon en Modern, el hero era ilegible. Ademas, muchos colores en `app.css`
estaban hardcodeados con `rgba(31,26,46,...)` (tinta papel) y `rgba(242,227,194,...)` (cream),
que son invisibles sobre fondos oscuros.

**Solucion:**
1. `--bb-maroon` en Modern cambiado de `#D4FF3D` (neon) a `#FF4D2E` (rojo accent visible)
2. `--bb-pasto` en Modern cambiado de `#D4FF3D` a `#7BCC3D` (verde legible)
3. Hero background overrideado a `#1A1A24` (dark) via `[data-theme="modern"] .hero`
4. `std-head` background overrideado a `#23232B`
5. Posiciones `.std-pos` y `.std-pos.p2` cambiadas de `rgba(31,26,46,...)` hardcodeado a
   `color-mix(in srgb, var(--bb-ink) N%, transparent)` — funciona con cualquier tema
6. `std-head` text color cambiado de cream hardcodeado a `color-mix(in srgb, var(--bb-cream) 38%, transparent)`
7. Overrides adicionales para Modern y Nocturna: `.sdiv-txt`, `.sdiv-line`, `.hero-sub`,
   `.std-row:hover`, `.std-row` border, `.kpi`, `.kpi-l`, `.prog-*`, `.std-meta-*`,
   `.std-bar-wrap`, `.nb`, `.hdr small`

**Archivos modificados:**
- `web/css/themes.css` — `--bb-maroon`, `--bb-pasto` corregidos + bloque de ~30 overrides Modern/Nocturna
- `web/css/app.css` — `.std-pos`, `.std-pos.p2`, `.std-head-l/.std-head-r` migrados a `color-mix()`

### Archivos clave (estado qa11)

- `web/index.html` — home reducido a 4 secciones
- `web/js/render-home.js` — render calls limpiados (funciones siguen disponibles)
- `web/css/themes.css` — Modern/Nocturna con overrides de contraste
- `web/css/app.css` — colores migrados a tokens via `color-mix()`

### Pasos futuros (roadmap)

**Alta prioridad — automatizacion de resultados:**

Actualmente los resultados se cargan a mano desde la vista Gestion (Dari ingresa marcador
final + factor por partido). Esto es tedioso y propenso a errores.

**Propuesta:** integrar una API de futbol (API-Football, football-data.org, u otra gratuita)
para obtener resultados en tiempo real o al final de cada jornada. El flujo seria:
1. Apps Script consulta la API externa periodicamente (trigger por tiempo) o al abrir la web.
2. Si un partido tiene resultado final en la API, se auto-rellena en el Sheet.
3. Solo partidos de la Polla se actualizan (match por nombre de equipos o ID externo).
4. Se mantiene la opcion manual como fallback para partidos no cubiertos por la API.

**Impacto:** elimina el cuello de botella de tener que buscar y copiar resultados a mano.
La polla se actualiza sola.

**Media prioridad — ticker de futbol en vivo en el home:**

Agregar una seccion tipo "Futbol hoy" en la homepage que muestre partidos del dia de las
principales ligas del mundo (no necesariamente de la Polla). Funcionaria como un informador
de futbol mundial integrado:
- Partidos en vivo con marcador actualizado
- Proximos partidos del dia con hora local
- Resultados finales del dia
- Ligas: Liga MX, Premier League, La Liga, Serie A, Champions, etc.

**Fuente de datos:** misma API de futbol que se use para los resultados automaticos.
Se podria renderizar como un ticker horizontal o un bloque compacto arriba del hero.

**Impacto:** convierte BanditaBet de "app de la Polla" a "centro de futbol de los Banditas".
Los 4 amigos abren la app no solo para ver sus picks sino para enterarse de lo que pasa en
el futbol mundial. Aumenta la frecuencia de visitas diarias.

**Baja prioridad — pendientes de sesiones anteriores:**
- Reubicar secciones removidas del home (Plantel, Logros, XP, Album) en una vista dedicada
  o como sub-tabs dentro de Stats
- Phase 4 Broadcast: live ticker interno de la Polla, sparklines, Power Rankings
- Custom domain para bandita-bet.vercel.app

---

## qa12 — Editar cuotas (Fac L / E / V) desde Gestión

**Fecha:** 18 mayo 2026
**Rama:** main (commit `05e2903`)

### Qué era el problema

Las cuotas (Fac Local, Fac Empate, Fac Visita) de cada partido se podían ingresar al
crear el fixture, pero no había forma de editarlas después si el admin se equivocaba
o si las cuotas cambiaban antes del partido. La única alternativa era editar el Sheet
a mano directamente.

### Qué se construyó

Una nueva tarjeta "Editar cuotas" en la vista Gestión que permite seleccionar cualquier
partido existente y actualizar sus tres cuotas (Local, Empate, Visita) sin tocar nada
más: el resultado, los picks de los jugadores, los puntos, y el resto de columnas del
Sheet quedan exactamente igual.

**Flujo de uso:**
1. El admin va a Gestión → tarjeta "Editar cuotas (Fac L / E / V)"
2. Selecciona el torneo (Liga / Experto) — el selector de partido se llena solo
3. Selecciona el partido — los campos se pre-llenan con las cuotas actuales
4. Modifica solo los valores que quiere cambiar
5. Hace clic en "★ Actualizar cuotas"
6. El Sheet se actualiza en segundos, y la app refleja el cambio de inmediato

### Archivos modificados

**`apps-script/Code.gs`** — nuevo endpoint `updateFactors_`

Se agregó el caso `'updateFactors'` al switch de `doPost` y se implementó la función:
- Recibe `matchId`, `factor_home`, `factor_draw`, `factor_away` (todos opcionales menos matchId)
- Usa `buildMatchIndex_` para ubicar la fila exacta en el Sheet
- Usa `colIndexes_` para saber qué columnas son Fac L/E/V según el torneo
  (liga: cols 8/9/10, experto: cols 7/8/9, base 0)
- Solo escribe las columnas de cuotas — ninguna otra columna del Sheet es tocada
- Usa `LockService` para evitar escrituras simultáneas
- Redeployado como Versión 3 (18 may 2026, 20:35) — activo en producción

**`web/js/api.js`** — nueva función `updateFactors()`

Exporta la función que llama al endpoint por POST con los tres factores. Si un factor
es null (el admin lo dejó vacío), no se envía ese parámetro y el Sheet no lo toca.

**`web/index.html`** — nueva tarjeta en la grilla de Gestión

Tarjeta HTML con: selector de torneo, selector de fixture, tres inputs numéricos
(Fac L / Fac E / Fac V), y botón "★ Actualizar cuotas". Va entre la tarjeta
"Agregar fixture" y la tarjeta de info del backend.

**`web/js/render-admin.js`** — tres nuevas funciones + wiring

- `fillFactorSel()` — puebla el selector de partidos según el torneo elegido
- `fillFactorMatch()` — al seleccionar un partido, pre-llena los inputs con las cuotas actuales
- `updateFactorsHandler()` — valida, llama a la API, muestra toast, y hace merge
  optimista en el state local (la UI se actualiza sin esperar un refresh completo)

### Verificación post-deploy

Después de redes-ployar el Apps Script se verificó contra la API de producción:
- 394 partidos intactos
- 850 picks sin cambios
- Tabla de líderes igual
- Cuotas de los partidos: correctas

No hubo corrupción de datos.

### Archivos clave (estado qa12)

- `apps-script/Code.gs` — endpoint `updateFactors_` + case en doPost
- `web/js/api.js` — `export async function updateFactors(...)`
- `web/index.html` — tarjeta "Editar cuotas" en s-admin
- `web/js/render-admin.js` — `fillFactorSel`, `fillFactorMatch`, `updateFactorsHandler`

---

## qa13 — Cuotas inline en la vista Partidos

**Fecha:** 18 mayo 2026
**Rama:** main

### Qué era el problema

La tarjeta "Editar cuotas" de Gestión (qa12) servía, pero requería: abrir Gestión →
elegir torneo → elegir el partido en un dropdown → cargar valores. Para partidos
nuevos sin cuotas, era demasiado camino.

Idealmente, cuando estás navegando los Partidos y ves uno sin cuotas, deberías
poder llenarlas ahí mismo, igual que se llena un marcador local/visita.

### Qué se construyó

Un editor **inline** dentro de cada tarjeta de partido (en la vista Partidos) que
aparece SOLO si:
1. El partido aún no se jugó (no tiene resultado), Y
2. Al partido le falta al menos una de las 3 cuotas (Fac L / Fac E / Fac V), Y
3. Hay un jugador logueado.

El editor muestra una franja amarilla con el texto "Cargar cuotas:" + 3 inputs
(Fac L / Fac E / Fac V) + botón "★ Guardar". Cuando se guarda, el partido se
re-renderiza al toque y la franja desaparece (porque ya tiene cuotas).

**Permisos:** cualquier jugador logueado puede cargar cuotas faltantes (no solo
admin). La regla es: si las cuotas faltan, cualquiera de los Banditas puede
proponerlas. Si alguien quiere corregirlas después, lo hace desde Gestión →
"Editar cuotas".

### Archivos modificados

**`web/js/render-fixtures.js`**
- Nueva función `hasFactors(m)` — devuelve true si las 3 cuotas están cargadas y > 0.
- En `buildFixtureCard`, se inyecta `factorsHTML` (la franja con inputs) cuando
  corresponde, justo arriba de la grilla de picks.
- Nueva función async `saveInlineFactors` que valida, llama a `updateFactors` del
  Apps Script, hace merge optimista en el state y re-renderiza la vista.

**`web/css/app.css`**
- Nuevos estilos `.fcard-factors`, `.fcf-lbl`, `.fcf-inputs`, `.fcf-i`, `.fcf-save`
  — franja amarilla, inputs compactos monospace, botón maroon que pasa a tomate
  en hover.

### Backend

**No se tocó el Apps Script** — reutiliza el endpoint `updateFactors_` que ya
existía desde qa12. Esto significa que esta feature es 100% frontend y no requirió
redeploy del backend.

### Archivos clave (estado qa13)

- `web/js/render-fixtures.js` — `hasFactors`, `factorsHTML`, `saveInlineFactors`
- `web/css/app.css` — bloque "Inline editor de cuotas faltantes (qa13)"

### Next steps (registrados pero no implementados)

**Auto-llenado de cuotas desde Coolbet u otra casa de apuestas:**

Buscar API pública o scraper de Coolbet (u otra casa: Betsson, Latamwin, MisterTip)
que devuelva las cuotas pre-partido. El flujo sería:
1. Para cada partido sin cuotas, hacer match por nombre de equipos + fecha.
2. Si se encuentra, escribir las 3 cuotas automáticamente al Sheet.
3. Trigger: cron diario en Apps Script o on-demand desde un botón en Gestión.

Esto elimina la carga manual y mantiene las cuotas actualizadas según el mercado
real. Quedará anotado como mejora para una próxima iteración.

---

## qa14 — UX: dropdowns reemplazados + cuotas prominentes en Partidos

**Fecha:** 19 mayo 2026
**Rama:** main

### Qué era el problema

1. **Dropdowns infinitos en Gestión:** las tarjetas "Cargar resultado" y "Editar
   cuotas" tenían un `<select>` con TODOS los partidos del torneo (200+ items).
   Encontrar uno específico era frustrante.
2. **Cuotas invisibles en Partidos:** las Fac L/E/V no se mostraban en la tarjeta
   del partido (solo aparecía `result_factor` cuando ya se había jugado). El juego
   se basa en las cuotas pero no se notaba — parecía una polla normal.

### Qué se construyó

#### 1) Match-picker (selector de jornada + lista clickeable)

Tanto en "Cargar resultado" como en "Editar cuotas" el dropdown se reemplazó por:
- Un dropdown corto con solo las **jornadas** del torneo (~20 items, no 200).
- Una **lista clickeable** de partidos de esa jornada (máx ~12 filas visibles).
- Cada fila muestra: fecha · equipos · badge con cuotas actuales o "sin cuotas".
- Default: la próxima jornada con partidos pendientes se selecciona sola.

En "Editar cuotas" además se agregó un toggle "solo sin cuotas" (activado por
default) — así ves al toque los partidos que necesitan cuotas cargadas.

Al hacer clic en una fila, los inputs del card se pre-llenan con los valores
actuales del partido. La fila seleccionada queda resaltada en maroon.

#### 2) Strip de cuotas grande en cada tarjeta de Partidos

Debajo de los indicadores y arriba de los picks de los jugadores, cada partido
ahora muestra una franja con las 3 cuotas en **tipografía grande monospace**:

```
   L · River          Empate       V · Boca
     2.10              3.40          3.20
```

- Para partidos no jugados: las 3 cuotas en color maroon, peso igual.
- Para partidos ya jugados: la cuota del resultado se resalta en amarillo +
  tomate, con una estrella ★. Las otras dos se atenúan al 50%.

Esto le da identidad visual al juego: las cuotas son lo que define los puntos,
no es una polla cualquiera.

### Archivos modificados

- `web/index.html` — los dos cards de Gestión ahora tienen `<select>` de jornada
  + `<div class="match-picker">` + `<input type="hidden">` para el matchId.
- `web/js/render-admin.js` — reescrito con `fillRoundSel`, `fillMatchList`,
  `selectMatch`, `pickDefaultRound` y helpers. Se eliminaron `fillAdminSel`,
  `fillAdminMatch`, `fillFactorSel`, `fillFactorMatch`.
- `web/js/render-fixtures.js` — `buildFixtureCard` ahora inyecta `oddsHTML` con
  el strip de las 3 cuotas, resaltando la ganadora si el partido se jugó.
- `web/css/app.css` — bloques nuevos:
  - "Strip de cuotas grandes — la firma del juego (qa14)"
  - "Match-picker (lista clickeable de partidos por jornada) — qa14"

### Backend

No se tocó. Sigue usando los mismos endpoints (`setResult`, `updateFactors`).

### Archivos clave (estado qa14)

- `web/js/render-admin.js` — match-picker
- `web/js/render-fixtures.js` — strip `.fcard-odds`
- `web/css/app.css` — estilos `.match-picker`, `.mp-*`, `.fcard-odds`, `.fco-*`

---

## qa15 — onEdit trigger: editar el Sheet a mano = mismo efecto que usar la app

**Fecha:** 19 mayo 2026
**Rama:** main

### Qué era el problema

Si Dari (o cualquier admin) escribía el marcador final de un partido **directo en el
Google Sheet** (en lugar de usar Gestión → Cargar resultado en la app), pasaba esto:
- `home_score` y `away_score` quedaban escritos ✅
- `result` (L/E/V) quedaba vacío ❌
- `result_factor` quedaba vacío ❌
- Los puntos/status de los 4 jugadores no se calculaban ❌

Como la app considera "jugado" solo si tiene `result_factor > 0`, el partido seguía
apareciendo como "sin resultado aún" para siempre — aunque tuviera 3-2 escrito.

Caso real: Palestino vs Limache (3-2 del 11 may) había sido cargado a mano en el
Sheet y por eso seguía en la lista de "sin resultado" en la app.

### Qué se construyó

Un **simple trigger `onEdit(e)`** en el Apps Script que se dispara automáticamente
cuando alguien edita una celda del Sheet directamente.

Si la edición fue en:
- la columna del marcador local (`hScore`),
- la columna del marcador visita (`aScore`), o
- cualquiera de las 3 columnas de cuotas (`fl`/`fe`/`fv`),

el trigger ejecuta `recomputeRow_(sheet, row, compId)` que hace exactamente lo mismo
que el endpoint `setResult_`:
1. Calcula el resultado L/E/V según el marcador.
2. Toma el factor correspondiente (Fac L si ganó local, Fac E si empate, Fac V si visita).
3. Lo escribe en la columna `result_factor`.
4. Recalcula los puntos y el status de los 4 jugadores según sus picks.

**Resultado:** ahora da exactamente lo mismo si cargás un resultado desde Gestión
de la app o si lo escribís a mano en el Sheet. Ambos caminos terminan con todas las
columnas calculadas correctamente.

### Detalles técnicos

- **Simple trigger:** la función se llama literalmente `onEdit` → Google la registra
  automáticamente, no hay que crear el trigger desde Triggers en la UI.
- **No dispara en escrituras del Web App:** los `setValue` que hace el propio Apps
  Script (cuando se llama via fetch desde la app) NO ejecutan `onEdit`. Solo edits
  manuales del usuario en el UI del Sheet. Esto evita recursión infinita y trabajo
  duplicado.
- **Idempotente:** editar de nuevo recalcula. No hay riesgo de dañar datos.
- **Edita masivos:** si pegás un rango de celdas, itera todas las filas afectadas.
- **No actúa con marcador incompleto:** si solo cargás home_score sin away_score
  (o vice versa), no hace nada — preserva lo que haya. Solo actúa cuando ambos
  están presentes.

### Reparación retroactiva

Para arreglar los partidos que ya estaban "rotos" (cargados a mano sin factor),
agregamos una función `test_recompute_all()` que itera todas las filas de las 2
hojas y aplica `recomputeRow_` a cada una.

Se ejecutó una vez desde el editor de Apps Script → resultado: **145 filas
actualizadas**. Palestino-Limache (3-2) y todos los demás partidos huérfanos
quedaron con su `result_factor` correctamente computado y los puntos calculados.

### Archivos modificados

- `apps-script/Code.gs` — agregadas funciones `onEdit`, `recomputeRow_`,
  `test_recompute_all`. Inyectadas en producción vía Monaco + guardadas en Drive.

### Backend

El simple trigger no requiere deploy de nueva versión de Web App: corre desde el
código guardado en el script, no desde la versión publicada. La versión publicada
de la Web App (V3) sigue siendo la que sirve los endpoints `state`, `savePicks`,
`setResult`, `addMatch`, `updateFactors`.

### Archivos clave (estado qa15)

- `apps-script/Code.gs` — funciones `onEdit`, `recomputeRow_`, `test_recompute_all`

### Cómo verificar

Si dudás, podés escribir cualquier marcador en el Sheet a mano (en Liga o Experto)
y refrescar la app: el partido debería pasar a "Jugados" automáticamente y los
puntos deberían aparecer.

Para forzar un re-cálculo masivo (por ejemplo después de una migración), ejecutá
`test_recompute_all()` desde el editor de Apps Script.

---

## qa16 — Escudos de equipos en Partidos, Picks y Stats

**Fecha:** 19 mayo 2026
**Rama:** main

### Qué era el problema

Los nombres de los equipos aparecían como texto plano en toda la app. Funcionaba,
pero no se sentía "app de fútbol" — parecía una planilla. El usuario pidió escudos
para darle identidad visual.

### Qué se construyó

Sistema de escudos con CDN público + fallback automático:

1. **Mapeo curado** en `web/data/team-logos.json` — diccionario nombre → ID de
   api-sports.io. ~80 equipos mapeados de Liga, Experto y selecciones.
2. **Módulo helper** `web/js/team-logos.js` con 3 funciones públicas:
   - `loadTeamLogos()` — fetch del JSON una vez, cache en módulo.
   - `teamShieldHTML(name, size)` — devuelve HTML del escudo. `size ∈ 'sm'|'md'|'lg'`.
   - `teamShieldURL(name)` — solo URL, sin wrapper.
3. **Fallback inteligente:** equipos sin mapeo muestran un círculo con las iniciales
   del nombre en color hash determinístico (mismo color para mismo nombre siempre).
   - 2+ palabras → iniciales (ej. "Manchester City" → "MC")
   - 1 palabra → primeras 2 letras (ej. "Liverpool" → "LI")
   - Países entre paréntesis se ignoran ("Real Madrid (ESP)" → "RM")
4. **Carga en bootstrap:** `loadTeamLogos()` se invoca en paralelo a `bootstrapState()`
   en `app.js`, así el JSON está cacheado antes del primer render.

### Dónde se ven los escudos

| Vista | Tamaño | Ubicación |
|---|---|---|
| Partidos · `fcard-home/away` | md (24px) | Junto al nombre del equipo |
| Partidos · strip de cuotas | sm (14px) | Antes de "L · Palestino" y "V · Limache" |
| Picks · `pc-match` | sm (18px) | A ambos lados del "vs" en cada tarjeta |
| Stats · Pick de la Temporada | lg (44px) | Grandes a ambos lados del hero |

### CDN usado

`https://media.api-sports.io/football/teams/{id}.png`

Sin auth, HTTPS, cobertura buena para liga chilena y clubes internacionales. Los logos
se cargan lazy con `<img>` normales, así que no bloquean el render inicial. Si el CDN
falla a futuro, el `onerror` del img dispara el fallback de iniciales.

### Archivos modificados

- `web/data/team-logos.json` (nuevo) — mapeo curado de ~80 equipos
- `web/js/team-logos.js` (nuevo) — helpers `loadTeamLogos`, `teamShieldHTML`, `teamShieldURL`
- `web/js/app.js` — `loadTeamLogos()` en paralelo al bootstrap
- `web/js/render-fixtures.js` — shields en fcard-home/away + strip de cuotas
- `web/js/render-picks.js` — shields en `.pc-match`
- `web/js/render-stats.js` — shields en `.hero-pick-teams`
- `web/css/app.css` — bloque "Escudos de equipos (qa16)" al final

### Cómo agregar un equipo nuevo

Editás `web/data/team-logos.json` y agregás una entrada:

```json
"Nombre exacto como aparece en el Sheet": { "id": 1234 }
```

Para conseguir el ID, buscás el equipo en api-sports.io o en su panel público de teams.
Si no hay ID disponible, podés usar una URL custom:

```json
"Nombre del equipo": { "url": "https://upload.wikimedia.org/.../logo.png" }
```

Refrescás la app y el escudo aparece. No requiere cambios en JS.

### Archivos clave (estado qa16)

- `web/data/team-logos.json` — mapeo (single source of truth)
- `web/js/team-logos.js` — helpers

### Next steps fuera de scope

- **Auto-descubrir IDs faltantes:** script que recorre `state.matches`, lista equipos
  sin mapeo, y consulta una API para sugerir IDs.
- **Self-hosting:** mirror de los logos en `web/assets/escudos/` para no depender de
  api-sports.io si alguna vez bloquean hotlinking.
- **Variante dark mode:** algunos escudos en PNG transparente se ven mal sobre fondo
  oscuro — posible filter CSS o variante de URL.

---

## qa17 — Carga automática de resultados (modo sandbox)

**Fecha:** 21 mayo 2026
**Rama:** main

### Qué se construyó

Una manera de **tirar resultados desde una API de fútbol** sin riesgo de corromper
el Sheet de producción. Toda la importación va a una hoja sandbox separada
(`_API_test`) donde el admin puede revisar antes de promover.

### Por qué sandbox y no escribir directo a Liga

Si la API trae un resultado equivocado, o el matching de equipos falla, los datos
reales del Sheet quedan intactos. La hoja `_API_test` muestra:

| Col | Significado |
|---|---|
| A | Fecha del partido (de la API) |
| B-C | Equipos como los nombra la API |
| D-E | Marcador según la API |
| F | Status (FT, NS, PST, etc.) |
| G | Y/N — si matcheamos contra un partido en Liga |
| H-I | Nombres en el Sheet (vacío si no matchea) |
| J | Fila de Liga donde estaría |
| K | Y/N — si esa fila ya tenía score |
| L | Y/N — si en producción esto escribiría algo nuevo |
| M | Timestamp del import |

Así el admin ve TODA la info para decidir.

### Fuente

**TheSportsDB** vía `thesportsdb.com/api/v1/json/3`. Free, sin API key (la "3" es el
key público de prueba). Cobertura: Liga Chile Primera División = league id `4627`.

**Por qué TheSportsDB y no API-Football:** intenté API-Football primero (mejor tier
nominal), pero su free plan solo cubre seasons 2022-2024. Liga Chile 2026 está
bloqueada. TheSportsDB cubre 2026 gratis. Si en el futuro necesitamos más cobertura
o más detalle (cuotas, lineups), podemos pivotar a API-Football paid tier.

### Setup

**Cero setup** — la API es completamente pública. No hay que crear cuenta ni guardar
keys. El script ya está configurado en producción. La pestaña `_API_test` se crea
automáticamente en la primera ejecución.

### Cómo usar

1. Abrir la app → Gestión → tarjeta "↻ Importar resultados (sandbox)".
2. Elegir rango (default: últimos 7 días → hoy).
3. Click "↻ Importar". Esperar el resumen:
   - `✓ Importados N fixtures a _API_test`
   - `📋 M matched contra Liga · K would_update · J ya tenían score`
   - `❌ Sin matchear: [Equipo X, Equipo Y]`
4. Abrir la pestaña `_API_test` del Sheet → revisar fila por fila.
5. Si hay equipos en "sin matchear", agregar aliases (ver abajo).

### Cómo agregar aliases

Cuando un nombre de equipo en la API no matchea (ej: API dice `"Universidad Catolica"`
pero el Sheet tiene `"U. Católica"`), agregar al objeto `TEAM_ALIASES` en
`apps-script/Code.gs`:

```js
"Universidad Catolica": "U. Católica",
```

Guardar el script. Limpiar sandbox y volver a importar — esta vez matchea.

### Archivos modificados

- `apps-script/Code.gs` — nuevas constantes (`SPORTSDB_BASE`, `SPORTSDB_LEAGUES`,
  `SANDBOX_SHEET_NAME`, `SANDBOX_HEADERS`, `TEAM_ALIASES`), funciones `fetchResults_`,
  `clearSandbox_`, helpers `sportsDBGet_`, `resolveTeamName_`, `ensureSandboxSheet_`,
  `ymd_`, `addDays_`, y la función test `test_fetch_results`. Reutiliza
  `buildMatchIndex_`, `colIndexes_`, `SHEETS.liga.parser`.
- `web/index.html` — nueva acard "Importar resultados (sandbox)" en Gestión.
- `web/js/api.js` — exports `fetchResults`, `clearSandbox`.
- `web/js/render-admin.js` — handlers `importResultsHandler`, `clearSandboxHandler`,
  helper `ymdISO_`, wiring.

### Cronología del trabajo (lo que pasó realmente)

Esta feature requirió 3 deploys y un pivot porque el primer plan no funcionó como
esperábamos:

1. **V4 deploy (api-football)** — primer corte usando API-Football. Setup completo:
   key en Script Properties, OAuth scope `script.external_request` aprobado.
2. **Bloqueo del free tier** — al hacer el primer fetch real descubrimos que el
   plan free de api-sports.io no permite consultar seasons 2025 ni 2026 (solo
   2022-2024). El error en la respuesta:
   `"plan": "Free plans do not have access to this season, try from 2022 to 2024."`
3. **Pivot a TheSportsDB (V5 deploy)** — reescribimos `fetchResults_`, helpers y
   aliases para consumir TheSportsDB que sí cubre Liga Chile 2026 gratis y sin key.
4. **Bug fix de alias (V6 deploy)** — el primer test devolvió 10/11 matched: el
   partido Coquimbo vs Palestino quedaba unmatched. La API dice "Coquimbo Unido"
   pero el Sheet tiene "Coquimbo" a secas. Arreglamos el alias y volvió a 11/11.

### Verificación end-to-end (real, no teórica)

Test final contra el endpoint en producción con rango `2026-02-01 → 2026-05-21`:

```json
{
  "ok": true,
  "source": "TheSportsDB",
  "fetched": 11,
  "matched": 11,
  "would_update": 0,
  "already_filled": 11,
  "unmatched": [],
  "sandbox_sheet": "_API_test"
}
```

Los 11 partidos que la API tiene para la Liga 2026 matchearon todos contra el Sheet,
sus marcadores coinciden con los que ya estaban cargados (`already_filled: 11`),
y la hoja `_API_test` quedó con las 11 filas + 13 columnas de info para validar.

### Nota sobre Script Properties

Durante el camino V4 guardamos `APIFOOTBALL_KEY` en las Propiedades del Script.
Después del pivot a TheSportsDB ya no se usa, pero queda guardada por si en el
futuro pivotamos de vuelta a API-Football (paid tier). No estorba.

### Lo que esta feature NO hace (intencional)

- ❌ **No escribe en `Liga de Primera`.** Cero riesgo de corromper datos reales.
- ❌ **No dispara `onEdit` ni `recomputeRow_`.** Esos solo corren con edición real.
- ❌ **No corre automático.** Solo cuando el admin clickea.
- ❌ **No cubre Experto** todavía (Champions/Libertadores).
- ❌ **No carga cuotas** todavía, solo marcadores.

### Archivos clave (estado qa17)

- `apps-script/Code.gs` — `fetchResults_`, `TEAM_ALIASES`, helpers API
- `web/js/render-admin.js` — `importResultsHandler`

### Next steps (qa18 cuando este corte se valide)

- **Botón "Promover a Liga real":** copia rows con `would_update=Y` del sandbox a
  `Liga de Primera` → `onEdit` dispara → puntos calculados automáticamente.
- **Cron automático:** trigger `everyMinutes(30)` corriendo `fetchResults_` →
  sandbox. El admin solo revisa y promueve.
- **Cobertura Experto:** agregar league IDs (Champions, Libertadores, etc.) a
  `APIFOOTBALL_LEAGUES.experto`.
- **Auto-cuotas:** endpoint `/odds` para Fac L/E/V pre-partido.

---

## qa18 — Bug fix: WO en partidos no jugados (placeholders 0-0)

**Fecha:** 21 mayo 2026
**Rama:** main

### Qué era el problema

El usuario reportó que la planilla tenía "muchos WO en partidos que no se han
jugado". El leaderboard mostraba contadores de WO inflados (ej. Dari pasó de 3 a 9).

### Causa raíz

El `Sheet` tiene como convención poner `0` en las columnas de marcador local/visita
para partidos futuros (placeholder pre-partido). Cuando hicimos `qa15`
(`onEdit` trigger + `test_recompute_all`), la función `recomputeRow_` solo chequeaba:

```js
if (hs == null || as_ == null || isNaN(hs) || isNaN(as_)) return;
```

Pero `0` no es ni `null` ni `NaN`, entonces el chequeo no la frenaba. Resultado:
los partidos futuros con placeholder `0-0` se procesaban como si fueran un **empate
real 0-0** y la función escribía:

- `result = 'E'`
- `result_factor = factor_draw` (la cuota del empate)
- `points = 0` para los 4 jugadores
- `status = 'WO'` para todos los que no tenían pick cargado (la gran mayoría —
  son partidos del futuro)

### El fix

**1. Patch en `recomputeRow_`:** ahora chequea si la fecha del partido es FUTURA
antes de procesar. Si lo es, retorna sin tocar nada:

```js
var todayYMD = ymd_(new Date());
var matchYMD = parsed.match_date;
if (matchYMD && matchYMD > todayYMD) return;
```

**2. Limpieza retroactiva (`test_clean_future_bogus_results`):** función one-shot
que recorre las dos hojas (Liga + Experto) y limpia las filas con:
- `match_date > today` Y
- `result_factor` cargado (síntoma del bug)

Lo que limpia: `result`, `result_factor`, `points` (a 0) y `statuses` (a ' ').
**NO toca picks reales** — los marcadores de los jugadores quedan intactos.

### Resultado de la ejecución

```
clean_future_bogus: 86 filas limpiadas
```

Se limpiaron 86 partidos futuros que estaban mal marcados como "finished".

| Jugador | WO antes | WO después | Δ |
|---|---|---|---|
| Blopa | 19 | 13 | -6 |
| Dari | 9 | 3 | -6 |
| Kmi | 2 | 2 | 0 |
| Pela | 68 | 62 | -6 |

Dari volvió a sus 3 WO originales (que era el valor "estable" antes del bug).

### Archivos modificados

- `apps-script/Code.gs`:
  - `recomputeRow_` ahora chequea `match_date > today` antes de procesar
  - Nueva función `test_clean_future_bogus_results` para reparación retroactiva
- Apps Script Versión 6 sigue activa — el `onEdit` trigger (que es simple trigger,
  no usa la versión publicada) ya corre con el código nuevo.

### Lo segundo que el usuario reportó: "el sistema de detección de resultados no
está funcionando"

Lo investigamos también. El endpoint `fetchResults` sigue funcionando: 11/11
matched. Lo que pasa es que **TheSportsDB tiene cobertura limitada** de Liga
Chile 2026: solo trae 11 partidos cuando deberían haber ~70+ ya jugados a esta
altura del año. La feature funciona, pero la fuente externa está atrasada.

**Conclusión:** la lógica está OK pero la cobertura de TheSportsDB es insuficiente
para reemplazar la carga manual. Para que la importación automática sea útil de
verdad hay que pivotar a una fuente con mejor cobertura (API-Football paid tier,
~$19/mes, o scraping de un sitio público).

### Próximos pasos relacionados

- Evaluar si pagar API-Football paid tier vale la pena para automatizar carga.
- O simplemente dejar la importación manual + el botón "↻ Importar" como
  herramienta de validación cuando aparezca data.

---

## qa19 — Pivot a ESPN API (8x mejor cobertura)

**Fecha:** 21 mayo 2026
**Rama:** main

### Qué era el problema

TheSportsDB (qa17) tenía cobertura miserable para Liga Chile 2026: solo **11
partidos** disponibles cuando deberían haber ~80+ ya jugados. La feature de
importación automática funcionaba técnicamente pero era inútil en la práctica.

### Qué se construyó

Pivot a **ESPN's public scoreboard API** que:
- Es completamente free, sin auth, sin API key
- Cubre Liga Chile 2026 con **92 partidos** (vs 11 de TheSportsDB)
- Endpoint: `https://site.api.espn.com/apis/site/v2/sports/soccer/chi.1/scoreboard`
- Soporta filtro por fechas: `?dates=YYYYMMDD-YYYYMMDD`

### Cambios en el backend

**Constantes nuevas** (reemplazan las de TheSportsDB):
```js
var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
var ESPN_LEAGUES = {
  liga: { slug: 'chi.1' }   // Chile Primera División
};
```

**Helpers nuevos:**
- `espnGet_(path, params)` — wrapper de UrlFetchApp con muteHttpExceptions
- `espnFetchRange_(leagueSlug, fromYMD, toYMD)` — pagina mes a mes porque ESPN
  retorna ~30 días por request, con dedup por event id
- `ymdCompact_(d)` — formato `YYYYMMDD` que ESPN espera

**`fetchResults_` reescrito** para parsear el shape de ESPN:
```
events[].date                                  → fixture date
events[].competitions[0].competitors[]         → array con homeAway: home/away
  .team.displayName                            → nombre equipo
  .score                                       → marcador
events[].status.type.name | .description       → STATUS_FULL_TIME | "Full Time"
```

**Aliases agregado:** `"Everton CD" → "Everton"` (ESPN usa el nombre completo).

### Verificación end-to-end

Test contra el endpoint en producción con rango `2026-02-01 → 2026-05-21`:

```json
{
  "ok": true,
  "source": "ESPN",
  "fetched": 92,
  "matched": 77,
  "would_update": 0,
  "already_filled": 77,
  "unmatched": ["Huachipato", "Universidad de Concepción", "O'Higgins", ...]
}
```

**77 / 92 = 84% cobertura** (vs 14% antes). Salto de 8x.

### Por qué 15 partidos quedan unmatched

Los nombres de equipos en `unmatched` ya tienen aliases configurados. El bug es
de **timezone**: ESPN guarda fechas en UTC, mientras que el Sheet usa fechas
chilenas locales. Partidos jueves 21h Chile = viernes UTC, entonces el
`matchId = sha1(comp + home + away + date)` no matchea.

**Fix planeado (qa20):** modificar `buildMatchIndex_` o `resolveTeamName_` para
intentar el match con `±1 día` además del día exacto. Es polish, no rompe nada
crítico.

### Archivos modificados

- `apps-script/Code.gs`:
  - Reemplazo de constantes TheSportsDB por ESPN
  - `fetchResults_` reescrito para el shape de ESPN
  - Helpers nuevos: `espnGet_`, `espnFetchRange_`, `ymdCompact_`
  - Removidos: `sportsDBGet_`, `SPORTSDB_BASE`, `SPORTSDB_LEAGUES`
- Apps Script **Versión 7** deployada

### Roadmap actualizado

- **qa20 (next):** matching con tolerancia de ±1 día para resolver los 15
  partidos unmatched por timezone.
- **qa21:** botón "Promover a Liga real" que copia rows con `would_update=Y`
  del sandbox a producción.
- **qa22:** cron `everyMinutes(30)` durante días de partido para auto-sync.
- **qa23:** cobertura Experto (Champions, Libertadores) con sus respectivos
  ESPN league slugs.

---

## qa20 — Partidos futuros separados de unmatched

**Fecha:** 22 mayo 2026
**Rama:** main

### Qué era el problema

En la respuesta del endpoint `fetchResults` los partidos PROGRAMADOS para el
futuro caían dentro del cubo `unmatched` o `already_filled` cuando en realidad
no son "sin resultado" — simplemente no se han jugado todavía. La distinción
es importante para que el admin sepa qué requiere acción (cargar resultado) y
qué es info nomás (partido que va a pasar).

### Qué se construyó

Regla en `fetchResults_`: si la fecha del partido es posterior a `today_YMD`:

1. El campo `status` en el sandbox se reemplaza por `"Programado · se juega YYYY-MM-DD"`.
2. El partido **no cuenta** en `unmatched` (era ruido falso).
3. El partido **no cuenta** en `already_filled` ni `would_update`.
4. Se cuenta en una nueva categoría `future` que va en la respuesta.

### Estructura de la respuesta (actualizada)

```json
{
  "ok": true,
  "source": "ESPN",
  "fetched": 31,
  "matched": 21,
  "would_update": 0,
  "already_filled": 5,
  "future": 22,
  "unmatched": ["Coquimbo Unido", ...],
  "sandbox_sheet": "_API_test"
}
```

Interpretación:
- **fetched** total que devolvió ESPN
- **matched** filas que encontraron correspondencia en el Sheet (toda fecha)
- **would_update** marcador disponible y el Sheet vacío → listo para promover
- **already_filled** el Sheet ya tiene marcador cargado
- **future** partidos posteriores a hoy (programados, sin resultado todavía)
- **unmatched** SÓLO partidos jugados que no encuentran fila en el Sheet
  (los que requieren agregar alias o investigar)

### Frontend

`importResultsHandler` ahora muestra una línea adicional en el resumen:

```
✓ Importados 31 fixtures a _API_test
📋 21 matched contra Liga · 0 would_update · 5 ya tenían score
📅 22 partidos futuros (programados, sin resultado todavía)
❌ Sin matchear (jugados pero ausentes del Sheet): Coquimbo Unido, ...
```

### Archivos modificados

- `apps-script/Code.gs` — `fetchResults_` calcula `isFuture` y categoriza
- `web/js/render-admin.js` — handler muestra la línea `future`
- Apps Script **Versión 8** deployada

### Notas

- Los unmatched que quedan (~8 equipos) corresponden a partidos pasados con
  timezone shift. Esto se resolverá en qa21 (matching con tolerancia ±1 día).
- La diferencia entre los 92 partidos totales de la season y los 21+22+... del
  rango es porque el rango (15 may → 15 jun) cubre solo ~1 mes de Liga.

---

## qa21 — Propuestas de cuotas (Fac L/E/V) desde API externa

**Fecha:** 22 mayo 2026
**Rama:** main

### Qué era el problema

El usuario evaluó la importación automática de resultados (qa17-qa20) y dijo
"no tuvo muy buena venta" — la cobertura de partidos jugados era OK pero
escribir resultados es la parte fácil del flujo manual. **Lo que de verdad
agrega valor es traer las cuotas pre-partido** (Fac L/E/V) que hoy se cargan
una por una en Gestión.

### Qué se construyó

Nuevo flujo de "propuestas de cuotas" en Gestión:

1. **Backend**: endpoint `fetchOdds` que consulta ESPN Core API (que tiene
   cuotas de DraftKings en formato decimal) para los próximos partidos.
2. **Frontend**: card "🎯 Importar cuotas (propuesta · Fac L/E/V)" en Gestión
   que muestra una lista de partidos con cuotas API + cuotas actuales del
   Sheet + botón "Aplicar al fixture" por partido.
3. **Aplicación**: click "Aplicar" → confirm con resumen → llama
   `updateFactors` (endpoint existente de qa12) → cuotas escritas al Sheet.

Es propuesta + revisión + aplicación manual por match. Nada se aplica solo.

### Por qué ESPN core API y no la scoreboard

La scoreboard API (`site.api.espn.com`) solo trae `drawOdds.moneyLine` para
Liga Chile — falta L y V. La **core API** (`sports.core.api.espn.com`)
sí trae `homeTeamOdds`, `drawOdds`, `awayTeamOdds` con sub-objetos
`current.moneyLine.decimal` (formato decimal directo).

Trade-off: necesita una llamada extra por partido (vs los datos venir
embebidos), pero el rate limit de ESPN es generoso y el cache del Apps Script
amortigua.

### Conversión de formato

ESPN provee:
- En core API: `.current.moneyLine.decimal` (ya decimal, listo)
- Fallback: `.moneyLine` raw (American odds, ej. `+155`, `-110`)

Helper `americanToDecimal_(ml)`:
- Acepta número (raw American) o objeto (`{decimal, american, value}`).
- Convierte American → Decimal: `am > 0 ? am/100+1 : 100/|am|+1`.

### Estructura de la respuesta

```json
{
  "ok": true,
  "source": "ESPN Core API · DraftKings",
  "proposals": [
    {
      "match_id": "7c77d093-4ae2-59f6-80d3-dca398119e22",
      "match_date": "2026-05-22",
      "home_team": "Everton",
      "away_team": "Coquimbo",
      "provider": "DraftKings",
      "proposal": { "fl": 2.9, "fe": 3.15, "fv": 2.55 },
      "current":  { "fl": 2.9, "fe": 3.20, "fv": 2.40 }
    }
  ],
  "skipped_no_odds": 6,
  "skipped_unmatched": 3
}
```

### Verificación

Test contra rango `2026-05-22 → 2026-06-05` (V9 live):
- 6 propuestas con cuotas completas
- 6 partidos skip por no tener odds publicadas todavía
- 3 partidos skip por no matchear contra Sheet (timezone — fix qa22)

### Archivos modificados

- `apps-script/Code.gs`:
  - Nuevo case `'fetchOdds'` en `handle()`
  - Función `fetchOdds_(p)` que itera events de ESPN scoreboard + core API
  - Helpers `americanToDecimal_(ml)` y `espnGetCore_(path)`
- `web/index.html` — card nueva "🎯 Importar cuotas (propuesta)" en Gestión
- `web/js/api.js` — export `fetchOdds`
- `web/js/render-admin.js` — `fetchOddsHandler`, `renderProposal_`,
  `applyProposalHandler` + wiring del botón
- `web/css/app.css` — bloque "Propuestas de cuotas (qa21)" con estilos
  `.prop-row`, `.prop-odds`, `.prop-cell`, `.prop-apply`
- Apps Script **Versión 9** deployada

### Cómo usar

1. Gestión → tarjeta "🎯 Importar cuotas (propuesta · Fac L/E/V)"
2. Elegir rango (default: hoy → 14 días adelante)
3. Click "🎯 Traer propuestas" → aparece lista de partidos próximos
4. Para cada partido ves:
   - Equipos + fecha
   - 3 cajas con las cuotas API (L / Empate / V)
   - Cuotas actuales del Sheet en chico (para comparar)
   - Botón "★ Aplicar al fixture"
5. Click "Aplicar" → confirm con los valores → cuotas escritas al Sheet

### Próximos pasos

- **qa22:** matching con tolerancia ±1 día para resolver los 3 skipped por
  timezone shifts (Coquimbo Unido aparece como skip en 2026-05-22 porque la
  fecha API y la del Sheet difieren).
- **qa23:** botón "Aplicar todos los que cambiaron >5%" para aprobar batch.
- **qa24:** cron `everyHours(6)` para sincronizar cuotas automáticamente
  durante los días previos a la jornada.

---

## qa22 — Limpieza de placeholders 0-0 heredados del seed

**Fecha:** 22 mayo 2026

### Qué era el problema

El usuario preguntó por qué todos los partidos futuros de Liga de Primera tenían
`0-0` en el Sheet, sospechando que eran placeholders y no resultados reales.

### Investigación del origen

Auditamos todas las funciones del backend que pueden escribir en las columnas
`hScore`/`aScore`:

| Función | ¿Escribe `0`? | Conclusión |
|---|---|---|
| `addMatch_` | ❌ Rellena con `''` (vacío) | OK |
| `setResult_` | ⚠️ Solo con marcador explícito de Gestión | OK |
| `savePicks_` | ❌ Solo toca columnas de picks | OK |
| `onEdit` / `recomputeRow_` | ❌ No escribe scores | OK (post qa18) |
| `updateFactors_` | ❌ Solo toca cuotas | OK |

→ **Ninguna función escribe `0` automáticamente.** Los `0-0` fueron
**insertados durante la carga inicial del Sheet**, probablemente al importar
un CSV/Excel template donde las columnas de marcador venían pre-rellenadas
con 0, o por un "fill down" manual al crear las filas.

### Consecuencias que tenía

143 partidos con fecha futura con `0-0` literal. Eso causó:
1. **Bug WO de qa18**: las celdas 0+0 se procesaban como empate real
   (`recomputeRow_` leía 2 números válidos, computaba `result='E'`, asignaba
   `result_factor=factor_draw`, y los jugadores sin pick salían WO).
2. **Confusión semántica**: si alguien miraba el Sheet sin pasar por la app,
   veía marcadores 0-0 en partidos que no se habían jugado.

### Qué se construyó

Función one-shot `test_clean_future_placeholders` que recorre Liga + Experto y,
para cada fila con `match_date > today`, **borra el contenido** de las
columnas de marcador. Nada más se toca (picks, cuotas, resultados, status
quedan intactos).

### Resultado

```
clean_future_placeholders: 143 filas limpiadas
```

Verificación post-cleanup:
- Partidos futuros con 0-0 placeholder: **0** ✅
- Partidos futuros con score vacío (null): 222 (correcto, ahora reflejan que
  no se han jugado)
- Partidos pasados con 0-0 (resultados reales 0-0): 15 (intactos, son
  empates reales con result_factor cargado)

### Archivos modificados

- `apps-script/Code.gs` — agregada `test_clean_future_placeholders`
- Apps Script Versión 9 sigue activa — la limpieza corrió desde el editor
  (no necesita deploy, no es un endpoint público)
