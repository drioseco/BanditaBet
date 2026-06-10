// ════════════════════════════════════════════════════════════════════
// Escudos de equipos (qa16)
// Lee web/data/team-logos.json y resuelve nombre → URL.
// Para equipos sin mapeo, genera un fallback con iniciales coloreadas.
// ════════════════════════════════════════════════════════════════════

let _cache = null;
let _loading = null;

const CDN_TEMPLATE = 'https://media.api-sports.io/football/teams/{id}.png';

export async function loadTeamLogos() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = fetch('./data/team-logos.json?v=20260607qa41')
    .then(r => r.json())
    .then(j => (_cache = j))
    .catch(() => (_cache = {}));
  return _loading;
}

export function teamShieldURL(name) {
  if (!_cache) return null;
  const entry = _cache[name];
  if (!entry) return null;
  if (entry.url) return entry.url;
  if (entry.id != null) return CDN_TEMPLATE.replace('{id}', entry.id);
  return null;
}

// HTML para inyectar inline. size ∈ 'sm' | 'md' | 'lg'.
// Devuelve siempre algo: si no hay logo, devuelve fallback con iniciales.
export function teamShieldHTML(name, size = 'sm') {
  const url = teamShieldURL(name);
  const initials = teamInitials(name);
  const color = hashColor(name);
  if (url) {
    // El onerror cae al fallback sin romper layout
    return `<span class="ts ts-${size}" title="${escapeAttr(name)}"><img src="${url}" alt="" onerror="this.outerHTML='<span class=&quot;ts-fallback&quot; style=&quot;background:${color}&quot;>${initials}</span>'"></span>`;
  }
  return `<span class="ts ts-${size}" title="${escapeAttr(name)}"><span class="ts-fallback" style="background:${color}">${initials}</span></span>`;
}

// ── Helpers ─────────────────────────────────────────────────────────

function teamInitials(name) {
  // Remover sufijos como "(ESP)", "(ARG)"
  const clean = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const words = clean.split(/\s+/).filter(w => w && !/^(de|del|la|el|los|las)$/i.test(w));
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0]?.toUpperCase() || '').join('');
  }
  return clean.slice(0, 2).toUpperCase();
}

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const colors = ['#1E4FB8', '#E8442C', '#E8B33D', '#2E6B3A', '#8C1D2F', '#5A3FA0', '#0A6E6E', '#B25908'];
  return colors[Math.abs(h) % colors.length];
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
