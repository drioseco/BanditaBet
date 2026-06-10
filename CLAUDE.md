# BanditaBet · contexto para Claude

Actúa como director de proyecto. Dari (yo) te da inputs y vos contrastás con lo
hecho, sugerís próximos pasos y mantenés el roadmap claro.

PRODE/polla entre amigos (4 jugadores: **Dari, Kmi, Blopa, Pela**). 15° aniversario.
Liga Chile + "Experto" (copas/ligas extranjeras) + un Hub de fútbol (piloto).

---

## ⚠️ CRÍTICO — leé esto antes de tocar el backend

**El backend (`apps-script/Code.gs`) vive en DOS lugares y se desincronizan fácil:**
1. El **repo** (`apps-script/Code.gs`) — control de versiones.
2. El **editor de Apps Script** de Google — lo que realmente corre en producción.

**El editor NO lee del repo.** Cada cambio requiere pegar el archivo a mano y
redeployar. Históricamente alguien parchó cosas directo en el editor sin
commitearlas → el repo quedó desactualizado.

**Regla de oro:** el repo es la fuente de verdad. Antes de deployar, asegurate
de que `apps-script/Code.gs` del repo está completo y correcto. Después de
cualquier fix en el editor, **commiteá ese mismo cambio al repo**.

> 🔥 **Lo que ya pasó (qa28):** al deployar el Hub desde el repo, se pisó un
> arreglo de columnas de Experto que vivía SOLO en el editor (nunca commiteado).
> La tabla dejó de sumar Experto. Se reparó y se commiteó. **Que no vuelva a pasar.**

### Deployar Code.gs (método verificado)
1. `cat apps-script/Code.gs | pbcopy`
2. Editor de Apps Script → `Cmd+A` → `Cmd+V` → `Cmd+S` (o botón disco).
3. Implementar → Gestionar implementaciones → ✏️ Editar → Versión → **Versión nueva** → Implementar.
4. La URL del Web App **no cambia**.
5. Si Claude inyecta por consola: usar **hex + verificación de hash** (base64 se
   corrompía: un carácter se mangleaba en el canal). Ver qa28 en el changelog.

---

## Mapa de columnas de las hojas (EN PIEDRA — base 0)

Si el parser lee mal, es casi seguro un corrimiento de columnas. Referencia
autoritativa (verificada contra la hoja real, jun 2026):

### `Liga de Primera` (headerRows: 2)
```
0 fecha/jornada · 1 venue · 2 date · 3 (vacío) · 4 home · 5 hScore · 6 aScore
· 7 away · 8/9/10 factor L/E/V · 11-18 picks (Dari L/V, Kmi L/V, Blopa L/V, Pela L/V)
· 19 result · 20 result_factor · 25-28 points (Dari/Kmi/Blopa/Pela) · 29-32 status
```

### `Partidos Experto` (headerRows: 2) ⚠️ tiene una **columna C (idx 2) vacía**
```
0 # · 1 TORNEO · 2 (VACÍA) · 3 DIA · 4 LOCAL · 5 L(gol) · 6 V(gol) · 7 VISITA
· 8/9/10 factor L/E/V · 11-18 picks · 19 result · 20 result_factor
· 25-28 points · 29-32 status
```
**De LOCAL (col 4) en adelante es idéntico a Liga.** La única diferencia: round
está en col 1 (TORNEO) y la fecha en col 3 (por la columna vacía). Esto está
codificado en `parseExpertoRow` y `colIndexes_('experto')`.

---

## URLs e infra (producción)

| Recurso | Valor |
|---|---|
| **App en vivo** | https://bandita-bet.vercel.app/ (Vercel, auto-deploy desde GitHub en cada push) |
| Backend (Apps Script Web App) | `https://script.google.com/macros/s/AKfycbwEUrzwgUgG6702bwFk3JZP_ujkSSsYaOyytku35K7k6v02GGSjvFIMDuYE2tVJcP0d1A/exec` |
| Editor Apps Script | project `1WvSH9Vqdol70scNeg6WeBzdaWWo3B-76_wqxzge509ofvetgAVCiRIyI` |
| Google Sheet (DB) | `1HUzknfCv_vbcLE2EXyOPziXlOTu4ZSF5mXXWZyl8D6k` |
| Repo | https://github.com/drioseco/BanditaBet (privado) |

- **Hosting = Vercel** (migrado de Netlify en qa11; la URL de Netlify del README
  viejo está muerta). El frontend (`web/`) se publica solo con `git push`.
- El backend (Code.gs) **NO** se auto-deploya — es manual (ver arriba).

---

## Features y estado (post-qa28, jun 2026)

- **Polla**: tabla/leaderboard (Liga + Experto sumados), picks, crónica auto,
  stats, fixtures, gestión. Tabla real: Blopa 377 · Dari 374 · Kmi 341 · Pela 187.
- **Hub de fútbol (piloto, qa26-27)**: pestaña nueva con datos oficiales en vivo
  de ESPN (Liga Chile, Libertadores, Sudamericana): tabla de posiciones +
  simulador de eliminatorias (proyectado desde los grupos, el sorteo real 2026
  aún no existe). Acción backend `?action=hub`. Cacheado server-side.
  - Standings de ESPN: usar host `apis/v2` (NO `apis/site/v2`) + `?season=YYYY`.
  - Scoreboard/fixtures: `apis/site/v2/.../scoreboard`.
- **Herramienta portátil**: `tools/bracket-simulator/` — simulador de bracket
  standalone (vanilla JS, sin deps), para llevar a otros proyectos.

---

## Pendientes / setup conocido

- ⚠️ **Agente IA del Hub (qa33) — requiere `ANTHROPIC_API_KEY`.** El Hub tiene una
  pestaña "Pregúntale IA" que consulta la Claude API con búsqueda web server-side
  (`hubAsk_` en Code.gs → `web_search_20260209`). Falta setear la key:
  Apps Script → Configuración del proyecto → Propiedades del script →
  `ANTHROPIC_API_KEY`. Sin ella devuelve `ai_not_configured`. **Es pago por uso.**
  Controles: caché rápido en memoria (6h) + **base permanente en la pestaña
  `_AI_cache` del Sheet** (la IA marca cada respuesta `permanente`/`temporal` con
  `[[VIGENCIA: ...]]`; solo las permanentes —ej. "quién ganó el Mundial 2014"— se
  guardan para siempre y se responden gratis sin volver a la API) + tope diario
  `AI_DAILY_CAP` (80). Modelo en `AI_MODEL` (`claude-sonnet-4-6`; bajar a
  `claude-haiku-4-5` para abaratar). Es el primer endpoint que **escribe a una API
  externa de pago**.
- **Gestión abierta (qa30):** se eliminó el PIN de admin. Cualquiera de los 4
  puede cargar resultados / fixtures desde la app (ya no hay `assertAdmin_` ni
  `ADMIN_PIN`). Si en el futuro se quiere volver a proteger, ver el historial
  de qa23.
- ⚠️ **Clave de escritura `WRITE_KEY` (qa44 · /cso).** La Web App es pública, así
  que sin protección cualquiera con la URL podía escribir (savePicks, setResult,
  addMatch…) y gatillar la IA paga. Fix: las acciones mutadoras + de IA exigen
  `p.key === WRITE_KEY` (`assertWrite_`/`WRITE_ACTIONS` en Code.gs). **Para
  activarlo: setear `WRITE_KEY` en Script Properties** (Dari elige el valor, igual
  que la API key). **Si no está seteada, se permite todo (fail-open)** → el deploy
  no rompe nada; la protección se activa al poner la propiedad. En el frontend la
  clave se guarda en `localStorage.bb_write_key`; si el backend la rechaza, la app
  la pide una vez y reintenta. Lecturas (state/hub) quedan abiertas.
  Defensa #2: el frontend ahora **escapa con `escapeHtml`** los nombres de equipo
  del Sheet antes de `innerHTML` (anti-XSS almacenado).
- **📺 Modo VAR (qa40) — override de picks olvidados (anti-WO).** En Gestión hay
  un panel "Modo VAR" que corrige un pick que se pasó a WO (no se cargó a tiempo)
  **aunque el partido ya tenga resultado** — `savePicks_` bloquea picks de partidos
  jugados, así que esto es la única vía. Acción backend `varOverride` (`varOverride_`
  en Code.gs): escribe el pick saltando el candado y **recalcula puntos/estado de
  ese jugador** (pleno/acierto/0). Solo Dari, vía constante **`VAR_CODE`** (default
  `'bandita-var'`) que vive SOLO en Code.gs (editor/repo privado), nunca en el
  frontend de Vercel. Cambiá el valor en la constante cuando quieras; la comparación
  es case-insensitive. Si el código está mal → `var_denied` ("el VAR no te reconoce").
- Hub: faltan fases F2 (calendario), F4 (goleadores). F1 (tablas) y F3/F5
  (eliminatorias + simulador) están vivas.

---

## Decisiones que NO se revierten sin discutir

1. Backend = Google Sheet + Apps Script. Sin servidores, sin DB externa.
2. Hub es **solo lectura** y **independiente** de la polla (no la toca).
3. El repo es la fuente de verdad del Code.gs (ver sección CRÍTICO).

---

## Cómo NO hacer las cosas (lecciones)

- ❌ Deployar Code.gs sin verificar que el repo está completo → pisás parches
  vivos (pasó en qa28).
- ❌ Bumpear `?v=` cache-bust en unos archivos sí y otros no → instancias
  duplicadas de módulos ES. Bumpealo en TODOS a la vez.
- ❌ Inyectar código por consola con base64 sin verificar hash → se corrompe.
  Usar hex + SHA check.
