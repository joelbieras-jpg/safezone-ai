/**
 * SafeZone AI – In-App-Update ohne Play Store (Android/APK-Sideload).
 *
 * Ablauf:
 *   1) pruefeUpdate()        -> fragt GET <server>/app/version, vergleicht den
 *                               versionCode des Servers mit dem der installierten
 *                               App (expo-application: nativeBuildVersion).
 *   2) ladeUndInstalliere()  -> laedt die APK vom eigenen Backend in den Cache,
 *                               wandelt den file://-Pfad in eine content://-URI
 *                               (FileProvider von expo-file-system) und startet
 *                               den System-Installer per Intent.
 *
 * Warum kein expo-updates/EAS: das liefert nur ein neues JS-Bundle aus und kann
 * KEINE nativen Aenderungen (neue Module, Berechtigungen, SDK-Upgrades) aus-
 * rollen. Wir sideloaden ohnehin APKs -> wir tauschen gleich die ganze APK.
 *
 * Nur Android. Unter iOS ist das Nachladen/Installieren von IPAs aus der App
 * heraus nicht moeglich (kein Installer-Intent, keine unbekannten Quellen).
 */
import { Platform, Linking } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import * as api from "./api";
import { rlog } from "./crashlog";

// Android-Intent-Konstanten (Werte aus dem Android-SDK)
const ACTION_INSTALL_PACKAGE = "android.intent.action.INSTALL_PACKAGE";
const ACTION_VIEW = "android.intent.action.VIEW";
const ACTION_MANAGE_UNKNOWN_APP_SOURCES = "android.settings.MANAGE_UNKNOWN_APP_SOURCES";
const FLAG_GRANT_READ_URI_PERMISSION = 1;      // Intent.FLAG_GRANT_READ_URI_PERMISSION
const APK_MIME = "application/vnd.android.package-archive";

export const IST_ANDROID = Platform.OS === "android";

/** Installierte Version: { code, name } – code = Android versionCode. */
export function lokaleVersion() {
  const code = parseInt(Application.nativeBuildVersion || "0", 10) || 0;
  const name = Application.nativeApplicationVersion || "0.0.0";
  return { code, name };
}

/**
 * Prueft, ob auf dem Server eine neuere APK liegt.
 * Liefert null, wenn kein Update vorliegt (oder der Server nicht antwortet).
 * Sonst: { versionCode, versionName, notizen, groesse, url, lokal }
 * Wirft nie – Update-Pruefung darf den App-Start niemals blockieren.
 */
export async function pruefeUpdate() {
  if (!IST_ANDROID) return null;               // iOS: bewusst nicht unterstuetzt
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${api.getBaseUrl()}/app/version`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json();

    const lokal = lokaleVersion();
    const serverCode = parseInt(d.versionCode, 10) || 0;
    if (serverCode <= lokal.code) return null; // aktuell (oder Server aelter)

    return {
      versionCode: serverCode,
      versionName: String(d.versionName || serverCode),
      notizen: d.notizen || d.notes || "",
      groesse: parseInt(d.groesse || d.size, 10) || 0,
      url: `${api.getBaseUrl()}${d.url || "/app/download"}`,
      lokal,
    };
  } catch (e) {
    rlog("update-pruefung fehlgeschlagen: " + (e?.message || e));
    return null;
  }
}

/** Menschenlesbare Groesse (z.B. "78,4 MB"). */
export function formatGroesse(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * Laedt die neue APK herunter und startet die Installation.
 * onFortschritt(0..1) wird waehrend des Downloads aufgerufen.
 * Wirft bei Fehlern (Aufrufer zeigt die Meldung an).
 */
export async function ladeUndInstalliere(info, onFortschritt) {
  if (!IST_ANDROID) throw new Error("Update nur unter Android moeglich");

  const ziel = `${FileSystem.cacheDirectory}safezone-${info.versionCode}.apk`;

  // Alte Teildatei/Vorgaenger entfernen, damit kein halber Download installiert wird
  try { await FileSystem.deleteAsync(ziel, { idempotent: true }); } catch (_) {}

  const dl = FileSystem.createDownloadResumable(
    info.url,
    ziel,
    {},
    (p) => {
      if (!onFortschritt || !p.totalBytesExpectedToWrite) return;
      onFortschritt(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    },
  );

  const erg = await dl.downloadAsync();
  if (!erg || !erg.uri) throw new Error("Download abgebrochen");

  const stat = await FileSystem.getInfoAsync(erg.uri, { size: true });
  if (!stat.exists || !stat.size) throw new Error("Heruntergeladene Datei ist leer");
  if (info.groesse && Math.abs(stat.size - info.groesse) > 1024) {
    throw new Error("Download unvollstaendig – bitte erneut versuchen");
  }

  // file:// -> content:// (FileProvider von expo-file-system). Ohne content-URI
  // lehnt Android 7+ die Installation mit einer FileUriExposedException ab.
  const contentUri = await FileSystem.getContentUriAsync(erg.uri);

  try {
    await IntentLauncher.startActivityAsync(ACTION_INSTALL_PACKAGE, {
      data: contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch (e) {
    rlog("INSTALL_PACKAGE fehlgeschlagen: " + (e?.message || e));
    // Fallback 1: ACTION_VIEW auf die content-URI (aelteres, aber breit unterstuetztes Muster)
    try {
      await IntentLauncher.startActivityAsync(ACTION_VIEW, {
        data: contentUri,
        type: APK_MIME,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
    } catch (e2) {
      rlog("ACTION_VIEW fehlgeschlagen: " + (e2?.message || e2));
      // Fallback 2: APK im Browser oeffnen -> Nutzer installiert aus dem Download-Ordner
      await Linking.openURL(info.url);
    }
  }
}

/**
 * Oeffnet die Systemeinstellung "Unbekannte Apps installieren" fuer SafeZone.
 * Ohne diese Freigabe blockt Android die Installation (einmalig pro App).
 */
export async function oeffneInstallEinstellungen() {
  if (!IST_ANDROID) return;
  const pkg = Application.applicationId || "de.safezone.app";
  try {
    await IntentLauncher.startActivityAsync(ACTION_MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${pkg}`,
    });
  } catch (_) {
    Linking.openSettings().catch(() => {});
  }
}
