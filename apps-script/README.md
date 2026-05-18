# Apps Script · BanditaBet (backend completo)

Este `Code.gs` es el backend de BanditaBet. Vive dentro del Google Sheet.
Lee y escribe el Sheet directamente. **No hay otro backend.** El Sheet es la base de datos.

## Setup (una sola vez)

### 1. Abrir Apps Script desde el Sheet

1. Abrir el [Google Sheet de BanditaBet](https://docs.google.com/spreadsheets/d/1HUzknfCv_vbcLE2EXyOPziXlOTu4ZSF5mXXWZyl8D6k/edit).
2. Menú **Extensiones → Apps Script**.
3. Se abre el editor. Borrar el contenido del `Code.gs` que viene por defecto.
4. Pegar entero el contenido de [`Code.gs`](./Code.gs) de esta carpeta.
5. Guardar (Cmd+S o ícono del diskette).

### 2. Publicar como Web App

1. Botón **Deploy → New deployment**.
2. Ícono de engranaje → **Web app**.
3. Configurar:
   - **Description:** `BanditaBet API v1`
   - **Execute as:** *Me (driosecof@gmail.com)*
   - **Who has access:** *Anyone with the link*
4. **Deploy**. La primera vez Google pide autorizar permisos:
   - "Ver y administrar tus hojas de cálculo" — *Allow*.
5. Copiar la **Web app URL**. Tiene el formato:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
6. Esta URL se pega en [`web/js/config.js`](../web/js/config.js) como `API_URL`.

### 3. Probar que funciona

Abrir en el navegador:

```
https://script.google.com/macros/s/AKfycb.../exec?action=health
```

Debería devolver:
```json
{ "ok": true, "service": "banditabet-gscript", "time": "2026-05-10T..." }
```

Y para ver el state completo:
```
https://script.google.com/macros/s/.../exec?action=state
```

## API reference

| Método | Acción | Parámetros | Devuelve |
|---|---|---|---|
| `GET` | `?action=health` | — | `{ ok, service, time }` |
| `GET` | `?action=state` | — | Snapshot completo: `players`, `matches`, `picks`, `leaderboard`, `last_synced_at`, … |
| `GET` | `?action=sync-status` | — | `{ last_synced_at, source, live: true }` |
| `POST` | `action=savePicks` | `player`, `picks` (JSON-stringified array) | `{ saved, locked, missing }` |
| `POST` | `action=setResult` | `matchId`, `home_score`, `away_score`, `factor` (opt) | `{ matchId, result, result_factor }` |
| `POST` | `action=addMatch` | `competition_id`, `round_name`, `match_date`, `home_team`, `away_team`, `factor_*` | `{ match }` |

Los POST usan `application/x-www-form-urlencoded` (no JSON) para evitar el preflight CORS de los browsers. Funcionan desde cualquier frontend.

## Re-deploy cuando cambies el código

Apps Script no aplica los cambios automáticamente. Cada vez que toques `Code.gs`:

1. **Save** (Cmd+S).
2. **Deploy → Manage deployments**.
3. Clic en el deployment activo → ícono lápiz (Edit).
4. **Version:** *New version* → **Deploy**.

La URL `/exec` se mantiene. Si creás un *new deployment* en lugar de editar el existente, te da una URL distinta y tenés que actualizar `web/js/config.js`.

## Verificar permisos

Si después de deployar el script no escribe al Sheet, ir a:
**Project Settings → Show "appsscript.json"** y verificar que están los scopes `https://www.googleapis.com/auth/spreadsheets.currentonly` y `https://www.googleapis.com/auth/script.external_request`.

## Debug

- En el editor de Apps Script: **Executions** (icono ⏱️) muestra el log de cada request al endpoint.
- Funciones `test_health`, `test_state` y `test_status` en el `Code.gs` permiten probar localmente con **Run**.
- Los `log_()` aparecen en **View → Logs** o en la consola de Executions.

## Si cambian los nombres de las pestañas o columnas

Editar al inicio de [`Code.gs`](./Code.gs):

```javascript
var SHEETS = {
  liga:    { name: 'Liga de Primera',  ... },
  experto: { name: 'Partidos Experto', ... },
};
```

Y los índices de columna en `colIndexes_()`. Re-deploy y listo.
