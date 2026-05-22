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

function handle(action, p) {
  try {
    switch (action) {
      case 'health':       return health_();
      case 'state':        return getState_();
      case 'sync-status':  return syncStatus_();
      case 'savePicks':    return savePicks_(p);
      case 'setResult':    return setResult_(p);
      case 'addMatch':     return addMatch_(p);
      case 'updateFactors': return updateFactors_(p);
      case 'fetchResults':  return fetchResults_(p);
      case 'clearSandbox':  return clearSandbox_();
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
  // experto
  return {
    torneo:  1,
    date:    2,
    home:    3,
    hScore:  4,
    aScore:  5,
    away:    6,
    fl:      7,
    fe:      8,
    fv:      9,
    picks: { Dari: { l: 10, v: 11 }, Kmi: { l: 12, v: 13 }, Blopa: { l: 14, v: 15 }, Pela: { l: 16, v: 17 } },
    result:  18,
    factor:  19,
    points:  { Dari: 24, Kmi: 25, Blopa: 26, Pela: 27 },
    statuses:{ Dari: 28, Kmi: 29, Blopa: 30, Pela: 31 },
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
  if (!r[3] || !r[6]) return null;
  return {
    round_name:   str_(r[1]) || null,
    venue:        null,
    match_date:   dateOnly_(r[2]),
    home_team:    str_(r[3]),
    home_score:   numOrNull_(r[4]),
    away_score:   numOrNull_(r[5]),
    away_team:    str_(r[6]),
    factor_home:  numOrNull_(r[7]),
    factor_draw:  numOrNull_(r[8]),
    factor_away:  numOrNull_(r[9]),
    picks: {
      Dari:  { home_score: numOrNull_(r[10]), away_score: numOrNull_(r[11]) },
      Kmi:   { home_score: numOrNull_(r[12]), away_score: numOrNull_(r[13]) },
      Blopa: { home_score: numOrNull_(r[14]), away_score: numOrNull_(r[15]) },
      Pela:  { home_score: numOrNull_(r[16]), away_score: numOrNull_(r[17]) },
    },
    result: str_(r[18]) || null,
    result_factor: numOrNull_(r[19]),
    points:  { Dari: numOrNull_(r[24]) || 0, Kmi: numOrNull_(r[25]) || 0, Blopa: numOrNull_(r[26]) || 0, Pela: numOrNull_(r[27]) || 0 },
    status_per_player: { Dari: str_(r[28]), Kmi: str_(r[29]), Blopa: str_(r[30]), Pela: str_(r[31]) },
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

// ── Test desde el editor de Apps Script (clic "Run" en alguna) ─────
function test_health()   { log_(JSON.stringify(health_(),   null, 2)); }
function test_state()    { log_(JSON.stringify(getState_(), null, 2).slice(0, 4000)); }
function test_status()   { log_(JSON.stringify(syncStatus_(),null, 2)); }
function test_fetch_results() { log_(JSON.stringify(fetchResults_({}), null, 2)); }
