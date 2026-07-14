/**
 * SafeZone AI – Echtzeit-Verbindung (WebSocket) + Benachrichtigungen.
 *
 * Hält EINE dauerhafte WebSocket-Verbindung zum Backend (/ws) offen und verteilt
 * die Live-Events an angemeldete Bildschirme (Dashboards aktualisieren sich damit
 * SOFORT – kein manuelles Runterwischen mehr nötig).
 *
 * Benachrichtigungen: Ist die App NICHT im Vordergrund (minimiert/Standby), wird
 * eine lokale Benachrichtigung gezeigt (notify.js). Im Vordergrund wird NICHT
 * benachrichtigt – dort nur die Liste aktualisiert.
 *
 * ROLLENGERECHT (siehe notify.js notifyForEvent):
 *   cctv       -> 'vorfall.neu'      (ungepruefte KI-Detektion, nur CCTV)
 *   patrol     -> 'vorfall.bewertet' mit status='sicherheitsrelevant' (Einsatz)
 *   vendor     -> 'empfehlung'       (reduziert, OHNE KI-Details)
 *   prosecutor -> 'vorfall.freigegeben'
 *
 * Die WS-Verbindung wird mit dem Session-Token aufgebaut (?token=...); der Server
 * stellt daraufhin nur die fuer die Rolle erlaubten Events zu. Die Whitelist in
 * notify.js prueft das clientseitig ein zweites Mal (Doppelabsicherung).
 *
 * HINWEIS: Der frühere Foreground-Service (notifee asForegroundService) wurde
 * entfernt – er verursachte auf Android 14 einen nativen Absturz nach dem Login
 * (fehlender/inkompatibler foregroundServiceType). Zuverlässige Zustellung bei
 * dauerhaft geschlossener App folgt separat (getestet per Crash-/Remote-Log).
 * Alle notifee-Aufrufe sind defensiv (try/catch) – dürfen die App nie crashen.
 *
 * Vollständig selbst-gehostet (kein Google/FCM), Zustellung über Tailscale.
 */
import { AppState } from "react-native";
import * as api from "./api";
import { ensureChannels, notifyForEvent } from "./notify";
import { rlog } from "./crashlog";

let ws = null;
let stopped = true;
let backoff = 1000;
let appState = AppState.currentState;
const subscribers = new Set();

// App-Vorder-/Hintergrund verfolgen (steuert, ob benachrichtigt wird)
try { AppState.addEventListener("change", (s) => { appState = s; }); } catch (_) {}

// --- Abonnenten (React-Dashboards) ----------------------------------------
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
function emit(ev) {
  subscribers.forEach((fn) => { try { fn(ev); } catch (_) {} });
}

// http(s)://host:port  ->  ws(s)://host:port/ws?token=...
// Das Token authentifiziert die WS-Verbindung; der Server leitet daraus die Rolle
// ab und stellt nur deren Events zu. (React-Native-WebSocket kennt keine eigenen
// Header-Optionen fuer den Handshake -> Query-Parameter, wie vom Backend erwartet.)
function wsUrl() {
  const base = api.getBaseUrl().replace(/^http/, "ws") + "/ws";
  const tok = api.getToken();
  return tok ? `${base}?token=${encodeURIComponent(tok)}` : base;
}

function connect() {
  if (stopped) return;
  try {
    ws = new WebSocket(wsUrl());
  } catch (_) {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => { backoff = 1000; };
  ws.onmessage = async (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch (_) { return; }
    emit(ev);   // Dashboards sofort aktualisieren
    // Benachrichtigung NUR wenn App nicht im Vordergrund; welches Event fuer
    // welche Rolle relevant ist, entscheidet notifyForEvent (Datenschutz!).
    if (appState !== "active") {
      try { await notifyForEvent(ev, api.getRole()); } catch (_) {}
    }
  };
  ws.onerror = () => { try { ws && ws.close(); } catch (_) {} };
  ws.onclose = () => { ws = null; scheduleReconnect(); };
}

function scheduleReconnect() {
  if (stopped) return;
  const delay = backoff;
  backoff = Math.min(backoff * 2, 15000);
  setTimeout(connect, delay);
}

/** Live-Betrieb starten (nach Login). Nie werfen – darf die App nicht crashen. */
export async function startLive() {
  if (!stopped) return;
  stopped = false;
  backoff = 1000;
  try { await ensureChannels(); } catch (e) { rlog("ensureChannels-fehler: " + (e?.message || e)); }
  connect();
}

/** Live-Betrieb beenden (Logout). */
export async function stopLive() {
  stopped = true;
  try { ws && ws.close(); } catch (_) {}
  ws = null;
}
