// ════════════════════════════════════════════════════════════════════
// Auth simplificada — modo "selector de jugador".
//
// Apps Script publicado como Web App con "Anyone with link" no expone
// la identidad del usuario al backend. Para 4 amigos, usamos el modelo
// del v1: el jugador se selecciona en el frontend.
//
// Persistimos la elección en localStorage para que cada uno tenga su
// "perfil" pegado al browser.
//
// Si en el futuro queremos hardenizar, las opciones son:
//   - Google Identity Services (id_token JWT) + validación en Apps Script
//   - PIN de 4 dígitos por jugador (PIN guardado encriptado en otra pestaña)
//   - Migrar a Firebase Auth
// ════════════════════════════════════════════════════════════════════

const KEY = 'bb_picker';

export function getActivePlayer() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setActivePlayer(name) {
  try { localStorage.setItem(KEY, name); } catch {}
}

// Stubs — compatibilidad con código que importa de aquí
export function getToken()       { return null; }
export function getUser()        { return null; }
export function onAuthChange(_)  { return () => {}; }
export async function initAuth() { /* nada */ }
