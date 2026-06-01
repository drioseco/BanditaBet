# Bracket Simulator 🏆

Simulador interactivo de eliminatorias (single-elimination). El usuario toca un
equipo y lo hace avanzar; el cuadro se recalcula solo hasta el campeón.

- **Vanilla JS, sin dependencias, sin build.** Un solo archivo `.js`.
- **Autocontenido**: inyecta su propio CSS (idempotente).
- **Portable**: copiá la carpeta a cualquier proyecto.
- Acepta datos de **grupos** (toma los N mejores de cada uno) o una lista directa de **equipos**.

## Instalación

Copiá `bracket-simulator.js` a tu proyecto. Listo. No necesita npm.

```js
import { createBracketSimulator } from './bracket-simulator.js';
```

(Si no usás módulos ES, podés cargarlo con `<script type="module">` — ver `demo.html`.)

## Uso rápido

```js
const sim = createBracketSimulator(document.getElementById('app'), {
  groups: [
    { name: 'Group A', table: [{ team: 'Flamengo', crest: 'https://…' }, { team: 'Estudiantes' }, /* … */] },
    { name: 'Group B', table: [/* … */] },
    // … hasta 8 grupos
  ],
  qualifyPerGroup: 2,   // cuántos avanzan por grupo (default 2)
  title: 'Simulador de eliminatorias',
  note: 'Tocá un equipo para hacerlo avanzar.',
  onChampion: (team) => console.log('Campeón:', team?.team),
});
```

### O con equipos directos (8, 16, 32…)

```js
createBracketSimulator(el, {
  entrants: [
    { team: 'Brasil', crest: '…', seed: '1' },
    { team: 'Argentina', seed: '2' },
    // … (potencia de 2; si no, se recorta al múltiplo más cercano)
  ],
});
```

## Formato de datos

**Grupos** (mismo shape que devuelve casi cualquier API de tablas):
```
groups: [ { name: 'Group A', table: [ { team, crest? }, … ] }, … ]
```
- Toma los `qualifyPerGroup` primeros de cada `table` (ya vienen ordenados).
- Con **exactamente 8 grupos y 2 por grupo**, arma octavos con el cruce clásico
  que evita rematch del mismo grupo (1A-2B, 1B-2A, 1C-2D, …).
- En cualquier otro caso, empareja en orden (1º vs 2º, 3º vs 4º…).

**Equipos directos**:
```
entrants: [ { team, crest?, seed?, rank? }, … ]
```
- `rank` (número, menor = mejor) se usa para "Autocompletar". Si no lo pasás,
  usa el orden de la lista.

## Opciones

| Opción | Default | Qué hace |
|---|---|---|
| `groups` / `entrants` | — | Fuente de datos (una de las dos) |
| `qualifyPerGroup` | `2` | Clasificados por grupo |
| `seeding` | `'auto'` | `'cross'` fuerza el cruce anti-rematch · `'as-is'` empareja en orden |
| `title` | `'Simulador de eliminatorias'` | Título (vacío `''` lo oculta) |
| `note` | … | Texto de ayuda (acepta HTML; vacío lo oculta) |
| `championLabel` | `'Campeón'` | Encabezado de la columna final |
| `labels` | `{}` | Override de nombres por ronda: `{16:'Octavos',8:'Cuartos',4:'Semis',2:'Final'}` |
| `showControls` | `true` | Muestra botones Autocompletar / Reiniciar |
| `onChange(state)` | — | Callback en cada cambio |
| `onChampion(team)` | — | Callback cuando cambia el campeón (`null` si se deshace) |

## API (lo que devuelve `createBracketSimulator`)

```js
sim.autoFill();    // completa el cuadro: gana el de mejor seed/rank
sim.reset();       // vuelve a octavos
sim.getState();    // { champion, rounds:[[{a,b,winner}], …] }
sim.setData({ groups: nuevosGrupos });  // recarga con datos nuevos
sim.destroy();     // limpia el contenedor
```

## Theming

Override las variables CSS dentro de tu contenedor (o de `.bsim`):

```css
.bsim {
  --bsim-accent: #7f1d2a;   /* color de acento / ganador */
  --bsim-ink:    #1f1a2e;   /* texto y bordes */
  --bsim-bg:     #f4ecd8;   /* fondo de las cards */
  --bsim-line:   rgba(31,26,46,.18);
  --bsim-font:   system-ui, sans-serif;
  --bsim-mono:   ui-monospace, monospace;
}
```

## Demo

Abrí `demo.html` (necesita servirse por HTTP por el `import` de módulos):

```bash
cd tools/bracket-simulator
python3 -m http.server 8000
# abrir http://localhost:8000/demo.html
```

## Notas

- Es un **simulador de proyección**: arma el cuadro con la data que le pases. No
  consulta ninguna API por su cuenta — vos le das los grupos/equipos.
- Single-elimination con cualquier potencia de 2 (2, 4, 8, 16, 32…).
- Extraído del Hub de BanditaBet. Sin acoplamiento al proyecto original.
