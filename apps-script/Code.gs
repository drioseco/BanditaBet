/**
 * ════════════════════════════════════════════════════════════════════
 * BanditaBet · Backend completo en Apps Script
 * ════════════════════════════════════════════════════════════════════
 *
 * Este archivo ES el backend. Vive dentro del Google Sheet de BanditaBet.
 * El Sheet es la base de datos. Apps Script es la API.
 *
 * ENDPOINTS (Web App publicada):
 *
 *   GET  ?action=state                      → snapshot completo
 *   GET  ?action=health                     → ok + last_synced_at
 *   GET  ?action=sync-status                → metadata de sincronización
 *
 *   POST action=savePicks
 *        player=Dari
 *        picks=[{matchId,home_score,away_score},...]    (JSON-stringified)
 *
 *   POST action=setResult
 *        matchId=<id>
 *        home_score=2&away_score=1
 *        factor=2.35                                    (opcional)
 *
 *   POST action=addMatch
 *        competition_id=liga
 *        round_name="Fecha 12"
 *        match_date=2026-05-17
 *        home_team=...&away_team=...
 *        factor_home=2.5&factor_draw=3.1&factor_away=2.8
 *
 * SETUP (una vez):
 *
 *   1. En el Sheet → Extensiones → Apps Script.
 *   2. Borrar el Code.gs por defecto, pegar este archivo.
 *   3. Deploy → New deployment → Type: Web App.
 *        Execute as: Me (tu cuenta)
 *        Who has access: Anyone (con link)
 *      Copiar la URL deployada (https://script.google.com/macros/s/.../exec).
 *   4. Pegar esa URL en web/js/config.js como API_URL.
 *
 * NOTAS:
 *
 *   - Form-encoded POST (URLSearchParams) para evitar CORS preflight.
 *   - matchId es determinístico: sha1(competition + home + away + date),
 *     mismo formato que el script de import-v1 → migrable a otra DB después.
 *   - Cada operación de escritura usa lock para evitar race conditions.
 *   - El recálculo de puntos vive en este archivo (lo mismo que hacía
 *     el trigger de Postgres en Supabase).
 *
 * ════════════════════════════════════════════════════════════════════
 */

// ── Configuración ──────────────────────────────────────────────────
var SHEETS = {
  liga:    { name: 'Liga de Primera',  headerRows: 2, parser: parseLigaRow,    writer: writeLigaCells },
  experto: { name: 'Partidos Experto', headerRows: 2, parser: parseExpertoRow, writer: writeExpertoCells },
};
var PLAYERS = ['Dari', 'Kmi', 'Blopa', 'Pela'];
var PLAYER_COLORS = { Dari: '#1E4FB8', Kmi: '#E8442C', Blopa: '#E8B33D', Pela: '#2E6B3A' };

// ── ESPN API (sandbox) ──────────────────────────────────────────────
// Carga automática de resultados a una hoja aparte (_API_test). NO toca
// las hojas de producción. Ver qa17/qa19.
// ESPN tiene un endpoint público sin auth (`site.api.espn.com`) que cubre
// Liga Chile 2026 con ~92 partidos. TheSportsDB solo tenía 11, API-Football
// free no cubre 2026.
var ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
var ESPN_LEAGUES = {
  liga: { slug: 'chi.1' }   // Chile Primera División
};

// ── HUB de fútbol (qa26) ─────────────────────────────────────────────
// Capa de datos oficiales (solo lectura) sobre la API de ESPN. Independiente
// de la polla. El frontend consume JSON normalizado vía ?action=hub; el
// backend cachea con TTL (CacheService) para no golpear ESPN en cada visita.
var HUB_COMPS = {
  liga:    { slug: 'chi.1',                 label: 'Liga Chile',   hasGroups: false, hasBracket: false },
  liberta: { slug: 'conmebol.libertadores', label: 'Libertadores', hasGroups: true,  hasBracket: true  },
  sudamer: { slug: 'conmebol.sudamericana', label: 'Sudamericana', hasGroups: true,  hasBracket: true  }
};
// TTL de caché por tipo de dato (segundos). Tope de CacheService = 21600 (6h).
var HUB_TTL = { standings: 21600, fixtures: 3600, bracket: 3600, scorers: 21600 };
var SANDBOX_SHEET_NAME = '_API_test';
var SANDBOX_HEADERS = [
  'fecha_partido','home_team_api','away_team_api','home_score','away_score',
  'status','matched_in_sheet','sheet_home_team','sheet_away_team',
  'sheet_row','sheet_has_score','would_update','imported_at'
];
// Mapeo de nombres API (ESPN + fallback otros) → nombres en el Sheet.
// Iterar agregando los que aparezcan como "unmatched".
var TEAM_ALIASES = {
  "Universidad de Chile":          "U. de Chile",
  "Universidad Católica":          "U. Católica",
  "Universidad Catolica":          "U. Católica",
  "Universidad de Concepción":     "U. de Concepción",
  "Universidad de Concepcion":     "U. de Concepción",
  "Deportes La Serena":            "La Serena",
  "Deportes Iquique":              "Iquique",
  "Deportes Limache":              "Limache",
  "Deportes Copiapo":              "Copiapó",
  "Deportes Concepción":           "Dep. Concepción",
  "Deportes Concepcion":           "Dep. Concepción",
  "Union La Calera":               "La Calera",
  "Unión La Calera":               "La Calera",
  "Union Espanola":                "U. Española",
  "Unión Española":                "U. Española",
  "Coquimbo Unido":                "Coquimbo",
  "Audax Italiano":                "Audax Italiano",
  "Cobresal":                      "Cobresal",
  "Huachipato":                    "Huachipato",
  "Palestino":                     "Palestino",
  "Colo Colo":                     "Colo Colo",
  "Colo-Colo":                     "Colo Colo",
  "Everton":                       "Everton",
  "Everton CD":                    "Everton",
  "Everton de Viña del Mar":       "Everton",
  "Everton de Vina del Mar":       "Everton",
  "O'Higgins":                     "O'Higgins",
  "Nublense":                      "Ñublense",
  "Ñublense":                      "Ñublense"
};

// ── Web App entry points ───────────────────────────────────────────
function doGet(e) {
  return jsonResp(handle((e.parameter && e.parameter.action) || 'state', e.parameter || {}));
}

function doPost(e) {
  var p = e.parameter || {};
  // Si llega application/json, parsear
  if (e.postData && e.postData.type === 'application/json') {
    try {
      var body = JSON.parse(e.postData.contents || '{}');
      for (var k in body) p[k] = body[k];
    } catch (_) {}
  }
  return jsonResp(handle(p.action || 'savePicks', p));
}

// ── Admin auth (qa23) ────────────────────────────────────────────────
// Acciones que escriben/modifican el Sheet desde Gestión requieren PIN.
// El PIN se guarda en Apps Script → Configuración del proyecto → Propiedades
// del script → ADMIN_PIN. NO va al repo.
var ADMIN_ACTIONS = ['setResult','addMatch','updateFactors','fetchResults','fetchOdds','clearSandbox'];

function assertAdmin_(action, p) {
  if (ADMIN_ACTIONS.indexOf(action) === -1) return null; // acción pública, ok
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!expected) {
    return { ok: false, error: 'admin_pin_not_configured',
             hint: 'Setear ADMIN_PIN en Apps Script → Project Settings → Script Properties.' };
  }
  var got = ((p && p.admin_pin) || '').toString();
  if (got !== expected) return { ok: false, error: 'invalid_admin_pin' };
  return null; // pasa
}

function handle(action, p) {
  try {
    var authErr = assertAdmin_(action, p || {});
    if (authErr) return authErr;
    switch (action) {
      case 'health':       return health_();
      case 'state':        return stateCached_(p);
      case 'sync-status':  return syncStatus_();
      case 'savePicks':    return savePicks_(p);
      case 'setResult':    return setResult_(p);
      case 'addMatch':     return addMatch_(p);
      case 'updateFactors': return updateFactors_(p);
      case 'fetchResults':  return fetchResults_(p);
      case 'fetchOdds':     return fetchOdds_(p);
      case 'clearSandbox':  return clearSandbox_();
      case 'hub':           return hub_(p);
      default:             return { ok: false, error: 'unknown_action', got: action };
    }
  } catch (err) {
    log_('[error]', action, err.message, err.stack);
    return { ok: false, error: err.message };
  }
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Health / sync status ───────────────────────────────────────────
function health_() {
  return { ok: true, service: 'banditabet-gscript', time: new Date().toISOString() };
}
function syncStatus_() {
  return { ok: true, last_synced_at: new Date().toISOString(), source: 'apps-script', live: true };
}

// ── Caché de state (qa29) ───────────────────────────────────────────
// getState_ lee 2 hojas enteras y recalcula todo (~397KB, 5-9s). Lo
// cacheamos chunkeado en CacheService (límite 100KB/key) reusando el
// patrón del Hub. Se invalida explícitamente al escribir (ver más abajo);
// el TTL es solo red de seguridad. &fresh=1 saltea la caché.
var STATE_TTL = 600;          // 10 min
var STATE_CHUNK = 90000;      // chars por key (< 100KB)
var STATE_MAX_CHUNKS = 40;    // tope defensivo para invalidación

function stateCached_(p) {
  var fresh = (p && (p.fresh === '1' || p.fresh === 'true' || p.fresh === true));
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cacheStateGet_(cache);
    if (hit) { hit.cached = true; return hit; }
  }
  var data = getState_();
  cacheStatePut_(cache, data);
  return data;
}

function cacheStatePut_(cache, obj) {
  try {
    var s = JSON.stringify(obj);
    var n = Math.ceil(s.length / STATE_CHUNK);
    if (n > STATE_MAX_CHUNKS) return; // demasiado grande, no cachear
    var map = {};
    for (var i = 0; i < n; i++) map['state:' + i] = s.substr(i * STATE_CHUNK, STATE_CHUNK);
    map['state:meta'] = JSON.stringify({ n: n, len: s.length, at: Date.now() });
    cache.putAll(map, STATE_TTL);
  } catch (_) { /* si no entra al caché, devolvemos igual sin cachear */ }
}

function cacheStateGet_(cache) {
  try {
    var metaRaw = cache.get('state:meta');
    if (!metaRaw) return null;
    var meta = JSON.parse(metaRaw);
    var keys = [];
    for (var i = 0; i < meta.n; i++) keys.push('state:' + i);
    var got = cache.getAll(keys);
    var parts = [];
    for (var j = 0; j < meta.n; j++) {
      var part = got['state:' + j];
      if (part == null) return null;        // chunk faltante → miss
      parts.push(part);
    }
    var s = parts.join('');
    if (s.length !== meta.len) return null;  // integridad
    return JSON.parse(s);
  } catch (_) { return null; }
}

// Borra el caché de state. Se llama tras cada escritura a Liga/Experto.
function invalidateStateCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var keys = ['state:meta'];
    for (var i = 0; i < STATE_MAX_CHUNKS; i++) keys.push('state:' + i);
    cache.removeAll(keys);
  } catch (_) {}
}

// ── getState_: snapshot completo del Sheet ─────────────────────────
function getState_() {
  var ss = SpreadsheetApp.getActive();
  var allMatches = [];
  var allPicks   = [];
  var roundsMap  = {};

  for (var compId in SHEETS) {
    var cfg = SHEETS[compId];
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) continue;
    var values = sheet.getDataRange().getValues();
    for (var i = cfg.headerRows; i < values.length; i++) {
      var parsed = cfg.parser(values[i], compId, i);
      if (!parsed) continue;
      // Round dedupe
      var roundName = parsed.round_name || 'Sin asignar';
      var roundKey  = compId + '|' + roundName;
      if (!roundsMap[roundKey]) {
        roundsMap[roundKey] = {
          id: detId_('round', compId, roundName),
          competition_id: compId,
          name: roundName,
          display_order: Object.keys(roundsMap).filter(function(k){return k.indexOf(compId+'|')===0}).length + 1,
        };
      }
      var matchId = detId_('match', compId, parsed.home_team, parsed.away_team, parsed.match_date);
      allMatches.push({
        id:             matchId,
        round_id:       roundsMap[roundKey].id,
        competition_id: compId,
        match_date:     parsed.match_date,
        home_team:      parsed.home_team,
        away_team:      parsed.away_team,
        venue:          parsed.venue || null,
        home_score:     parsed.home_score,
        away_score:     parsed.away_score,
        factor_home:    parsed.factor_home,
        factor_draw:    parsed.factor_draw,
        factor_away:    parsed.factor_away,
        result:         parsed.result,
        result_factor:  parsed.result_factor,
        status:         isPlayed_(parsed) ? 'finished' : 'scheduled',
        _row:           i + 1,  // 1-based, útil para writers
      });
      // Picks
      for (var pName in (parsed.picks || {})) {
        var pk = parsed.picks[pName];
        if (pk.home_score == null && pk.away_score == null) continue;
        allPicks.push({
          id:         detId_('pick', matchId, pName),
          match_id:   matchId,
          player_id:  detId_('player', pName),
          player_name: pName,
          home_score: pk.home_score,
          away_score: pk.away_score,
          points:     parsed.points ? parsed.points[pName] || 0 : 0,
          status:     parsed.status_per_player ? (parsed.status_per_player[pName] || ' ') : ' ',
          source:     'sheet',
        });
      }
    }
  }

  // Leaderboard agregado
  var leaderboard = PLAYERS.map(function (name) {
    var total = 0, plenos = 0, aciertos = 0, wo = 0, pj = 0;
    allMatches.forEach(function (m) {
      if (!isPlayed_(m)) return;
      var pk = allPicks.find(function (p) { return p.match_id === m.id && p.player_name === name; });
      if (!pk || pk.home_score == null) { wo++; return; }
      pj++;
      total += Number(pk.points || 0);
      var s = (pk.status || '').toString().trim();
      if (s === 'P') plenos++;
      else if (s === 'Ac') aciertos++;
    });
    return {
      id: detId_('player', name),
      name: name,
      color: PLAYER_COLORS[name],
      avatar_url: null,
      total_points: +total.toFixed(2),
      plenos: plenos, aciertos: aciertos, wo: wo, pj: pj,
    };
  });

  return {
    ok: true,
    now: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    sync_sources: 'apps-script',
    me: null,    // (auth deshabilitada — modo "selector de jugador")
    players: PLAYERS.map(function (name) {
      return { id: detId_('player', name), name: name, color: PLAYER_COLORS[name], avatar_url: null, is_admin: name === 'Dari' };
    }),
    competitions: [
      { id: 'liga',    name: 'Liga de Primera',  display_order: 1 },
      { id: 'experto', name: 'Partidos Experto', display_order: 2 },
    ],
    rounds:      Object.keys(roundsMap).map(function (k) { return roundsMap[k]; }),
    matches:     allMatches.map(function (m) { delete m._row; return m; }),
    picks:       allPicks,
    leaderboard: leaderboard.sort(function (a, b) { return b.total_points - a.total_points; }),
    insights:    [],
  };
}

// ── savePicks_: escribe picks al Sheet ─────────────────────────────
function savePicks_(p) {
  var playerName = p.player;
  if (!playerName || PLAYERS.indexOf(playerName) < 0) return { ok: false, error: 'unknown_player' };

  var picks = typeof p.picks === 'string' ? JSON.parse(p.picks) : (p.picks || []);
  if (!picks.length) return { ok: false, error: 'no_picks' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = SpreadsheetApp.getActive();
    var saved = 0, locked = 0, missing = 0;
    // Cache: matchId → { compId, row }
    var matchIndex = buildMatchIndex_(ss);

    picks.forEach(function (pk) {
      var loc = matchIndex[pk.matchId];
      if (!loc) { missing++; return; }
      var sheet = ss.getSheetByName(SHEETS[loc.compId].name);
      // Verificar que el partido no esté ya cerrado (tiene marcador final)
      var row = sheet.getRange(loc.row, 1, 1, sheet.getLastColumn()).getValues()[0];
      var parsed = SHEETS[loc.compId].parser(row, loc.compId, loc.row - 1);
      if (parsed && isPlayed_(parsed)) {
        locked++;
        return;
      }
      if (pk.home_score == null || pk.away_score == null || isNaN(parseInt(pk.home_score, 10)) || isNaN(parseInt(pk.away_score, 10))) {
        missing++;
        return;
      }
      SHEETS[loc.compId].writer(sheet, loc.row, playerName, parseInt(pk.home_score, 10), parseInt(pk.away_score, 10));
      saved++;
    });
    if (saved > 0) invalidateStateCache_();   // qa29: refrescar caché de state
    return { ok: true, saved: saved, locked: locked, missing: missing };
  } finally {
    lock.releaseLock();
  }
}

// ── setResult_: escribe marcador final y recalcula puntos ──────────
function setResult_(p) {
  var matchId = p.matchId;
  var hs = parseInt(p.home_score, 10);
  var as_ = parseInt(p.away_score, 10);
  var factor = p.factor != null && p.factor !== '' ? parseFloat(p.factor) : null;
  if (!matchId) return { ok: false, error: 'missing_matchId' };
  if (isNaN(hs) || isNaN(as_)) return { ok: false, error: 'invalid_score' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = SpreadsheetApp.getActive();
    var loc = buildMatchIndex_(ss)[matchId];
    if (!loc) return { ok: false, error: 'match_not_found' };
    var sheet = ss.getSheetByName(SHEETS[loc.compId].name);
    var IDX = colIndexes_(loc.compId);

    sheet.getRange(loc.row, IDX.hScore + 1).setValue(hs);
    sheet.getRange(loc.row, IDX.aScore + 1).setValue(as_);

    var resultLetter = hs > as_ ? 'L' : hs < as_ ? 'V' : 'E';
    sheet.getRange(loc.row, IDX.result + 1).setValue(resultLetter);

    // Recalcular puntos/status para los 4 jugadores
    var row = sheet.getRange(loc.row, 1, 1, sheet.getLastColumn()).getValues()[0];
    var parsed = SHEETS[loc.compId].parser(row, loc.compId, loc.row - 1);
    var resultFactor = factor != null && !isNaN(factor) ? factor : (
      resultLetter === 'L' ? parsed.factor_home :
      resultLetter === 'V' ? parsed.factor_away :
                             parsed.factor_draw
    );
    sheet.getRange(loc.row, IDX.factor + 1).setValue(resultFactor != null && !isNaN(resultFactor) ? resultFactor : '');

    PLAYERS.forEach(function (pName) {
      var pk = parsed.picks[pName];
      var pts = 0, st = ' ';
      if (pk && pk.home_score != null && pk.away_score != null) {
        if (pk.home_score === hs && pk.away_score === as_) {
          pts = +(3 * (resultFactor || 0)).toFixed(2); st = 'P';
        } else {
          var pickResult = pk.home_score > pk.away_score ? 'L' : pk.home_score < pk.away_score ? 'V' : 'E';
          if (pickResult === resultLetter) { pts = +(resultFactor || 0).toFixed(2); st = 'Ac'; }
        }
      }
      sheet.getRange(loc.row, IDX.points[pName] + 1).setValue(pts);
      sheet.getRange(loc.row, IDX.statuses[pName] + 1).setValue(st);
    });

    invalidateStateCache_();   // qa29
    return { ok: true, matchId: matchId, home_score: hs, away_score: as_, result: resultLetter, result_factor: resultFactor };
  } finally {
    lock.releaseLock();
  }
}

// ── onEdit: trigger automático cuando se edita directo en el Sheet ─
// Si alguien escribe el marcador local/visita a mano (sin pasar por la app),
// se calcula result + result_factor + puntos/status como si hubiese usado
// "Cargar resultado" en Gestión. Idempotente: editar de nuevo recalcula.
// Es un "simple trigger" (nombre `onEdit`) → corre automáticamente, sin
// instalación manual. Solo dispara en ediciones de usuario (no en escrituras
// del Web App).
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = sheet.getName();

    // ¿Es una hoja de partidos?
    var compId = null;
    for (var k in SHEETS) { if (SHEETS[k].name === sheetName) compId = k; }
    if (!compId) return;

    var IDX = colIndexes_(compId);
    var editedCol = range.getColumn() - 1; // 0-based

    // Disparar recálculo si se editó hScore, aScore, o cualquiera de las cuotas
    var watch = [IDX.hScore, IDX.aScore, IDX.fl, IDX.fe, IDX.fv];
    if (watch.indexOf(editedCol) === -1) return;

    var startRow = range.getRow();
    if (startRow <= SHEETS[compId].headerRows) return; // header, ignorar
    var numRows = range.getNumRows();
    for (var i = 0; i < numRows; i++) {
      recomputeRow_(sheet, startRow + i, compId);
    }
  } catch (err) {
    log_('onEdit error: ' + (err && err.message));
  }
}

// Recalcula result, result_factor, puntos y status de UNA fila.
// Si el partido no tiene los 2 marcadores cargados, no toca nada.
// Si la fecha del partido es futura, tampoco actúa (los 0-0 en el Sheet
// son placeholders pre-partido, no resultados reales — qa18 bugfix).
function recomputeRow_(sheet, rowNum, compId) {
  var IDX = colIndexes_(compId);
  var rowVals = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  var parsed = SHEETS[compId].parser(rowVals, compId, rowNum - 1);
  if (!parsed) return;

  var hs = parsed.home_score;
  var as_ = parsed.away_score;
  // Sin marcador completo → no actuamos (preserva lo que haya)
  if (hs == null || as_ == null || isNaN(hs) || isNaN(as_)) return;

  // Si la fecha del partido es FUTURA, no calcular nada (probablemente 0-0 es placeholder).
  // Comparamos solo fechas YYYY-MM-DD ignorando hora.
  var todayYMD = ymd_(new Date());
  var matchYMD = parsed.match_date;
  if (matchYMD && matchYMD > todayYMD) return;

  var resultLetter = hs > as_ ? 'L' : hs < as_ ? 'V' : 'E';
  sheet.getRange(rowNum, IDX.result + 1).setValue(resultLetter);

  var resultFactor = resultLetter === 'L' ? parsed.factor_home :
                     resultLetter === 'V' ? parsed.factor_away :
                                            parsed.factor_draw;
  sheet.getRange(rowNum, IDX.factor + 1).setValue(
    resultFactor != null && !isNaN(resultFactor) ? resultFactor : ''
  );

  PLAYERS.forEach(function (pName) {
    var pk = parsed.picks[pName];
    var pts = 0, st = ' ';
    if (pk && pk.home_score != null && pk.away_score != null) {
      if (pk.home_score === hs && pk.away_score === as_) {
        pts = +(3 * (resultFactor || 0)).toFixed(2); st = 'P';
      } else {
        var pickResult = pk.home_score > pk.away_score ? 'L' :
                         pk.home_score < pk.away_score ? 'V' : 'E';
        if (pickResult === resultLetter) {
          pts = +(resultFactor || 0).toFixed(2); st = 'Ac';
        }
      }
    }
    sheet.getRange(rowNum, IDX.points[pName] + 1).setValue(pts);
    sheet.getRange(rowNum, IDX.statuses[pName] + 1).setValue(st);
  });
  invalidateStateCache_();   // qa29: edición directa en el Sheet (onEdit)
}

// Limpieza retroactiva (qa18 bugfix): borra result/result_factor/puntos/statuses
// de partidos con fecha FUTURA que quedaron mal marcados como "jugados" cuando
// recomputeRow_ procesó el 0-0 placeholder como empate.
// Solo limpia partidos con (match_date > hoy) AND (score 0-0). NO toca picks reales.
function test_clean_future_bogus_results() {
  var ss = SpreadsheetApp.getActive();
  var todayYMD = ymd_(new Date());
  var cleaned = 0;
  var detail = [];
  for (var compId in SHEETS) {
    var sheet = ss.getSheetByName(SHEETS[compId].name);
    if (!sheet) continue;
    var IDX = colIndexes_(compId);
    var last = sheet.getLastRow();
    for (var r = SHEETS[compId].headerRows + 1; r <= last; r++) {
      var rowVals = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
      var parsed = SHEETS[compId].parser(rowVals, compId, r - 1);
      if (!parsed) continue;
      // Sólo limpiamos partidos con fecha futura
      if (!parsed.match_date || parsed.match_date <= todayYMD) continue;
      // Sólo si tiene result_factor cargado (síntoma del bug)
      var rfCell = sheet.getRange(r, IDX.factor + 1).getValue();
      if (rfCell === '' || rfCell == null) continue;
      // Limpiar: result, result_factor, puntos y status de los 4 jugadores
      sheet.getRange(r, IDX.result + 1).setValue('');
      sheet.getRange(r, IDX.factor + 1).setValue('');
      PLAYERS.forEach(function (pName) {
        sheet.getRange(r, IDX.points[pName] + 1).setValue(0);
        sheet.getRange(r, IDX.statuses[pName] + 1).setValue(' ');
      });
      cleaned++;
      detail.push(parsed.match_date + ' ' + parsed.home_team + ' vs ' + parsed.away_team);
    }
  }
  log_('clean_future_bogus: ' + cleaned + ' filas limpiadas');
  log_(detail.join(' | '));
  return { ok: true, cleaned: cleaned, detail: detail };
}

// Limpieza one-shot (qa22): borra el contenido de las celdas hScore/aScore
// para todos los partidos con fecha futura. Esos 0-0 son placeholders
// heredados del seed inicial del Sheet, no resultados reales. NO toca picks,
// cuotas, resultado ni nada más — solo limpia las 2 celdas de marcador.
function test_clean_future_placeholders() {
  var ss = SpreadsheetApp.getActive();
  var todayYMD = ymd_(new Date());
  var cleaned = 0;
  var detail = [];
  for (var compId in SHEETS) {
    var sheet = ss.getSheetByName(SHEETS[compId].name);
    if (!sheet) continue;
    var IDX = colIndexes_(compId);
    var last = sheet.getLastRow();
    for (var r = SHEETS[compId].headerRows + 1; r <= last; r++) {
      var rowVals = sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0];
      var parsed = SHEETS[compId].parser(rowVals, compId, r - 1);
      if (!parsed) continue;
      if (!parsed.match_date || parsed.match_date <= todayYMD) continue;
      var hs = rowVals[IDX.hScore];
      var as_ = rowVals[IDX.aScore];
      // Solo limpiamos si la celda tiene algo (placeholder 0 o lo que sea)
      if ((hs === '' || hs == null) && (as_ === '' || as_ == null)) continue;
      sheet.getRange(r, IDX.hScore + 1).setValue('');
      sheet.getRange(r, IDX.aScore + 1).setValue('');
      cleaned++;
      if (detail.length < 30) {
        detail.push(parsed.match_date + ' ' + parsed.home_team + ' vs ' + parsed.away_team);
      }
    }
  }
  log_('clean_future_placeholders: ' + cleaned + ' filas limpiadas');
  log_(detail.join(' | '));
  return { ok: true, cleaned: cleaned, sample: detail };
}

// Recompute manual desde el editor: corré test_recompute_all() para
// arreglar TODOS los partidos que tengan score pero no factor.
function test_recompute_all() {
  var ss = SpreadsheetApp.getActive();
  var fixed = 0;
  for (var compId in SHEETS) {
    var sheet = ss.getSheetByName(SHEETS[compId].name);
    if (!sheet) continue;
    var last = sheet.getLastRow();
    for (var r = SHEETS[compId].headerRows + 1; r <= last; r++) {
      var before = sheet.getRange(r, colIndexes_(compId).factor + 1).getValue();
      recomputeRow_(sheet, r, compId);
      var after = sheet.getRange(r, colIndexes_(compId).factor + 1).getValue();
      if (before !== after) fixed++;
    }
  }
  log_('recompute_all: ' + fixed + ' filas actualizadas');
  return { ok: true, fixed: fixed };
}

// ── updateFactors_: actualiza Fac L/E/V de un partido existente ────
function updateFactors_(p) {
  var matchId = p.matchId;
  var fl = p.factor_home != null && p.factor_home !== '' ? parseFloat(p.factor_home) : null;
  var fe = p.factor_draw != null && p.factor_draw !== '' ? parseFloat(p.factor_draw) : null;
  var fv = p.factor_away != null && p.factor_away !== '' ? parseFloat(p.factor_away) : null;
  if (!matchId) return { ok: false, error: 'missing_matchId' };
  if (fl == null && fe == null && fv == null) return { ok: false, error: 'no_factors_provided' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = SpreadsheetApp.getActive();
    var loc = buildMatchIndex_(ss)[matchId];
    if (!loc) return { ok: false, error: 'match_not_found' };
    var sheet = ss.getSheetByName(SHEETS[loc.compId].name);
    var IDX = colIndexes_(loc.compId);
    if (fl != null && !isNaN(fl)) sheet.getRange(loc.row, IDX.fl + 1).setValue(fl);
    if (fe != null && !isNaN(fe)) sheet.getRange(loc.row, IDX.fe + 1).setValue(fe);
    if (fv != null && !isNaN(fv)) sheet.getRange(loc.row, IDX.fv + 1).setValue(fv);
    invalidateStateCache_();   // qa29
    return { ok: true, matchId: matchId, factor_home: fl, factor_draw: fe, factor_away: fv };
  } finally {
    lock.releaseLock();
  }
}

// ── addMatch_: agrega fixture al final del Sheet ───────────────────
function addMatch_(p) {
  var compId = p.competition_id;
  if (!SHEETS[compId]) return { ok: false, error: 'unknown_competition' };
  if (!p.home_team || !p.away_team || !p.match_date) return { ok: false, error: 'missing_fields' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS[compId].name);
    var IDX = colIndexes_(compId);
    var rowArr = new Array(sheet.getLastColumn()).fill('');
    if (compId === 'liga') {
      rowArr[IDX.fecha]   = p.round_name || '';
      rowArr[IDX.venue]   = p.venue || '';
    } else {
      rowArr[IDX.torneo]  = p.round_name || '';
    }
    rowArr[IDX.date]   = p.match_date;
    rowArr[IDX.home]   = p.home_team;
    rowArr[IDX.away]   = p.away_team;
    if (p.factor_home != null) rowArr[IDX.fl] = parseFloat(p.factor_home);
    if (p.factor_draw != null) rowArr[IDX.fe] = parseFloat(p.factor_draw);
    if (p.factor_away != null) rowArr[IDX.fv] = parseFloat(p.factor_away);
    sheet.appendRow(rowArr);
    var newRow = sheet.getLastRow();
    invalidateStateCache_();   // qa29
    return {
      ok: true,
      match: {
        id:             detId_('match', compId, p.home_team, p.away_team, p.match_date),
        competition_id: compId,
        match_date:     p.match_date,
        home_team:      p.home_team,
        away_team:      p.away_team,
        _row:           newRow,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

// ── Index: matchId → { compId, row } (rebuild cada operación) ──────
function buildMatchIndex_(ss) {
  var idx = {};
  for (var compId in SHEETS) {
    var cfg = SHEETS[compId];
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) continue;
    var values = sheet.getDataRange().getValues();
    for (var i = cfg.headerRows; i < values.length; i++) {
      var parsed = cfg.parser(values[i], compId, i);
      if (!parsed) continue;
      var mid = detId_('match', compId, parsed.home_team, parsed.away_team, parsed.match_date);
      idx[mid] = { compId: compId, row: i + 1 };
    }
  }
  return idx;
}

// ── Columnas (índices 0-based) por competition ─────────────────────
function colIndexes_(compId) {
  if (compId === 'liga') {
    return {
      fecha:   0,
      venue:   1,
      date:    2,
      home:    4,
      hScore:  5,
      aScore:  6,
      away:    7,
      fl:      8,
      fe:      9,
      fv:     10,
      picks: { Dari: { l: 11, v: 12 }, Kmi: { l: 13, v: 14 }, Blopa: { l: 15, v: 16 }, Pela: { l: 17, v: 18 } },
      result:  19,
      factor:  20,
      points:  { Dari: 25, Kmi: 26, Blopa: 27, Pela: 28 },
      statuses:{ Dari: 29, Kmi: 30, Blopa: 31, Pela: 32 },
    };
  }
  // experto — OJO: la hoja "Partidos Experto" tiene una columna C vacía
  // entre TORNEO (B) y DIA (D), así que de la fecha en adelante todo va
  // corrido +1 respecto del layout antiguo. De 'home' en adelante es
  // idéntico a Liga. (Fix qa28: el repo estaba desfasado vs la hoja real.)
  return {
    torneo:  1,   // B
    date:    3,   // D · DIA
    home:    4,   // E · LOCAL
    hScore:  5,   // F
    aScore:  6,   // G
    away:    7,   // H · VISITA
    fl:      8,   // I
    fe:      9,   // J
    fv:     10,   // K
    picks: { Dari: { l: 11, v: 12 }, Kmi: { l: 13, v: 14 }, Blopa: { l: 15, v: 16 }, Pela: { l: 17, v: 18 } },
    result:  19,
    factor:  20,
    points:  { Dari: 25, Kmi: 26, Blopa: 27, Pela: 28 },
    statuses:{ Dari: 29, Kmi: 30, Blopa: 31, Pela: 32 },
  };
}

// ── Parsers ────────────────────────────────────────────────────────
function parseLigaRow(r, compId) {
  if (!r[4] || !r[7]) return null;
  return {
    round_name:   str_(r[0]) || null,
    venue:        str_(r[1]) || null,
    match_date:   dateOnly_(r[2]),
    home_team:    str_(r[4]),
    home_score:   numOrNull_(r[5]),
    away_score:   numOrNull_(r[6]),
    away_team:    str_(r[7]),
    factor_home:  numOrNull_(r[8]),
    factor_draw:  numOrNull_(r[9]),
    factor_away:  numOrNull_(r[10]),
    picks: {
      Dari:  { home_score: numOrNull_(r[11]), away_score: numOrNull_(r[12]) },
      Kmi:   { home_score: numOrNull_(r[13]), away_score: numOrNull_(r[14]) },
      Blopa: { home_score: numOrNull_(r[15]), away_score: numOrNull_(r[16]) },
      Pela:  { home_score: numOrNull_(r[17]), away_score: numOrNull_(r[18]) },
    },
    result: str_(r[19]) || null,
    result_factor: numOrNull_(r[20]),
    points:  { Dari: numOrNull_(r[25]) || 0, Kmi: numOrNull_(r[26]) || 0, Blopa: numOrNull_(r[27]) || 0, Pela: numOrNull_(r[28]) || 0 },
    status_per_player: { Dari: str_(r[29]), Kmi: str_(r[30]), Blopa: str_(r[31]), Pela: str_(r[32]) },
  };
}

function parseExpertoRow(r, compId) {
  // Layout real de "Partidos Experto" (col C vacía → todo corrido +1 desde DIA).
  // De LOCAL (E) en adelante es idéntico a Liga. Fix qa28.
  if (!r[4] || !r[7]) return null;
  return {
    round_name:   str_(r[1]) || null,    // B · TORNEO
    venue:        null,
    match_date:   dateOnly_(r[3]),        // D · DIA
    home_team:    str_(r[4]),             // E · LOCAL
    home_score:   numOrNull_(r[5]),       // F
    away_score:   numOrNull_(r[6]),       // G
    away_team:    str_(r[7]),             // H · VISITA
    factor_home:  numOrNull_(r[8]),       // I
    factor_draw:  numOrNull_(r[9]),       // J
    factor_away:  numOrNull_(r[10]),      // K
    picks: {
      Dari:  { home_score: numOrNull_(r[11]), away_score: numOrNull_(r[12]) },
      Kmi:   { home_score: numOrNull_(r[13]), away_score: numOrNull_(r[14]) },
      Blopa: { home_score: numOrNull_(r[15]), away_score: numOrNull_(r[16]) },
      Pela:  { home_score: numOrNull_(r[17]), away_score: numOrNull_(r[18]) },
    },
    result: str_(r[19]) || null,
    result_factor: numOrNull_(r[20]),
    points:  { Dari: numOrNull_(r[25]) || 0, Kmi: numOrNull_(r[26]) || 0, Blopa: numOrNull_(r[27]) || 0, Pela: numOrNull_(r[28]) || 0 },
    status_per_player: { Dari: str_(r[29]), Kmi: str_(r[30]), Blopa: str_(r[31]), Pela: str_(r[32]) },
  };
}

// ── Writers: setean valores en las celdas ──────────────────────────
function writeLigaCells(sheet, row, playerName, l, v) {
  var IDX = colIndexes_('liga');
  var c = IDX.picks[playerName];
  sheet.getRange(row, c.l + 1).setValue(l != null ? l : '');
  sheet.getRange(row, c.v + 1).setValue(v != null ? v : '');
}
function writeExpertoCells(sheet, row, playerName, l, v) {
  var IDX = colIndexes_('experto');
  var c = IDX.picks[playerName];
  sheet.getRange(row, c.l + 1).setValue(l != null ? l : '');
  sheet.getRange(row, c.v + 1).setValue(v != null ? v : '');
}

// ── ID determinístico ──────────────────────────────────────────────
function detId_(/* ...parts */) {
  var parts = Array.prototype.slice.call(arguments);
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, parts.join('|'));
  var hex = raw.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join('');
  return hex.slice(0,8) + '-' + hex.slice(8,12) + '-5' + hex.slice(13,16) + '-8' + hex.slice(17,20) + '-' + hex.slice(20,32);
}

// ── Helpers ────────────────────────────────────────────────────────
function dateOnly_(v) {
  if (!v) return null;
  if (v instanceof Date) return Utilities.formatDate(v, 'GMT', 'yyyy-MM-dd');
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad_(m[1]) + '-' + pad_(m[2]);
  return null;
}
function pad_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function numOrNull_(v) {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}
function isPlayed_(m) {
  if (!m) return false;
  if (m.home_score == null || m.away_score == null) return false;
  var rf = Number(m.result_factor);
  return !isNaN(rf) && rf > 0;
}
function str_(v) { return v == null ? '' : String(v).trim(); }
function log_(/* ...args */) { try { console.log.apply(console, arguments); } catch (_) {} }

// ── ESPN fetch (sandbox) ────────────────────────────────────────────
// Consulta resultados de la API ESPN y los escribe a la hoja _API_test.
// NO toca Liga de Primera. Ver plan qa17/qa19.
function fetchResults_(p) {
  var today = new Date();
  var fromDate = p.from || ymd_(addDays_(today, -7));
  var toDate   = p.to   || ymd_(today);

  var league = ESPN_LEAGUES.liga;
  var events;
  try {
    events = espnFetchRange_(league.slug, fromDate, toDate);
  } catch (err) {
    return { ok: false, error: 'api_call_failed', detail: String(err && err.message) };
  }

  var ss = SpreadsheetApp.getActive();
  var sandbox = ensureSandboxSheet_(ss);

  // Limpiar sandbox (excepto headers)
  var lastRow = sandbox.getLastRow();
  if (lastRow > 1) sandbox.getRange(2, 1, lastRow - 1, SANDBOX_HEADERS.length).clearContent();

  // Index para matching contra Liga
  var matchIndex = buildMatchIndex_(ss);
  var ligaSheet  = ss.getSheetByName(SHEETS.liga.name);

  var rows = [];
  var matched = 0, wouldUpdate = 0, alreadyFilled = 0;
  var future = 0;
  var unmatchedSet = {};
  var now = new Date().toISOString();
  var todayYMD = ymd_(new Date());

  events.forEach(function (e) {
    var fxDate = (e.date || '').slice(0, 10);
    var comp = (e.competitions && e.competitions[0]) || {};
    var competitors = comp.competitors || [];
    var homeC = competitors.find ? competitors.find(function (c) { return c.homeAway === 'home'; })
                                 : (competitors[0] && competitors[0].homeAway === 'home' ? competitors[0] : competitors[1]);
    var awayC = competitors.find ? competitors.find(function (c) { return c.homeAway === 'away'; })
                                 : (competitors[0] && competitors[0].homeAway === 'away' ? competitors[0] : competitors[1]);
    var homeApi = (homeC && homeC.team && homeC.team.displayName) || '';
    var awayApi = (awayC && awayC.team && awayC.team.displayName) || '';
    var hsRaw = homeC && homeC.score;
    var asRaw = awayC && awayC.score;
    var hs = (hsRaw !== '' && hsRaw != null && !isNaN(parseInt(hsRaw, 10))) ? parseInt(hsRaw, 10) : '';
    var as_ = (asRaw !== '' && asRaw != null && !isNaN(parseInt(asRaw, 10))) ? parseInt(asRaw, 10) : '';
    var statusRaw = (e.status && e.status.type && (e.status.type.description || e.status.type.name)) || '';

    // qa20: si la fecha es posterior a hoy, no es "sin resultado" — es un partido
    // programado para el futuro. Lo marcamos con etiqueta clara.
    var isFuture = fxDate > todayYMD;
    var status = isFuture ? ('Programado · se juega ' + fxDate) : statusRaw;

    var homeSheet = resolveTeamName_(homeApi);
    var awaySheet = resolveTeamName_(awayApi);

    // Buscar en el index de matches del Sheet (matchId = sha1 de comp+home+away+date)
    var sheetMatchId = detId_('match', 'liga', homeSheet, awaySheet, fxDate);
    var loc = matchIndex[sheetMatchId];
    var matchedYN = loc ? 'Y' : 'N';
    var sheetHas = '', wouldUpd = '';
    var sheetRow = '';

    if (loc) {
      matched++;
      sheetRow = loc.row;
      var realRow = ligaSheet.getRange(loc.row, 1, 1, ligaSheet.getLastColumn()).getValues()[0];
      var parsed = SHEETS.liga.parser(realRow, 'liga', loc.row - 1);
      var hasScore = parsed && parsed.home_score != null && parsed.away_score != null;
      sheetHas = hasScore ? 'Y' : 'N';
      var finished = /Full Time|Match Finished|STATUS_FULL_TIME|FT/i.test(statusRaw);
      if (isFuture) {
        // Partido futuro: no se considera para update aunque no tenga score
        wouldUpd = 'future'; future++;
      } else if (finished && hs !== '' && as_ !== '' && !hasScore) {
        wouldUpd = 'Y'; wouldUpdate++;
      } else {
        wouldUpd = 'N';
        if (hasScore) alreadyFilled++;
      }
    } else {
      // Solo trackeamos como unmatched si NO es futuro (los futuros son ruido aceptable)
      if (!isFuture) {
        if (!unmatchedSet[homeApi]) unmatchedSet[homeApi] = true;
        if (!unmatchedSet[awayApi]) unmatchedSet[awayApi] = true;
      } else {
        future++;
      }
    }

    rows.push([
      fxDate, homeApi, awayApi, hs, as_, status,
      matchedYN,
      loc ? homeSheet : '', loc ? awaySheet : '',
      sheetRow, sheetHas, wouldUpd, now
    ]);
  });

  if (rows.length) {
    sandbox.getRange(2, 1, rows.length, SANDBOX_HEADERS.length).setValues(rows);
  }

  var unmatched = Object.keys(unmatchedSet);
  return {
    ok: true,
    source: 'ESPN',
    fetched: events.length,
    matched: matched,
    would_update: wouldUpdate,
    already_filled: alreadyFilled,
    future: future,
    unmatched: unmatched,
    sandbox_sheet: SANDBOX_SHEET_NAME,
    range: { from: fromDate, to: toDate }
  };
}

// ── fetchOdds_ (qa21): trae propuestas de cuotas L/E/V desde ESPN core API ─
// Para cada partido futuro en el rango, hace una segunda call al core API
// (que sí tiene homeTeamOdds / drawOdds / awayTeamOdds en formato decimal).
// Devuelve lista de proposals con: matchId Sheet + cuotas API + cuotas actuales.
// El frontend muestra la lista y permite aplicar match por match.
function fetchOdds_(p) {
  var today = new Date();
  var fromDate = p.from || ymd_(today);
  var toDate   = p.to   || ymd_(addDays_(today, 14));

  var events;
  try {
    events = espnFetchRange_(ESPN_LEAGUES.liga.slug, fromDate, toDate);
  } catch (err) {
    return { ok: false, error: 'api_call_failed', detail: String(err && err.message) };
  }

  var ss = SpreadsheetApp.getActive();
  var matchIndex = buildMatchIndex_(ss);
  var ligaSheet  = ss.getSheetByName(SHEETS.liga.name);

  var proposals = [];
  var skipped_no_odds = 0;
  var skipped_unmatched = 0;

  events.forEach(function (e) {
    var fxDate = (e.date || '').slice(0, 10);
    var comp = (e.competitions && e.competitions[0]) || {};
    var competitors = comp.competitors || [];
    var homeC = competitors.find ? competitors.find(function (c) { return c.homeAway === 'home'; }) : null;
    var awayC = competitors.find ? competitors.find(function (c) { return c.homeAway === 'away'; }) : null;
    var homeApi = (homeC && homeC.team && homeC.team.displayName) || '';
    var awayApi = (awayC && awayC.team && awayC.team.displayName) || '';

    // Buscar en el Sheet
    var homeSheet = resolveTeamName_(homeApi);
    var awaySheet = resolveTeamName_(awayApi);
    var sheetMatchId = detId_('match', 'liga', homeSheet, awaySheet, fxDate);
    var loc = matchIndex[sheetMatchId];
    if (!loc) { skipped_unmatched++; return; }

    // Fetch odds del core API
    var eventId = e.id;
    var oddsData;
    try {
      oddsData = espnGetCore_('/sports/soccer/leagues/' + ESPN_LEAGUES.liga.slug +
                              '/events/' + eventId + '/competitions/' + eventId + '/odds');
    } catch (err) {
      skipped_no_odds++; return;
    }
    var items = (oddsData && oddsData.items) || [];
    if (!items.length) { skipped_no_odds++; return; }
    var o = items[0]; // primer proveedor (DraftKings por priority)
    var homeML = o.homeTeamOdds && o.homeTeamOdds.moneyLine;
    var awayML = o.awayTeamOdds && o.awayTeamOdds.moneyLine;
    var drawML = o.drawOdds && o.drawOdds.moneyLine;
    // Preferir el "current" si está, sino el moneyLine directo
    if (o.homeTeamOdds && o.homeTeamOdds.current && o.homeTeamOdds.current.moneyLine && o.homeTeamOdds.current.moneyLine.decimal != null) {
      homeML = o.homeTeamOdds.current.moneyLine; // ya es objeto con .decimal
    }
    if (o.awayTeamOdds && o.awayTeamOdds.current && o.awayTeamOdds.current.moneyLine && o.awayTeamOdds.current.moneyLine.decimal != null) {
      awayML = o.awayTeamOdds.current.moneyLine;
    }
    var fl = americanToDecimal_(homeML);
    var fv = americanToDecimal_(awayML);
    var fe = americanToDecimal_(drawML);
    if (fl == null && fe == null && fv == null) { skipped_no_odds++; return; }

    // Cuotas actuales en el Sheet
    var realRow = ligaSheet.getRange(loc.row, 1, 1, ligaSheet.getLastColumn()).getValues()[0];
    var parsed = SHEETS.liga.parser(realRow, 'liga', loc.row - 1);

    proposals.push({
      match_id: sheetMatchId,
      match_date: fxDate,
      home_team: homeSheet,
      away_team: awaySheet,
      provider: o.provider && o.provider.name,
      proposal: { fl: fl, fe: fe, fv: fv },
      current: {
        fl: parsed && parsed.factor_home != null ? parsed.factor_home : null,
        fe: parsed && parsed.factor_draw != null ? parsed.factor_draw : null,
        fv: parsed && parsed.factor_away != null ? parsed.factor_away : null
      }
    });
  });

  // Ordenar por fecha ascendente
  proposals.sort(function (a, b) { return a.match_date < b.match_date ? -1 : a.match_date > b.match_date ? 1 : 0; });

  return {
    ok: true,
    source: 'ESPN Core API · DraftKings',
    proposals: proposals,
    skipped_no_odds: skipped_no_odds,
    skipped_unmatched: skipped_unmatched,
    range: { from: fromDate, to: toDate }
  };
}

// American odds → decimal odds.
// Acepta: número (moneyLine raw) o objeto {decimal, american}.
function americanToDecimal_(ml) {
  if (ml == null) return null;
  // Si es objeto del "current/open", usar decimal directo
  if (typeof ml === 'object') {
    if (ml.decimal != null && !isNaN(ml.decimal)) return +Number(ml.decimal).toFixed(2);
    if (ml.value != null && !isNaN(ml.value)) return +Number(ml.value).toFixed(2);
    var amStr = ml.american || ml.displayValue;
    if (typeof amStr === 'string') {
      var n = parseInt(amStr.replace(/[^\-0-9]/g, ''), 10);
      if (!isNaN(n)) return americanToDecimal_(n);
    }
    return null;
  }
  // Es número (formato American)
  var am = Number(ml);
  if (isNaN(am) || am === 0) return null;
  return +(am > 0 ? am / 100 + 1 : 100 / Math.abs(am) + 1).toFixed(2);
}

// Wrapper para ESPN core API (host distinto)
function espnGetCore_(path) {
  var url = 'https://sports.core.api.espn.com/v2' + path;
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('http_' + code);
  }
  return JSON.parse(res.getContentText());
}

function clearSandbox_() {
  var ss = SpreadsheetApp.getActive();
  var sandbox = ss.getSheetByName(SANDBOX_SHEET_NAME);
  if (!sandbox) return { ok: true, cleared: 0, note: 'sandbox no existía' };
  var lastRow = sandbox.getLastRow();
  if (lastRow > 1) {
    sandbox.getRange(2, 1, lastRow - 1, SANDBOX_HEADERS.length).clearContent();
  }
  return { ok: true, cleared: Math.max(0, lastRow - 1) };
}

// ── Helpers ESPN ────────────────────────────────────────────────────
// ESPN's scoreboard endpoint accepts ?dates=YYYYMMDD-YYYYMMDD but solo retorna
// hasta ~30 días por request. Para rangos más largos, paginamos por mes.
function espnFetchRange_(leagueSlug, fromYMD, toYMD) {
  var all = [];
  var seen = {}; // dedup por event id
  // Iteramos mes a mes (ESPN devuelve un mes calendar por request normalmente)
  var cursor = new Date(fromYMD + 'T12:00:00Z');
  var endD   = new Date(toYMD   + 'T12:00:00Z');
  var safety = 0;
  while (cursor.getTime() <= endD.getTime() && safety++ < 24) {
    // Calcular start/end del mes actual (o hasta endD)
    var y = cursor.getUTCFullYear();
    var m = cursor.getUTCMonth();
    var monthStart = new Date(Date.UTC(y, m, 1, 12));
    var monthEnd   = new Date(Date.UTC(y, m + 1, 0, 12)); // último día del mes
    var fromD = monthStart > cursor ? monthStart : cursor;
    var toD   = monthEnd < endD ? monthEnd : endD;
    var fromStr = ymdCompact_(fromD);
    var toStr   = ymdCompact_(toD);
    var resp = espnGet_('/' + leagueSlug + '/scoreboard', { dates: fromStr + '-' + toStr });
    var events = (resp && resp.events) || [];
    events.forEach(function (e) {
      if (e.id && seen[e.id]) return;
      if (e.id) seen[e.id] = true;
      all.push(e);
    });
    // Avanzar al primer día del mes siguiente
    cursor = new Date(Date.UTC(y, m + 1, 1, 12));
  }
  return all;
}

function espnGet_(path, params) {
  var url = ESPN_BASE + path;
  var qs = Object.keys(params || {}).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  if (qs) url += '?' + qs;
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('http_' + code + ': ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}

function ymdCompact_(d) {
  return d.getUTCFullYear() + pad_(d.getUTCMonth() + 1) + pad_(d.getUTCDate());
}

function resolveTeamName_(apiName) {
  if (TEAM_ALIASES[apiName]) return TEAM_ALIASES[apiName];
  return apiName; // fallback al nombre original
}

function ensureSandboxSheet_(ss) {
  var s = ss.getSheetByName(SANDBOX_SHEET_NAME);
  if (s) return s;
  s = ss.insertSheet(SANDBOX_SHEET_NAME);
  s.getRange(1, 1, 1, SANDBOX_HEADERS.length).setValues([SANDBOX_HEADERS]);
  s.setFrozenRows(1);
  return s;
}

function ymd_(d) {
  return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());
}
function addDays_(d, n) {
  var x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

// ════════════════════════════════════════════════════════════════════
// HUB de fútbol (qa26) — datos oficiales de ESPN, normalizados + cacheados.
// Solo lectura. NO toca la polla. Acción pública: ?action=hub
//   ?action=hub&kind=standings&comp=liga
//   ?action=hub&kind=fixtures&comp=liberta[&from=YYYY-MM-DD&to=YYYY-MM-DD]
//   ?action=hub&kind=bracket&comp=sudamer
//   ?action=hub&kind=scorers&comp=liga
//   &fresh=1  → saltea la caché (forzar refetch)
// ════════════════════════════════════════════════════════════════════
function hub_(p) {
  var kind    = (p.kind || 'standings').toString();
  var compKey = (p.comp || 'liga').toString();
  var comp    = HUB_COMPS[compKey];
  if (!comp) return { ok: false, error: 'unknown_comp', got: compKey, allowed: Object.keys(HUB_COMPS) };
  var allowedKinds = ['standings', 'fixtures', 'bracket', 'scorers'];
  if (allowedKinds.indexOf(kind) === -1)
    return { ok: false, error: 'unknown_kind', got: kind, allowed: allowedKinds };

  var fresh    = (p.fresh === '1' || p.fresh === 'true' || p.fresh === true);
  var hasRange = (kind === 'fixtures' && p.from && p.to);
  var seasonKey = (kind === 'standings' && p.season && /^\d{4}$/.test(p.season)) ? (':' + p.season) : '';
  var cacheKey = 'hub:' + kind + ':' + compKey + (hasRange ? (':' + p.from + ':' + p.to) : '') + seasonKey;
  var cache    = CacheService.getScriptCache();

  if (!fresh) {
    var hit = cache.get(cacheKey);
    if (hit) { try { var o = JSON.parse(hit); o.cached = true; return o; } catch (_) {} }
  }

  var season = (p.season && /^\d{4}$/.test(p.season)) ? p.season : String(new Date().getFullYear());

  var payload;
  try {
    if      (kind === 'standings') payload = hubStandings_(comp.slug, season);
    else if (kind === 'fixtures')  payload = hubFixtures_(comp.slug, hasRange ? p.from : null, hasRange ? p.to : null);
    else if (kind === 'bracket')   payload = hubBracket_(comp.slug);
    else                           payload = hubScorers_(comp.slug);
  } catch (err) {
    return { ok: false, error: 'espn_fetch_failed', detail: err.message, comp: compKey, kind: kind };
  }

  var result = { ok: true, comp: compKey, compLabel: comp.label, kind: kind,
                 cached: false, fetched_at: new Date().toISOString() };
  for (var k in payload) result[k] = payload[k];

  try { cache.put(cacheKey, JSON.stringify(result), HUB_TTL[kind] || 3600); }
  catch (_) { /* item demasiado grande o error de caché → igual devolvemos */ }

  return result;
}

// Tabla de posiciones. Soporta liga (1 tabla) y copas (grupos múltiples).
// Siempre devuelve { groups: [ { name, table:[Standing...] } ] } para uniformar.
// OJO: el endpoint de standings vive en apis/v2 (no apis/site/v2 como el
// scoreboard) y requiere ?season=YYYY. Por eso usa su propio fetch.
function hubStandings_(slug, season) {
  var url = 'https://site.api.espn.com/apis/v2/sports/soccer/' + slug +
            '/standings?season=' + encodeURIComponent(season || new Date().getFullYear());
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('standings_http_' + res.getResponseCode());
  }
  var data = JSON.parse(res.getContentText());
  var groups = [];
  function pushGroup(name, st) {
    if (!st || !st.entries || !st.entries.length) return;
    var table = st.entries.map(hubNormEntry_);
    table.sort(function (a, b) { return (b.pts - a.pts) || (b.dg - a.dg) || (b.gf - a.gf); });
    table.forEach(function (r, i) { if (!r.pos) r.pos = i + 1; });
    groups.push({ name: name || null, table: table });
  }
  if (data.children && data.children.length) {
    data.children.forEach(function (c) { pushGroup(c.name || c.abbreviation, c.standings); });
  } else if (data.standings) {
    pushGroup(null, data.standings);
  }
  return { groups: groups };
}

// Una fila de la tabla. Lee los stats de ESPN por nombre (varían por liga).
function hubNormEntry_(entry) {
  var t = entry.team || {};
  var s = entry.stats || [];
  function g(n) { return espnStatVal_(s, n); }
  return {
    pos:      g('rank'),
    team:     resolveTeamName_(t.displayName || t.shortDisplayName || t.name || ''),
    teamRaw:  t.displayName || t.name || '',
    crest:    (t.logos && t.logos[0] && t.logos[0].href) || t.logo || null,
    pj:  g('gamesPlayed'), g: g('wins'), e: g('ties'), p: g('losses'),
    gf:  g('pointsFor'), gc: g('pointsAgainst'),
    dg:  g('pointDifferential'), pts: g('points')
  };
}

function espnStatVal_(stats, name) {
  for (var i = 0; i < stats.length; i++) {
    var st = stats[i];
    if (st && (st.name === name || st.type === name)) {
      if (st.value != null && !isNaN(st.value)) return Number(st.value);
      var n = parseFloat(st.displayValue);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

// Fixtures/calendario. Sin rango → scoreboard actual (jornada vigente).
// Con from/to → pagina mes a mes (reusa espnFetchRange_).
function hubFixtures_(slug, fromYMD, toYMD) {
  var events;
  if (fromYMD && toYMD) {
    events = espnFetchRange_(slug, fromYMD, toYMD);
  } else {
    var resp = espnGet_('/' + slug + '/scoreboard', {});
    events = (resp && resp.events) || [];
  }
  var fixtures = events.map(hubNormEvent_).filter(function (x) { return x; });
  fixtures.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  return { fixtures: fixtures };
}

function hubNormEvent_(ev) {
  var comp = (ev.competitions && ev.competitions[0]) || {};
  var cs = comp.competitors || [];
  var home = null, away = null;
  cs.forEach(function (c) { if (c.homeAway === 'home') home = c; else if (c.homeAway === 'away') away = c; });
  if (!home || !away) return null;
  function nm(c) { var t = c.team || {}; return resolveTeamName_(t.displayName || t.shortDisplayName || t.name || ''); }
  function cr(c) { var t = c.team || {}; return (t.logos && t.logos[0] && t.logos[0].href) || t.logo || null; }
  function sc(c) { return (c.score != null && c.score !== '') ? Number(c.score) : null; }
  var stType = ((comp.status || ev.status || {}).type) || {};
  var state  = stType.state || 'pre';
  var status = state === 'post' ? 'finished' : state === 'in' ? 'live' : 'scheduled';
  var round  = (comp.notes && comp.notes[0] && comp.notes[0].headline) || null;
  return {
    id: ev.id, date: ev.date, round: round,
    home: nm(home), away: nm(away),
    homeCrest: cr(home), awayCrest: cr(away),
    homeScore: sc(home), awayScore: sc(away),
    status: status,
    statusDetail: stType.shortDetail || stType.description || ''
  };
}

// Bracket de eliminación. ESPN no expone un bracket estructurado en site.api,
// así que lo derivamos agrupando fixtures por ronda. Marcado partial:true —
// se refina en F3 una vez validado qué trae ESPN para cada copa.
function hubBracket_(slug) {
  var fx = hubFixtures_(slug).fixtures;
  var byRound = {};
  fx.forEach(function (f) { var r = f.round || 'Sin ronda'; (byRound[r] = byRound[r] || []).push(f); });
  var rounds = Object.keys(byRound).map(function (r) { return { round: r, ties: byRound[r] }; });
  return { partial: true,
           note: 'Derivado de fixtures por ronda; ESPN no expone bracket estructurado. Refinar en F3.',
           rounds: rounds };
}

// Goleadores. Placeholder honesto: la fuente actual no los expone de forma
// confiable. Se implementa en F4 (probablemente vía core API / leaders).
function hubScorers_(slug) {
  return { scorers: [], note: 'Goleadores aún no disponibles en esta fuente (pendiente F4).' };
}

// ── Test desde el editor de Apps Script (clic "Run" en alguna) ─────
function test_health()   { log_(JSON.stringify(health_(),   null, 2)); }
function test_state()    { log_(JSON.stringify(getState_(), null, 2).slice(0, 4000)); }
function test_status()   { log_(JSON.stringify(syncStatus_(),null, 2)); }
function test_hub_liga()    { log_(JSON.stringify(hub_({ kind:'standings', comp:'liga',    fresh:'1' }), null, 2).slice(0, 4000)); }
function test_hub_liberta() { log_(JSON.stringify(hub_({ kind:'standings', comp:'liberta', fresh:'1' }), null, 2).slice(0, 4000)); }
function test_hub_fixtures(){ log_(JSON.stringify(hub_({ kind:'fixtures',  comp:'sudamer', fresh:'1' }), null, 2).slice(0, 4000)); }
function test_fetch_results() { log_(JSON.stringify(fetchResults_({}), null, 2)); }
