// Admin view — cargar resultados, agregar fixtures, info de sync.
import { getState, setState } from './state.js?v=20260516qa10';
import { setMatchResult, addMatch as apiAddMatch, refreshSyncStatus } from './api.js?v=20260516qa10';
import { toast, fireConfetti } from './game-fx.js?v=20260516qa10';

export function renderAdmin() {
  fillAdminSel();
  refreshSyncStatus();

  const helpEl = document.getElementById('sync-help-info');
  if (helpEl) {
    const { lastSyncedAt, syncSources, syncFreshness } = getState();
    helpEl.innerHTML = lastSyncedAt
      ? `<strong>Última sincronización:</strong> ${new Date(lastSyncedAt).toLocaleString('es-CL')} (${syncFreshness}). Fuente: ${syncSources || '—'}.`
      : `<strong>Aún no hay sincronizaciones registradas.</strong> Configurá el Apps Script en el Sheet (ver <code>apps-script/README.md</code>) para que los cambios lleguen acá automáticamente.`;
  }

  // wire up botones (solo una vez)
  if (!renderAdmin._wired) {
    document.getElementById('a-sheet').onchange = fillAdminSel;
    document.getElementById('a-match').onchange = fillAdminMatch;
    document.getElementById('btn-save-result').onclick = saveResult;
    document.getElementById('btn-add-match').onclick = addMatchHandler;
    renderAdmin._wired = true;
  }
}

function fillAdminSel() {
  const compId = document.getElementById('a-sheet').value;
  const { matches, rounds } = getState();
  const data = matches
    .filter(m => m.competition_id === compId)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  const sel = document.getElementById('a-match');
  sel.innerHTML = '<option value="">— seleccionar —</option>';
  for (const m of data) {
    const r = rounds.find(rr => rr.id === m.round_id);
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = `${r?.name || ''} · ${m.home_team} vs ${m.away_team} (${m.match_date})`;
    sel.appendChild(o);
  }
}

function fillAdminMatch() {
  const matchId = document.getElementById('a-match').value;
  if (!matchId) return;
  const m = getState().matches.find(x => x.id === matchId);
  if (!m) return;
  document.getElementById('a-hs').value = m.home_score ?? '';
  document.getElementById('a-as').value = m.away_score ?? '';
  document.getElementById('a-factor').value = '';
}

async function saveResult() {
  const matchId = document.getElementById('a-match').value;
  if (!matchId) { toast('Selecciona un fixture', 'err'); return; }
  const current = getState().matches.find(x => x.id === matchId);
  const home_score = parseInt(document.getElementById('a-hs').value);
  const away_score = parseInt(document.getElementById('a-as').value);
  const factor = parseFloat(document.getElementById('a-factor').value);
  if (isNaN(home_score) || isNaN(away_score)) { toast('Ingresa el marcador', 'err'); return; }
  try {
    const res = await setMatchResult(matchId, {
      home_score, away_score,
      ...(isNaN(factor) ? {} : { factor }),
    });
    toast(`★ ${current?.home_team || 'Local'} ${home_score}−${away_score} ${current?.away_team || 'Visita'}`);
    fireConfetti({ count: 50 });
    // optimistic merge
    const ms = getState().matches.slice();
    const idx = ms.findIndex(x => x.id === matchId);
    if (idx >= 0) {
      ms[idx] = {
        ...ms[idx],
        home_score,
        away_score,
        result: res.result,
        result_factor: res.result_factor,
        status: res.result_factor ? 'finished' : ms[idx].status,
      };
    }
    setState({ matches: ms });
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

async function addMatchHandler() {
  const compId  = document.getElementById('n-sheet').value;
  const home    = document.getElementById('n-home').value.trim();
  const away    = document.getElementById('n-away').value.trim();
  const date    = document.getElementById('n-date').value;
  const round   = document.getElementById('n-fecha').value.trim();
  const fl      = parseFloat(document.getElementById('n-fl').value);
  const fe      = parseFloat(document.getElementById('n-fe').value);
  const fv      = parseFloat(document.getElementById('n-fv').value);
  if (!home || !away || !date) { toast('Completa los campos', 'err'); return; }
  try {
    const res = await apiAddMatch({
      competition_id: compId,
      round_name:     round || 'Sin asignar',
      match_date:     date,
      home_team:      home,
      away_team:      away,
      factor_home:    isNaN(fl) ? null : fl,
      factor_draw:    isNaN(fe) ? null : fe,
      factor_away:    isNaN(fv) ? null : fv,
    });
    toast(`✓ ${home} vs ${away} agregado`);
    setState({ matches: [...getState().matches, res.match] });
    ['n-home','n-away','n-fecha','n-fl','n-fe','n-fv'].forEach(id => document.getElementById(id).value = '');
    fillAdminSel();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}
