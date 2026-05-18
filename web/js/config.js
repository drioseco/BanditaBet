// ════════════════════════════════════════════════════════════════════
// BanditaBet · runtime config
// ════════════════════════════════════════════════════════════════════
//
// Antes de abrir la app, reemplazar API_URL con la URL del Apps Script
// Web App deployado. Tiene el formato:
//   https://script.google.com/macros/s/AKfycb.../exec
//
// Para sobreescribir sin tocar este archivo, agregar al index.html:
//   <body data-api-url="https://script.google.com/macros/s/.../exec">
// o:
//   <script>window.BB_CONFIG = { API_URL: '...' }</script>  (antes de app.js)
// ════════════════════════════════════════════════════════════════════

const fromBody = () => {
  const b = document.body || {};
  return {
    API_URL: b.dataset?.apiUrl,
  };
};

const overrides = { ...(window.BB_CONFIG || {}), ...fromBody() };

export const CONFIG = {
  // ⬇ URL del Apps Script Web App deployado de BanditaBet
  API_URL: overrides.API_URL || 'https://script.google.com/macros/s/AKfycbwEUrzwgUgG6702bwFk3JZP_ujkSSsYaOyytku35K7k6v02GGSjvFIMDuYE2tVJcP0d1A/exec',

  // Modo "selector de jugador" — sin OAuth.
  // Apps Script publicado anyone-with-link no requiere login; usamos el
  // selector de jugador del v1 + lock por marcador para integridad.
  AUTH_MODE: 'picker',   // 'picker' | 'google-signin' (no implementado todavía)

  // Feature flags
  FEATURES: {
    CONFETTI:   true,
    BADGES:     true,
    COUNTDOWN:  true,
    LIVE_PULSE: true,
    SOUNDS:     false,
  },

  PLAYERS: ['Dari', 'Kmi', 'Blopa', 'Pela'],
};

export const API = () => (CONFIG.API_URL || '').replace(/\/$/, '');
