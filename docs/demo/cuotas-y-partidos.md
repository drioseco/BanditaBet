# Demo · Cuotas y Partidos en BanditaBet

Guía paso a paso de los 4 features que tocan cuotas y partidos.
**App live:** https://bandita-bet.vercel.app

---

## 1️⃣ Strip de cuotas grande en Partidos

**Qué vas a ver:** Cada tarjeta de partido muestra **Fac L / Empate / Fac V** en tipografía grande, con escudos de los equipos. Las cuotas son la "firma" del juego (cuánto vale cada resultado), así que están bien visibles.

**Pasos:**
1. Andá a **Partidos** (nav superior).
2. Elegí torneo: **Liga de Primera** o **Partidos Experto**.
3. Elegí una jornada (default: la próxima).
4. Cada partido se ve así:

```
24 may · 🛡️  U. Católica   vs   Colo Colo  🛡️
              L · U. Católica     EMPATE     V · COLO COLO
                  2.40             3.20         2.80
              ─────────────────────────────────────────────
                DARI       KMI       BLOPA      PELA
                 1-1        2-1       1-1        —
```

**Para partidos ya jugados:** la cuota del resultado ganador se resalta en
amarillo con una estrella ★ (se "marca" cuál se pagó).

---

## 2️⃣ Editor inline de cuotas faltantes

**Qué vas a ver:** Si un partido no tiene cuotas cargadas todavía y no se
jugó, aparece una franja amarilla dentro de la tarjeta con 3 inputs
(Fac L / Fac E / Fac V) + botón **Guardar**.

**Pasos:**
1. Andá a **Partidos**.
2. Buscá un partido futuro sin cuotas → vas a ver la franja **"Cargar cuotas:"**.
3. Escribí los 3 valores. Por ejemplo: `2.50 / 3.10 / 2.80`.
4. Click **★ Guardar** → la franja desaparece y las cuotas aparecen como strip grande.

**Quién puede usarlo:** cualquier Bandita logueado. Es como crowdsourcing — si
alguien ve cuotas online, las puede cargar al toque sin pasar por Gestión.

> Backend: usa el endpoint `updateFactors_` (qa12) que solo toca las 3 celdas
> de cuotas en el Sheet, sin tocar marcador/picks/puntos.

---

## 3️⃣ Match-picker en Gestión

**Qué vas a ver:** En vez de un dropdown con 200+ partidos, hay un selector
corto de **jornadas** + una lista clickeable de partidos de esa jornada.

**Pasos:**
1. Andá a **Gestión**.
2. Tarjeta **"Editar cuotas (Fac L / E / V)"**.
3. Elegí torneo (Liga / Experto).
4. Elegí jornada en el dropdown corto.
5. La lista de partidos de esa jornada aparece abajo con:
   - Fecha · equipos · badge ("sin cuotas" en rojo / cuotas en verde / resultado en gris)
6. Click en un partido → los inputs se pre-llenan con las cuotas actuales.
7. Modificá lo que quieras → **★ Actualizar cuotas**.

**Toggle "solo sin cuotas"** (activado por default): filtra la lista para
mostrar solo los partidos que **necesitan** cuotas — te ahorra ruido.

---

## 4️⃣ Propuestas de cuotas (qa21 · la feature nueva)

**Qué vas a ver:** Una tarjeta que **trae cuotas L/E/V desde DraftKings** vía
ESPN, las compara con las del Sheet, y te permite aplicar match por match.

**Pasos:**
1. Andá a **Gestión**.
2. Scroll hasta la tarjeta **"🎯 Importar cuotas (propuesta · Fac L/E/V)"**.
3. Elegí rango:
   - Desde: **hoy** (default)
   - Hasta: **14 días adelante** (default)
4. Click **🎯 Traer propuestas**.
5. Aparece una lista de partidos con:

```
22 may · Everton vs Coquimbo
   ┌──────┐  ┌──────┐  ┌──────┐
   │ 2.90 │  │ 3.15 │  │ 2.55 │       ★ Aplicar al fixture
   │Fac L │  │Empate│  │Fac V │
   └──────┘  └──────┘  └──────┘
   Actual: L:2.90 E:3.20 V:2.40
```

6. Click **★ Aplicar al fixture** en el partido que quieras.
7. Confirm pop-up: *"¿Aplicar cuotas L:2.90 E:3.15 V:2.55 a Everton vs Coquimbo?"*
8. Aceptar → cuotas escritas al Sheet, botón pasa a **✓ Aplicado** (verde).

> Fuente: ESPN Core API → DraftKings. Sin API key, sin auth, formato decimal directo.

### Categorías que vas a ver

| Resultado | Significado |
|---|---|
| **N propuestas** | Partidos con cuotas API disponibles + matcheados con el Sheet |
| **K sin odds** | Partidos sin cuotas publicadas todavía (muy lejos en el futuro) |
| **J sin match** | Partidos que la API tiene pero el Sheet no encuentra (probablemente timezone) |

---

## 🎬 Flujo completo recomendado

Antes de cada jornada:

1. **Lunes/martes:** Gestión → "🎯 Traer propuestas" para los partidos del fin de semana.
2. Revisás la lista. Los precios pre-partido aparecen.
3. Aplicás match por match (un click por partido).
4. Verificás en **Partidos** que el strip de cuotas grande refleje los nuevos valores.
5. Los Banditas hacen sus picks.
6. Después del partido cargás el resultado:
   - Por Gestión → "Cargar resultado" (con match-picker)
   - O directo en el Sheet (`onEdit` recalcula factor + puntos solo)

---

## 🔗 Atajos

- App live: https://bandita-bet.vercel.app
- Repo: https://github.com/drioseco/BanditaBet
- README completo: [README_CONTROL_CAMBIOS.md](../../README_CONTROL_CAMBIOS.md)

## 🎥 Video demo (TODO)

Por limitaciones técnicas del extension de Chrome no pude grabar el demo en
animación esta vez. Si querés, lo grabás vos en 2 min con QuickTime/Loom y
lo subimos al README. Mientras tanto, esta guía cumple la función.
