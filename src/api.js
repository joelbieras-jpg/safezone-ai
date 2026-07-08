/**
 * SafeZone AI – API-Client + Session-Speicher.
 *
 * Merkt sich Token + Nutzer in AsyncStorage, sodass die App beim Neustart weiß,
 * als welche Rolle man eingeloggt war. Logout löscht die Session.
 * Server-URL ist konfigurierbar (Einstellungen) – Default = Tailscale-IP LXC 160.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_BASE = "http://100.105.250.113:8080"; // Tailscale-IP des Servers

// Kanonische Bahnhof-Orte (identisch zur Kamera-App) – Auswahl für Patrol beim
// Einsatzbild („wo wurde das Bild gemacht"). Fallback, falls /orte nicht lädt.
export const ORTE = [
  "Haupteingang",
  "Bahnsteig 1 – Nord",
  "Bahnsteig 2 – Mitte",
  "Bahnsteig 3 – Aufzug",
  "Unterführung / Abschnitt 3",
  "Ausgang Ost / Vorplatz",
];

let _base = DEFAULT_BASE;
let _token = null;

export async function initApi() {
  const b = await AsyncStorage.getItem("baseUrl");
  if (b) _base = b;
  _token = await AsyncStorage.getItem("token");
}

export function getBaseUrl() { return _base; }
export async function setBaseUrl(url) { _base = url; await AsyncStorage.setItem("baseUrl", url); }

// Server-Erreichbarkeit prüfen (für die Live-Statusanzeige). Kurzer Timeout,
// wirft nie – liefert true/false.
export async function checkHealth() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${_base}/health`, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && _token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${_base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// --- Auth ---
export async function login(username, password) {
  const data = await req("/auth/login", { method: "POST", auth: false, body: { username, password } });
  _token = data.token;
  await AsyncStorage.setItem("token", _token);
  await AsyncStorage.setItem("user", JSON.stringify(data.user));
  return data.user;
}
export async function restoreUser() {
  if (!_token) return null;
  try { return await req("/auth/me"); }   // Token gegen Server prüfen
  catch { await logout(); return null; }
}
export async function logout() {
  _token = null;
  await AsyncStorage.multiRemove(["token", "user"]);
}

// --- Vorfälle (rollen-gefiltert im Backend) ---
export const listVorfaelle   = () => req("/vorfaelle");
export const getVorfall      = (id) => req(`/vorfaelle/${id}`);
export const bewerten        = (id, typ, kommentar) => req(`/vorfaelle/${id}/bewertung`, { method: "POST", body: { typ, kommentar } });
export const freigeben       = (id) => req(`/vorfaelle/${id}/freigabe`, { method: "POST" });
export const koordinieren    = (id, status, notiz) => req(`/vorfaelle/${id}/koordination`, { method: "POST", body: { status, notiz } });
export const getEmpfehlungen = (id) => req(`/vorfaelle/${id}/empfehlung`);
export const bestaetigen     = (eid) => req(`/empfehlung/${eid}/bestaetigen`, { method: "POST" });
export const beweisAnfordern = (id, beschreibung) => req(`/vorfaelle/${id}/beweis-anforderung`, { method: "POST", body: { beschreibung } });

// --- Medien (Fotos/Live/Sequenz/Einsatzbilder) ---
// <Image>/<Video> in React Native können keine Auth-Header setzen -> Token als
// Query-Parameter anhängen (zusätzlich durch Tailscale-VPN abgesichert).
export function mediaUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${_base}${path}${_token ? `${sep}token=${encodeURIComponent(_token)}` : ""}`;
}
export const beweisbildUrl   = (id) => mediaUrl(`/vorfaelle/${id}/beweisbild`);
export const sequenzFrameUrl = (id, idx) => mediaUrl(`/vorfaelle/${id}/sequenz/${idx}`);
export const einsatzbildUrl  = (id, name) => mediaUrl(`/vorfaelle/${id}/einsatzbild/${name}`);
export const getSequenz      = (id) => req(`/vorfaelle/${id}/sequenz`);

// Kanonische Ortsliste vom Server (mit lokalem Fallback ORTE).
export async function getOrte() {
  try { const d = await req("/orte", { auth: false }); return (d && d.orte) || ORTE; }
  catch { return ORTE; }
}

// Patrol: Einsatzbild (Foto vom Feld) hochladen – multipart, per Bearer-Token.
// Optional mit Ort (wo das Bild gemacht wurde).
export async function uploadEinsatzbild(id, uri, ort) {
  const form = new FormData();
  form.append("datei", { uri, name: "einsatz.jpg", type: "image/jpeg" });
  if (ort) form.append("ort", ort);
  const headers = {};
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${_base}/vorfaelle/${id}/einsatzbild`, { method: "POST", headers, body: form });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
