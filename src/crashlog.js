/**
 * SafeZone AI – Remote-Diagnose & Absturzbericht (TEMPORÄR fürs Debugging).
 *
 * Schickt Diagnosezeilen + abgefangene JS-Fehler an den KI-Dienst (POST
 * /clientlog auf Port 8090), lesbar per SSH unter /opt/safezone/logs/camera-client.log.
 * So sehen wir Abstürze/Fehler der Haupt-App, ohne am Gerät logcat zu ziehen.
 * Kann später wieder entfernt werden.
 */
import { Platform } from "react-native";
import { getBaseUrl } from "./api";

const device = `${Platform.OS}-main-${Math.random().toString(36).slice(2, 7)}`;

// Log-Endpunkt = KI-Dienst auf Port 8090 (Basis-URL zeigt auf Backend :8080)
function logUrl() {
  return getBaseUrl().replace(/:\d+\/?$/, ":8090").replace(/\/$/, "") + "/clientlog";
}

export function rlog(msg) {
  try {
    fetch(logUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: `${device}/app`, msg: String(msg) }),
    }).catch(() => {});
  } catch (_) {}
}

let installed = false;

// Globalen Fehler-Handler + unbehandelte Promise-Rejections abgreifen -> rlog
export function installCrashReporter() {
  if (installed) return;
  installed = true;
  try {
    if (global.ErrorUtils && global.ErrorUtils.setGlobalHandler) {
      const prev = global.ErrorUtils.getGlobalHandler && global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler((err, isFatal) => {
        rlog(`JS-CRASH fatal=${isFatal}: ${err && err.message ? err.message : err} | STACK ${String(err && err.stack ? err.stack : "").slice(0, 700)}`);
        if (prev) { try { prev(err, isFatal); } catch (_) {} }
      });
    }
  } catch (_) {}
  try {
    // Unbehandelte Promise-Rejections (RN-internes rejection-tracking)
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (id, err) => rlog(`UNHANDLED-REJECTION: ${err && err.message ? err.message : err} | ${String(err && err.stack ? err.stack : "").slice(0, 400)}`),
      onHandled: () => {},
    });
  } catch (_) {}
}
