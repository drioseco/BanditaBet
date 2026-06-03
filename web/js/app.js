// ════════════════════════════════════════════════════════════════════
// Entry point del frontend — nav, bootstrap, re-render.
// ════════════════════════════════════════════════════════════════════
import { CONFIG } from './config.js?v=20260603qa32';
import { getState, setState, subscribe } from './state.js?v=20260603qa32';
import { bootstrapState, refreshSyncStatus, primeFromCache } from './api.js?v=20260603qa32';
import { getActivePlayer, setActivePlayer } from './auth.js?v=20260603qa32';
import { renderHome, renderScopeChips, renderStandings } from './render-home.js?v=20260603qa32';
import { renderFixtures } from './render-fixtures.js?v=20260603qa32';
import { renderPicks }    from './render-picks.js?v=20260603qa32';
import { renderStats }    from './render-stats.js?v=20260603qa32';
import { renderAdmin }    from './render-admin.js?v=20260603qa32';
import { renderHub }      from './render-hub.js?v=20260603qa32';
import { toast, renderSyncPill, renderLivePill } from './game-fx.js?v=20260603qa32';
import { loadTeamLogos } from './team-logos.js?v=20260603qa32';

const VIEWS = ['home', 'fixtures', 'picks', 'stats', 'hub', 'admin'];

// ── Nav ──────────────────────────────────────────────────────────────
function goTo(viewId, btn) {
  for (const v of VIEWS) {
    const el = document.getElementById('s-' + v);
    if (el) el.classList.toggle('hidden', v !== viewId);
  }
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  setState({ currentView: viewId });
  renderActive();
}
window.bbGoTo = goTo;
window.bbToast = toast;

function renderActive() {
  const v = getState().currentView;
  if (v === 'home')     renderHome();
  if (v === 'fixtures') renderFixtures();
  if (v === 'picks')    renderPicks();
  if (v === 'stats')    renderStats();
  if (v === 'hub')      renderHub();
  if (v === 'admin')    renderAdmin();
  // Header pills
  renderSyncPill(document.getElementById('hdr-sync'));
  const live = getState().matches.filter(m => {
    if (!m.match_date) return null;
    const dt = new Date(m.match_date + 'T' + (m.match_time || '12:00'));
    const h = (dt - new Date()) / 3600000;
    return h != null && h <= 0 && h > -3 && (m.home_score == null || m.away_score == null);
  });
  renderLivePill(document.getElementById('hdr-live'), live);
  renderPickerPill();
}

function wireSheetFilters() {
  document.querySelectorAll('#s-fixtures .ft[data-sheet]').forEach(b => {
    b.onclick = () => { setState({ currentSheet: b.dataset.sheet, currentRound: 'all' }); renderFixtures(); };
  });
  document.querySelectorAll('#s-picks .ft[data-pick-sheet]').forEach(b => {
    b.onclick = () => { setState({ currentPickSheet: b.dataset.pickSheet }); renderPicks(); };
  });
  // Chips de scope de la Tabla (qa32) — delegación, los chips se regeneran.
  const scopeBox = document.getElementById('home-scope-chips');
  if (scopeBox) {
    scopeBox.addEventListener('click', e => {
      const b = e.target.closest('.ft[data-scope]');
      if (!b) return;
      setState({ homeScope: b.dataset.scope });
      renderScopeChips();
      renderStandings();
    });
  }
}

// ── Picker UI en el header ──────────────────────────────────────────
function pickerImg(name) {
  return `./img/characters/${name.toLowerCase()}.png`;
}

function renderPickerPill() {
  const el = document.getElementById('hdr-auth');
  if (!el) return;
  const cur = getState().picker;
  const player = cur ? getState().players.find(p => p.name === cur) : null;
  const c = player?.color || 'var(--bb-ink)';
  el.innerHTML = cur
    ? `<button class="bb-picker-pill" id="bb-picker-btn" title="Cambiar jugador" style="--pc:${c}">
        <img class="bb-picker-img" src="${pickerImg(cur)}" alt="${cur}" onerror="this.style.display='none'">
        <span>${cur}</span>
       </button>`
    : `<button class="bb-sync-pill" id="bb-picker-btn" title="Elegir jugador">Elegí jugador</button>`;
  document.getElementById('bb-picker-btn').onclick = openPickerModal;
}

function openPickerModal() {
  const players = getState().players;
  const html = `
    <div class="bb-modal-backdrop" id="bb-modal-backdrop">
      <div class="bb-modal">
        <div class="bb-modal-hd">¿Quién eres?</div>
        <div class="bb-modal-sub">Tu elección queda guardada en este browser. Cualquiera puede cambiarla — confiamos en la cancha.</div>
        <div class="bb-modal-players">
          ${players.map(p => `
            <button class="bb-modal-player" data-name="${p.name}" style="border-color:${p.color}">
              <img class="bb-modal-ava" src="${pickerImg(p.name)}" alt="${p.name}" style="border-color:${p.color}" onerror="this.style.display='none'">
              <div class="bb-modal-pname">${p.name}</div>
            </button>`).join('')}
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);
  document.querySelectorAll('.bb-modal-player').forEach(b => {
    b.onclick = () => {
      const name = b.dataset.name;
      setActivePlayer(name);
      setState({ picker: name });
      document.getElementById('bb-modal-backdrop').remove();
      renderActive();
      toast('★ Ahora jugás como ' + name);
    };
  });
  document.getElementById('bb-modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'bb-modal-backdrop') e.target.remove();
  });
}

// ── Bootstrap ───────────────────────────────────────────────────────
async function init() {
  wireSheetFilters();

  // Recuperar player elegido la última vez
  const saved = getActivePlayer();
  if (saved) setState({ picker: saved });

  subscribe(() => {
    renderSyncPill(document.getElementById('hdr-sync'));
  });

  // qa29 · stale-while-revalidate: si hay caché local, pintar YA (instantáneo)
  // mientras se busca data fresca en background.
  if (primeFromCache()) {
    if (!getState().picker && getState().players[0]) setState({ picker: getState().players[0].name });
    renderActive();
  }

  try {
    // Bootstrap state y escudos en paralelo
    await Promise.all([bootstrapState(), loadTeamLogos()]);
    if (!getState().picker && getState().players[0]) {
      setState({ picker: getState().players[0].name });
    }
  } catch (e) {
    console.error(e);
    toast('No se pudo cargar la data — revisá CONFIG.API_URL', 'err');
  }

  renderActive();
  if (!getActivePlayer()) setTimeout(openPickerModal, 600);

  setInterval(refreshSyncStatus, 60_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
