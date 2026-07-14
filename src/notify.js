/**
 * SafeZone AI - Benachrichtigungen (notifee), rollengerecht.
 *
 * Zeigt Heads-up-Benachrichtigungen aufs Geraet, wenn die App NICHT im
 * Vordergrund ist (minimiert / Standby / Bildschirm aus). Ist die App offen,
 * wird NICHT benachrichtigt - dort aktualisiert sich die Liste in Echtzeit
 * (siehe live.js).
 *
 * ROLLENTRENNUNG (hart, Datenschutz + Alarm-Hygiene):
 *   - cctv       : 'vorfall.neu' - die ungepruefte KI-Rohdetektion. NUR CCTV darf
 *                  diese sehen (CCTV ist die Instanz, die sie bewertet).
 *   - patrol     : 'vorfall.bewertet' MIT status='sicherheitsrelevant' - also erst
 *                  die menschliche Einsatzausloesung. KEINE Rohdetektionen: sonst
 *                  Alarm bei jedem spaeteren Fehlalarm -> Alarmmuedigkeit.
 *   - vendor     : NUR 'empfehlung' (Handlungsempfehlung/Entwarnung). Vendors
 *                  duerfen KEINE KI-Detektion, KEINE Gefahrenart, KEINE Konfidenz,
 *                  KEINE Kamerabilder/Fall-Details sehen - auch nicht im
 *                  Benachrichtigungstext. Daher wird fuer Vendors NIE
 *                  /vorfaelle/{id} (Volldetail) abgefragt, sondern ausschliesslich
 *                  /vorfaelle/{id}/empfehlung (reduziert: Bereich + Empfehlung).
 *   - prosecutor : NUR 'vorfall.freigegeben' - Faelle ohne Freigabe darf er nicht
 *                  einmal der Existenz nach kennen (kein Fall-ID-Leak).
 *
 * Die Rollenpruefung passiert doppelt: serverseitig (rollenbezogene Zustellung
 * auf /ws) UND hier clientseitig. Kommt trotzdem ein Event an, das fuer die
 * eigene Rolle nicht vorgesehen ist, wird es still verworfen.
 *
 * Es gibt bewusst KEINEN Cloud-Push (FCM/APNs): kein Apple-Developer-Account,
 * Sideload-IPA und der Server ist nur ueber Tailscale erreichbar. Die
 * Benachrichtigungen werden daher LOKAL auf dem Geraet erzeugt, ausgeloest vom
 * bestehenden WebSocket-Event (live.js).
 */
import notifee, { AndroidImportance, AndroidVisibility, AuthorizationStatus } from "@notifee/react-native";
import * as api from "./api";

export const CH_STATUS = "safezone-status";   // laufender Betrieb (leise)
export const CH_ALERT = "safezone-alert";     // Gefahrenwarnungen (laut, Heads-up)
export const CH_INFO = "safezone-info";       // Entwarnung / Info (hoerbar, ruhiger)

let _channelsReady = false;

// Benachrichtigungs-Kanaele anlegen (idempotent)
export async function ensureChannels() {
  if (_channelsReady) return;
  await notifee.createChannel({
    id: CH_STATUS, name: "SafeZone Betrieb",
    importance: AndroidImportance.LOW, visibility: AndroidVisibility.PUBLIC,
  });
  await notifee.createChannel({
    id: CH_ALERT, name: "Gefahrenwarnungen",
    importance: AndroidImportance.HIGH, visibility: AndroidVisibility.PUBLIC,
    sound: "default", vibration: true, vibrationPattern: [300, 500],
  });
  await notifee.createChannel({
    id: CH_INFO, name: "Entwarnung / Hinweise",
    importance: AndroidImportance.DEFAULT, visibility: AndroidVisibility.PUBLIC,
    sound: "default", vibration: true,
  });
  _channelsReady = true;
}

// Benachrichtigungs-Berechtigung anfragen (Android 13+ / iOS)
export async function requestPermission() {
  const settings = await notifee.requestPermission();
  return settings;
}

// Aktuellen Berechtigungsstatus lesen
export async function getPermission() {
  return notifee.getNotificationSettings();
}

// Vereinfachter Status: sind Benachrichtigungen erlaubt?
export async function hasPermission() {
  try {
    const s = await notifee.getNotificationSettings();
    return s.authorizationStatus === AuthorizationStatus.AUTHORIZED
        || s.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  } catch (_) { return false; }
}

// Akku-Optimierung (verhindert Zustellung im Hintergrund) - Status + Einstellungen
export async function isBatteryOptimized() {
  try { return await notifee.isBatteryOptimizationEnabled(); } catch (_) { return false; }
}
export async function openBatterySettings() {
  try { await notifee.openBatteryOptimizationSettings(); } catch (_) {}
}
export async function openPowerSettings() {
  try { await notifee.openPowerManagerSettings(); } catch (_) {}
}
export async function openNotifSettings() {
  try { await notifee.openNotificationSettings(); } catch (_) {}
}

/**
 * Neue KI-Detektion (NUR cctv). `ev` = {typ:'vorfall.neu', vorfall_id, fall_id}.
 * Details werden best-effort geladen; schlaegt das fehl, bleibt ein generischer
 * Text stehen. Das ist die ungepruefte Rohdetektion -> zu pruefen, kein Einsatz.
 */
export async function showAlert(ev) {
  await ensureChannels();
  let title = "⚠️ Neue KI-Detektion";
  let body = `Fall ${ev.fall_id || ""} - bitte bewerten`.trim();
  try {
    const v = await api.getVorfall(ev.vorfall_id);
    const ort = [v.kamerabereich, v.ort].filter(Boolean).join(" · ");
    title = `⚠️ ${v.gefahrenart || "Gefahr erkannt"} (ungeprueft)`;
    body = `${v.fall_id}${ort ? " · " + ort : ""} - bitte bewerten`;
  } catch (_) { /* generischer Text bleibt */ }

  await notifee.displayNotification({
    title, body,
    data: { vorfall_id: String(ev.vorfall_id || ""), fall_id: String(ev.fall_id || ""), kind: "vorfall" },
    android: {
      channelId: CH_ALERT,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      color: "#f97316",
      pressAction: { id: "default" },
      // auch auf dem Sperrbildschirm sichtbar
      visibility: AndroidVisibility.PUBLIC,
    },
    ios: { sound: "default" },
  });
}

/**
 * Einsatzausloesung (NUR patrol). `ev` = {typ:'vorfall.bewertet', vorfall_id,
 * status:'sicherheitsrelevant', fall_id?}. Erst hier hat ein MENSCH (CCTV) den
 * Fall hochgestuft - das ist der Moment, in dem Patrol raus muss.
 */
export async function showEinsatz(ev) {
  await ensureChannels();
  let title = "🚨 Einsatz - sicherheitsrelevant";
  let body = `Fall ${ev.fall_id || ""} - bitte ausruecken`.trim();
  try {
    const v = await api.getVorfall(ev.vorfall_id);
    const ort = [v.kamerabereich, v.ort].filter(Boolean).join(" · ");
    title = `🚨 Einsatz: ${v.gefahrenart || "sicherheitsrelevant"}`;
    body = `${v.fall_id}${ort ? " · " + ort : ""} - bitte ausruecken`;
  } catch (_) { /* generischer Text bleibt */ }

  await notifee.displayNotification({
    title, body,
    data: { vorfall_id: String(ev.vorfall_id || ""), fall_id: String(ev.fall_id || ""), kind: "einsatz" },
    android: {
      channelId: CH_ALERT,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      color: "#ef4444",
      pressAction: { id: "default" },
      visibility: AndroidVisibility.PUBLIC,
    },
    ios: { sound: "default" },
  });
}

/**
 * Freigabe fuer die Staatsanwaltschaft (NUR prosecutor).
 * `ev` = {typ:'vorfall.freigegeben', vorfall_id, fall_id?}. Nachgelagerte
 * Sachbearbeitung, kein Gefahren-Alarm -> ruhigerer Kanal.
 */
export async function showFreigabe(ev) {
  await ensureChannels();
  let title = "Neuer freigegebener Fall";
  let body = `Fall ${ev.fall_id || ""} wurde zur Einsicht freigegeben`.trim();
  try {
    const v = await api.getVorfall(ev.vorfall_id);   // erlaubt: erst ab Freigabe
    body = `${v.fall_id} - zur Einsicht freigegeben`;
  } catch (_) { /* generischer Text bleibt */ }

  await notifee.displayNotification({
    title, body,
    data: { vorfall_id: String(ev.vorfall_id || ""), fall_id: String(ev.fall_id || ""), kind: "freigabe" },
    android: {
      channelId: CH_INFO,
      importance: AndroidImportance.DEFAULT,
      smallIcon: "ic_launcher",
      color: "#3b82f6",
      pressAction: { id: "default" },
      visibility: AndroidVisibility.PUBLIC,
    },
    ios: { sound: "default" },
  });
}

/**
 * Handlungsempfehlung / Entwarnung (NUR vendor). `ev` ist das WS-Event
 * {typ:'empfehlung', vorfall_id, entwarnung:boolean}.
 *
 * WICHTIG: Es wird ausschliesslich der reduzierte Empfehlungstext des Backends
 * verwendet (/vorfaelle/{id}/empfehlung). Kein Vorfall-Volldetail, keine
 * Gefahrenart, keine Kamera-/KI-Angaben, keine Bilder - der Text darf nichts
 * enthalten, was der Vendor in der App selbst nicht sehen duerfte.
 */
export async function showEmpfehlung(ev) {
  await ensureChannels();
  const entwarnung = !!ev.entwarnung;

  let title = entwarnung ? "Entwarnung" : "Handlungsempfehlung";
  let body = entwarnung
    ? "Die Lage ist entspannt. Der Normalbetrieb kann fortgesetzt werden."
    : "Neue Handlungsempfehlung - bitte in der App oeffnen und bestaetigen.";

  // Reduzierten Text (Bereich + Empfehlung) laden - die einzige Quelle, die ein
  // Vendor sehen darf.
  try {
    const liste = await api.getEmpfehlungen(ev.vorfall_id);
    const arr = Array.isArray(liste) ? liste : [];
    const treffer = arr.filter((e) => !!e.entwarnung === entwarnung);
    const pool = treffer.length ? treffer : arr;
    const e = pool.length ? pool[pool.length - 1] : null;
    if (e && e.empfehlung) {
      if (e.bereich) title = `${title} · ${e.bereich}`;
      body = String(e.empfehlung);
    }
  } catch (_) { /* generischer Text bleibt */ }

  await notifee.displayNotification({
    title, body,
    data: { vorfall_id: String(ev.vorfall_id || ""), kind: entwarnung ? "entwarnung" : "empfehlung" },
    android: {
      channelId: entwarnung ? CH_INFO : CH_ALERT,
      importance: entwarnung ? AndroidImportance.DEFAULT : AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      color: entwarnung ? "#22c55e" : "#f97316",
      pressAction: { id: "default" },
      visibility: AndroidVisibility.PUBLIC,
    },
    ios: { sound: "default" },
  });
}

/**
 * Zentrale, rollengerechte Verteilung eines WebSocket-Events auf
 * Benachrichtigungen. Liefert true, wenn benachrichtigt wurde. Wirft nie.
 *
 * Das ist die zweite Verteidigungslinie: der Server stellt bereits nur die
 * rollen-erlaubten Events zu (authentifiziertes /ws). Wuerde diese Filterung
 * ausfallen (alte Server-Version, Bug), verhindert diese Whitelist trotzdem,
 * dass z.B. ein Vendor eine KI-Detektion zu Gesicht bekommt.
 *
 * WHITELIST (alles andere -> keine Benachrichtigung):
 *   cctv       : vorfall.neu
 *   patrol     : vorfall.bewertet + status === 'sicherheitsrelevant'
 *   vendor     : empfehlung
 *   prosecutor : vorfall.freigegeben
 */
export async function notifyForEvent(ev, role) {
  try {
    if (!ev || !ev.typ || !role) return false;

    if (role === "cctv") {
      if (ev.typ === "vorfall.neu") { await showAlert(ev); return true; }
      return false;
    }

    if (role === "patrol") {
      // NICHT bei 'vorfall.neu' (Rohdetektion) - nur bei menschlicher Hochstufung.
      if (ev.typ === "vorfall.bewertet" && ev.status === "sicherheitsrelevant") {
        await showEinsatz(ev); return true;
      }
      return false;
    }

    if (role === "vendor") {
      // NUR die reduzierte Empfehlung/Entwarnung - niemals eine KI-Detektion.
      if (ev.typ === "empfehlung") { await showEmpfehlung(ev); return true; }
      return false;
    }

    if (role === "prosecutor") {
      // Nur freigegebene Faelle - vorher darf nicht mal die Existenz bekannt sein.
      if (ev.typ === "vorfall.freigegeben") { await showFreigabe(ev); return true; }
      return false;
    }

    return false;   // admin/unbekannt: keine Benachrichtigung
  } catch (_) { return false; }
}
