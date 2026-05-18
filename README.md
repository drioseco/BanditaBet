# BanditaBet · PRODE 2026

Webapp del prode/pollagol entre amigos. Liga chilena + ligas extranjeras + selecciones.
4 jugadores: **Dari, Kmi, Blopa, Pela**. 15° aniversario.

**▶ En vivo:** https://banditabet-kelpie-a4cd33.netlify.app/

---

## Arquitectura

**Full Google. Sin servidores, sin base de datos externa, sin tarjeta de crédito.**

```
┌───────────────────────────┐
│  Google Sheet             │  ← Tus amigos siguen editando acá.
│  (Liga, Experto, …)       │     ES la base de datos. No hay otra.
└─────────┬─────────────────┘
          │   SpreadsheetApp.getActive()
          ▼
┌───────────────────────────┐
│  Apps Script Web App      │  ← Backend completo.
│  doGet  → state JSON      │     Lee el Sheet, devuelve el snapshot
│  doPost → savePicks /     │     completo en JSON, recibe escrituras
│           setResult /     │     (picks/resultados) y las graba al
│           addMatch        │     Sheet directamente.
└─────────┬─────────────────┘
          │   fetch(URL) desde el frontend
          ▼
┌───────────────────────────┐
│  Frontend HTML estático   │  ← Vive en GitHub Pages, Netlify Drop
│  apunta a Apps Script URL │     o un file:// local. Cero hosting.
└───────────────────────────┘
```

**El Sheet es la fuente de verdad real.** Los amigos pueden seguir editando el Excel a mano. La webapp lee de ahí y escribe ahí. No hay sincronización a mantener — es la misma base.

---

## Estructura del repo

```
BanditaBet/
├── README.md                       ← este archivo
├── CLAUDE.md                       ← instrucciones de proyecto
│
├── apps-script/                    ← BACKEND (vive en el Sheet)
│   ├── Code.gs                     ← doGet, doPost, state, savePicks, setResult, addMatch
│   └── README.md                   ← cómo deployar la Web App paso a paso
│
├── web/                            ← FRONTEND (HTML estático)
│   ├── index.html
│   ├── css/
│   │   ├── tokens.css              ← variables de marca BB
│   │   ├── app.css                 ← estilos generales
│   │   └── game-fx.css             ← confetti, badges, countdowns
│   ├── js/
│   │   ├── config.js               ← ⚠️ pegar acá la URL del Apps Script
│   │   ├── state.js                ← estado global
│   │   ├── api.js                  ← cliente HTTP del Apps Script
│   │   ├── auth.js                 ← selector de jugador (sin OAuth)
│   │   ├── game-fx.js              ← confetti, countdowns, badges
│   │   ├── render-home.js
│   │   ├── render-fixtures.js
│   │   ├── render-picks.js
│   │   ├── render-stats.js
│   │   ├── render-admin.js
│   │   ├── logo.jsx                ← BB logo (React + Babel inline)
│   │   └── app.js                  ← entry point + picker modal
│   └── data/
│       └── seed.json               ← fallback offline (3 fixtures placeholder)
│
├── scripts/                        ← UTILIDADES (opcionales)
│   └── import-v1.js                ← genera seed.json del v1 (offline)
│
└── _legacy/                        ← (no se usa) backup del intento con Supabase
    ├── api/                        ← Express + Node.js + Supabase client
    └── db/                         ← schema.sql + RLS policies
```

---

## Setup paso a paso

### 1. Apps Script (backend) — 5 minutos

Seguí la guía completa en [`apps-script/README.md`](./apps-script/README.md). Resumen:

1. Abrir el [Google Sheet](https://docs.google.com/spreadsheets/d/1HUzknfCv_vbcLE2EXyOPziXlOTu4ZSF5mXXWZyl8D6k/edit) → **Extensiones → Apps Script**.
2. Pegar [`apps-script/Code.gs`](./apps-script/Code.gs).
3. **Deploy → New deployment → Web app**:
   - *Execute as:* Me
   - *Who has access:* Anyone with the link
4. Copiar la URL deployada (`https://script.google.com/macros/s/.../exec`).
5. Probar en el browser: `URL?action=health` debería devolver `{ok:true}`.

### 2. Frontend — 1 minuto

1. Abrir [`web/js/config.js`](./web/js/config.js).
2. Pegar la URL del Apps Script en `API_URL`:
   ```javascript
   API_URL: overrides.API_URL || 'https://script.google.com/macros/s/.../exec',
   ```
3. Listo.

### 3. Probar localmente

**Opción A · doble clic en `web/index.html`**
Funciona, pero algunos browsers bloquean `fetch()` desde `file://`. Si ves errores de CORS, usá la opción B.

**Opción B · servidor local de 30 segundos**

```bash
cd web
python3 -m http.server 5500
# Abrir http://localhost:5500
```

o con Node:

```bash
npx http-server web -p 5500
```

o con la extensión "Live Server" de VS Code.

### 4. Publicar para tus amigos

La forma más simple, cero infraestructura, gratis:

**Netlify Drop** (recomendado para empezar):
1. Ir a [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastrar la carpeta `web/` ahí.
3. Te da una URL del tipo `https://bandita-bet.netlify.app` que podés compartir.

**GitHub Pages** (si ya usás GitHub):
1. Crear repo, push del proyecto.
2. Settings → Pages → Source: branch `main`, folder `/web`.
3. URL `https://<user>.github.io/<repo>/`.

**Cloudflare Pages** / **Vercel**: también gratis, conectás el repo y se redeploya solo.

---

## Modelo de datos

Vive en el Sheet, no hay otra DB. Cada pestaña es una "competencia":

| Pestaña                | Competencia       |
|------------------------|-------------------|
| `Liga de Primera`      | `liga`            |
| `Partidos Experto`     | `experto`         |

El [`Code.gs`](./apps-script/Code.gs) tiene los índices de columnas en `colIndexes_()`. Si reordenás las columnas del Sheet, hay que ajustar esos índices.

**IDs determinísticos:** cada match se identifica por `sha1(competition + home + away + date)`. Eso permite que el backend siempre encuentre la fila correcta sin importar dónde esté.

---

## Sistema de puntos (regla del juego)

| Resultado del pick                       | Puntos              |
|------------------------------------------|---------------------|
| **Pleno** (marcador exacto)              | `3 × factor`        |
| **Acierto** (resultado correcto, marcador erróneo) | `1 × factor` |
| **Miss**                                 | `0`                 |
| **WO** (no marcó antes del partido)      | `0`                 |

El recálculo de puntos lo hace `setResult_()` en `Code.gs` cuando se carga un marcador. Escribe los puntos y el status en las columnas correspondientes del Sheet (las mismas que ya usaba el v1).

---

## Toque de juego

- **Confetti** al guardar picks y al confirmar resultados.
- **Badges** desbloqueables: pleno solo, racha x3 / x5, jornada perfecta, sin un solo WO.
- **Countdown live** al próximo partido.
- **Banner "última sincronización"** visible en el header (responde al pedido original).
- **Live pulse rojo** cuando hay partidos en curso (≤ 3h después del horario).
- **Modal de "¿Quién sos?"** la primera vez que entrás — guardás tu elección en localStorage.
- **Mobile-first** agresivo: 2 columnas en picks, 1 columna en admin, header colapsable.

---

## Cosas que no necesitamos más

Comparado con la versión Supabase que probamos antes:

- ❌ Node.js / Express
- ❌ Supabase (Postgres + Auth + RLS)
- ❌ HMAC entre frontend y backend
- ❌ Magic link / OAuth
- ❌ Webhook desde el Sheet (porque el "backend" YA vive en el Sheet)
- ❌ Hosting backend (Render / Railway / Fly)
- ❌ Variables de entorno secretas

Lo que sí queda:
- ✅ El Sheet de siempre
- ✅ Un script en Google Apps Script (gratis, infinito)
- ✅ HTML estático servido donde sea (gratis)
- ✅ Tarjeta de crédito: NO necesaria

---

## Roadmap

- [x] Backend Apps Script con state/savePicks/setResult/addMatch
- [x] Frontend modular con confetti/badges/countdown
- [x] Picker modal con persistencia local
- [ ] Deploy: pegar URL en `config.js` y publicar en Netlify/GitHub Pages
- [ ] Validar contra el Sheet real (puede haber ajustes de columnas)
- [ ] Endurecer auth: agregar PIN de 4 dígitos por jugador (opcional)
- [ ] Stats avanzados: head-to-head, mejor jornada, peor racha
- [ ] Notificaciones (Telegram bot al lado del Apps Script, opcional)

---

## Backup de la versión Supabase

Si en algún momento la app crece y necesitamos Postgres real, todo el código de la versión anterior quedó en [`_legacy/`](./_legacy/):
- `_legacy/api/` — backend Node.js + Express con endpoints REST y HMAC.
- `_legacy/db/schema.sql` — schema completo de Postgres con triggers de cálculo y RLS.

Es funcional y migrable. Por ahora, no se usa.
