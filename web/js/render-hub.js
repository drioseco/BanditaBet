// ════════════════════════════════════════════════════════════════════
// Hub de fútbol (piloto · qa26) — tabla de posiciones oficial en vivo.
// Datos vía ?action=hub del Apps Script (ESPN normalizado + cacheado).
// Independiente de la polla. F1: standings de Liga/Libertadores/Sudamericana.
// ════════════════════════════════════════════════════════════════════
import { getHub } from './api.js?v=20260531qa26';

let _comp = 'liga';
let _wired = false;

export function renderHub() {
  if (!_wired) wire();
  load();
}

function wire() {
  document.querySelectorAll('#hub-comps .hub-comp').forEach(btn => {
    btn.onclick = () => {
      if (btn.classList.contains('on')) return;
      document.querySelectorAll('#hub-comps .hub-comp').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      _comp = btn.dataset.comp;
      load();
    };
  });
  const refresh = document.getElementById('hub-refresh');
  if (refresh) refresh.onclick = () => load(true);
  _wired = true;
}

async function load(fresh = false) {
  const root = document.getElementById('hub-content');
  if (!root) return;
  root.innerHTML = '<div class="hub-loading">Cargando tabla…</div>';
  try {
    const r = await getHub('standings', _comp, { fresh });
    if (!r || r.ok === false) throw new Error((r && r.error) || 'sin datos');
    const groups = r.groups || [];
    if (!groups.length) {
      root.innerHTML = `<div class="hub-empty">Todavía no hay tabla disponible para ${r.compLabel || _comp}.<br><span class="hub-empty-sub">Puede ser que la competición no haya arrancado o que la fuente aún no publique posiciones.</span></div>`;
      return;
    }
    const single = groups.length === 1;
    root.innerHTML = groups.map(g => groupTable(g, single)).join('');
    root.insertAdjacentHTML('beforeend', footer(r));
  } catch (e) {
    root.innerHTML = `<div class="hub-empty">No se pudo cargar la tabla.<br><span class="hub-empty-sub">${e.message}</span></div>`;
  }
}

function groupTable(g, single) {
  const head = single ? '' : `<div class="hub-group-name">${g.name || 'Grupo'}</div>`;
  const rows = (g.table || []).map(r => row(r)).join('');
  return `
    <div class="hub-tablecard">
      ${head}
      <table class="hub-table">
        <thead>
          <tr>
            <th class="hub-c-pos">#</th>
            <th class="hub-c-team">Equipo</th>
            <th>PJ</th><th>G</th><th>E</th><th>P</th>
            <th class="hub-hide-sm">GF</th><th class="hub-hide-sm">GC</th>
            <th>DG</th><th class="hub-c-pts">Pts</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function row(r) {
  const crest = r.crest
    ? `<img class="hub-crest" src="${r.crest}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<span class="hub-crest hub-crest-empty"></span>';
  const dg = (r.dg > 0 ? '+' : '') + (r.dg ?? 0);
  return `
    <tr>
      <td class="hub-c-pos">${r.pos ?? ''}</td>
      <td class="hub-c-team">${crest}<span class="hub-team-name">${r.team || ''}</span></td>
      <td>${num(r.pj)}</td><td>${num(r.g)}</td><td>${num(r.e)}</td><td>${num(r.p)}</td>
      <td class="hub-hide-sm">${num(r.gf)}</td><td class="hub-hide-sm">${num(r.gc)}</td>
      <td>${dg}</td>
      <td class="hub-c-pts">${num(r.pts)}</td>
    </tr>`;
}

function num(v) { return (v == null) ? '–' : v; }

function footer(r) {
  let when = '';
  if (r.fetched_at) {
    const d = new Date(r.fetched_at);
    when = d.toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const cached = r.cached ? ' · desde caché' : '';
  return `<div class="hub-footer">Fuente: ESPN${cached}${when ? ' · actualizado ' + when : ''}. Datos referenciales.</div>`;
}
