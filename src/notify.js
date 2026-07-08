/**
 * SafeZone AI – Benachrichtigungen (notifee).
 *
 * Zeigt Heads-up-Benachrichtigungen aufs Gerät, wenn die KI eine Gefahr meldet
 * und die App NICHT im Vordergrund ist (minimiert / Standby / Bildschirm aus).
 * Ist die App offen, wird NICHT benachrichtigt – dort aktualisiert sich die
 * Liste in Echtzeit (siehe live.js).
 *
 * Voll selbst-gehostet: kein Google-FCM/Cloud. Damit die Zustellung auch bei
 * gesperrtem Bildschirm klappt, hält live.js über einen Foreground-Service die
 * WebSocket-Verbindung am Leben (Akku-Optimierung für die App bitte deaktivieren).
 */
import notifee, { AndroidImportance, AndroidVisibility, AuthorizationStatus } from "@notifee/react-native";
import * as api from "./api";

export const CH_STATUS = "safezone-status";   // laufender Betrieb (leise)
export const CH_ALERT = "safezone-alert";     // Gefahrenwarnungen (laut, Heads-up)

let _channelsReady = false;

// Benachrichtigungs-Kanäle anlegen (idempotent)
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

// Akku-Optimierung (verhindert Zustellung im Hintergrund) – Status + Einstellungen
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
 * Gefahren-Benachrichtigung anzeigen. `ev` ist das WS-Event
 * {typ:'vorfall.neu', vorfall_id, fall_id}. Details werden best-effort geladen
 * (schlägt für Rollen ohne Detailrecht fehl -> generischer Text).
 */
export async function showAlert(ev) {
  await ensureChannels();
  let title = "⚠️ Neue Gefahrenwarnung";
  let body = `Fall ${ev.fall_id || ""} – bitte prüfen`.trim();
  try {
    const v = await api.getVorfall(ev.vorfall_id);
    const ort = [v.kamerabereich, v.ort].filter(Boolean).join(" · ");
    title = `⚠️ ${v.gefahrenart || "Gefahr erkannt"}`;
    body = `${v.fall_id}${ort ? " · " + ort : ""} – bitte prüfen`;
  } catch (_) { /* generischer Text bleibt */ }

  await notifee.displayNotification({
    title, body,
    data: { vorfall_id: String(ev.vorfall_id || ""), fall_id: String(ev.fall_id || "") },
    android: {
      channelId: CH_ALERT,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      color: "#f97316",
      pressAction: { id: "default" },
      // auch auf dem Sperrbildschirm sichtbar
      visibility: AndroidVisibility.PUBLIC,
    },
  });
}
