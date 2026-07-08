/**
 * SafeZone AI – Haupt-App (Root).
 *
 * - Login gegen das Backend; Session (Rolle) wird gemerkt (AsyncStorage).
 * - Nach Login → direkt in die Ansicht der jeweiligen Rolle.
 * - Einfache Screen-Navigation (Stack im State), Logout über das Menü (⋯).
 * Design nach Figma-Prototyp (dunkel, Orange-Akzent).
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal, Platform, Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { C, ROLE_LABEL } from "./src/theme";
import { Button } from "./src/ui";
import * as api from "./src/api";
import { startLive, stopLive } from "./src/live";
import { requestPermission as requestNotifPermission } from "./src/notify";
import { installCrashReporter, rlog } from "./src/crashlog";
import {
  CctvDashboard, PatrolDashboard, VendorScreen, ProsecutorDashboard, VorfallDetail,
} from "./src/screens";

// Absturz-/Fehlerbericht an den Server aktivieren (temporär fürs Debugging)
installCrashReporter();

const IS_IOS = Platform.OS === "ios";

// iOS verlangt pro App die Berechtigung „Lokales Netzwerk", um Tailscale-/lokale
// IPs (100.x / 10.x / 192.168.x) zu erreichen. Ohne sie schlägt jede Verbindung
// still fehl („Netzwerk error"), obwohl Safari (systemeigen) funktioniert.
// Diese Helfer stoßen den iOS-Dialog aktiv an bzw. führen in die Einstellungen.
function openAppSettings() {
  // Öffnet unter iOS die App-eigene Einstellungsseite (dort: „Lokales Netzwerk").
  Linking.openURL("app-settings:").catch(() => {});
}

// iOS 18+: Der „Lokales Netzwerk"-Dialog (und der Schalter in den Einstellungen)
// erscheint NUR, wenn die App aktiv einen echten Bonjour-/mDNS-Service-Browser
// startet (NSNetServiceBrowser). Ein normaler fetch auf die Tailscale-IP (100.x)
// wird sonst still geblockt (Fehler -1009 „Local network prohibited"), ohne
// Dialog/Schalter. Deshalb nutzen wir das dedizierte Modul
// `@generac/react-native-local-network-permission` (requestLocalNetworkAccess);
// der `.local`-Fetch bleibt als harmloser Zusatz-Trigger.
let _requestLNA = null;
try { _requestLNA = require("@generac/react-native-local-network-permission").requestLocalNetworkAccess; } catch (_) {}

async function triggerLocalNetworkPrompt() {
  if (!IS_IOS) return;
  // 1) Zuverlässiger Weg: echter Bonjour-Browser -> iOS zeigt Dialog + legt Schalter an
  if (_requestLNA) {
    try { await _requestLNA(); } catch (e) { try { rlog("LNA-fehler: " + (e?.message || e)); } catch {} }
  }
  // 2) Zusatz-Trigger: mDNS/.local auflösen (schadet nicht)
  for (const url of ["http://safezone-ai.local:8080/health", "http://_http._tcp.local./"]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      await fetch(url, { method: "GET", signal: ctrl.signal }).catch(() => {});
      clearTimeout(t);
    } catch (_) {}
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [nav, setNav] = useState({ screen: "home", params: {} });

  // Beim Start: gespeicherte Session wiederherstellen
  useEffect(() => {
    (async () => {
      await api.initApi();
      const u = await api.restoreUser();
      setUser(u);
      setReady(true);
    })();
  }, []);

  const go = useCallback((screen, params = {}) => setNav({ screen, params }), []);

  // Eingeloggt → Echtzeit-Verbindung + Hintergrund-Benachrichtigungen aktivieren.
  // Beim Logout/Beenden wieder sauber abschalten.
  useEffect(() => {
    if (user) {
      rlog(`login ok als ${user.role} -> startLive`);
      try { startLive(); } catch (e) { rlog("startLive-fehler: " + (e?.message || e)); }
      requestNotifPermission().catch(() => {});   // einmalig Rechte anfragen
    } else {
      stopLive();
    }
  }, [user]);

  async function handleLogout() {
    await stopLive();
    await api.logout();
    setUser(null);
    setNav({ screen: "home", params: {} });
  }

  if (!ready) {
    return <View style={st.boot}><ActivityIndicator color={C.accent} size="large" /></View>;
  }

  // Nicht eingeloggt → Login
  if (!user) {
    return <LoginScreen onLoggedIn={(u) => { setUser(u); setNav({ screen: "home", params: {} }); }} />;
  }

  // Detailansicht (rollenübergreifend, Inhalt/Aktionen richten sich nach Rolle)
  if (nav.screen === "detail") {
    return <VorfallDetail user={user} vid={nav.params.vid} onBack={() => go("home")} />;
  }

  // Rollen-Dashboard
  const dashProps = { user, onOpen: (vid) => go("detail", { vid }), onLogout: handleLogout };
  switch (user.role) {
    case "cctv":       return <CctvDashboard {...dashProps} />;
    case "patrol":     return <PatrolDashboard {...dashProps} />;
    case "vendor":     return <VendorScreen {...dashProps} />;
    case "prosecutor": return <ProsecutorDashboard {...dashProps} />;
    default:           return <UnknownRole user={user} onLogout={handleLogout} />;
  }
}

// ---------------------------------------------------------------------------
//  Login-Screen (Figma-Design)
// ---------------------------------------------------------------------------
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("cctv");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(api.getBaseUrl());
  const [online, setOnline] = useState(null); // null = wird geprüft, true/false
  const [netInfo, setNetInfo] = useState(false);   // iOS-Erstlauf-Hinweis (Lokales Netzwerk)

  // iOS-Erstlauf: einmalig erklären, dass gleich der Dialog „Lokales Netzwerk"
  // kommt und mit „Erlauben" bestätigt werden muss. Danach Flag speichern.
  // Zusätzlich beim Start die Berechtigung aktiv anstoßen (mDNS), damit iOS den
  // Dialog überhaupt zeigt und den Schalter anlegt.
  useEffect(() => {
    if (!IS_IOS) return;
    triggerLocalNetworkPrompt();
    (async () => {
      const seen = await AsyncStorage.getItem("netInfoShown");
      if (!seen) setNetInfo(true);
    })();
  }, []);

  // Server-Erreichbarkeit beim Öffnen prüfen + laufend aktuell halten (Echtzeit).
  // Der erste fetch stößt zugleich den iOS-Dialog „Lokales Netzwerk" an.
  // Nach Schließen der Server-Einstellung (evtl. geänderte URL) sofort neu prüfen.
  useEffect(() => {
    let alive = true;
    const check = async () => { const ok = await api.checkHealth(); if (alive) setOnline(ok); };
    check();
    const id = setInterval(check, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [settingsOpen]);

  const retryNow = useCallback(async () => {
    setOnline(null);
    await triggerLocalNetworkPrompt();   // iOS: Berechtigung ggf. erneut anstoßen
    const ok = await api.checkHealth();
    setOnline(ok);
  }, []);

  async function submit() {
    setLoading(true);
    try {
      const u = await api.login(username.trim(), password);
      onLoggedIn(u);
    } catch (e) {
      const msg = String(e?.message || e);
      // Netzwerkfehler (fetch scheitert) → gezielte, plattformspezifische Hilfe
      const isNet = /Network request failed|Failed to fetch|timeout|abort|Connection|Netzwerk/i.test(msg);
      if (isNet && IS_IOS) {
        Alert.alert(
          "Keine Verbindung zum Server",
          "iOS blockiert vermutlich den Zugriff auf das lokale Netzwerk.\n\n" +
          "1. Einstellungen -> Datenschutz & Sicherheit -> Lokales Netzwerk -> 'SafeZone AI' einschalten\n" +
          "2. Sicherstellen, dass Tailscale (VPN) aktiv ist\n" +
          "3. App komplett schließen und neu öffnen",
          [
            { text: "Einstellungen öffnen", onPress: openAppSettings },
            { text: "Erneut versuchen", onPress: retryNow },
            { text: "OK", style: "cancel" },
          ],
        );
      } else if (isNet) {
        Alert.alert(
          "Keine Verbindung zum Server",
          "Server nicht erreichbar.\n• Ist Tailscale/VPN aktiv?\n• Stimmt die Server-Adresse (⚙︎ ändern)?",
          [{ text: "Erneut versuchen", onPress: retryNow }, { text: "OK", style: "cancel" }],
        );
      } else {
        Alert.alert("Anmeldung fehlgeschlagen", msg);
      }
    } finally { setLoading(false); }
  }

  return (
    <View style={st.login}>
      <StatusBar style="light" />
      {/* Logo / Brand */}
      <View style={{ alignItems: "center", marginTop: 90 }}>
        <View style={st.logo}><Text style={{ fontSize: 34 }}>🛡️</Text></View>
        <Text style={st.brand}>SafeZone AI</Text>
        <Text style={st.brandSub}>KI-GESTÜTZTE GEFAHRENERKENNUNG</Text>
        <View style={[st.sysPill, online === false && { borderColor: "#5b1f1f" }]}>
          <View style={[st.greenDot, { backgroundColor: online === true ? C.green : online === false ? C.red : C.muted }]} />
          <Text style={[st.sysTxt, { color: online === true ? C.green : online === false ? C.red : C.muted }]}>
            {online === null ? "PRÜFE …" : online ? "SYSTEM AKTIV" : "NICHT ERREICHBAR"} · SafeZone Server
          </Text>
        </View>
      </View>

      {/* Verbindungs-Hilfe, wenn Server nicht erreichbar (iOS: Lokales-Netzwerk-Berechtigung) */}
      {online === false && (
        <View style={st.helpCard}>
          <Text style={st.helpTitle}>⚠︎ Server nicht erreichbar</Text>
          {IS_IOS ? (
            <Text style={st.helpTxt}>
              iOS erlaubt der App evtl. keinen Zugriff auf das lokale Netzwerk (Tailscale).
              Aktiviere: Einstellungen → Datenschutz & Sicherheit → Lokales Netzwerk → „SafeZone AI".
              Danach App komplett schließen und neu öffnen.
            </Text>
          ) : (
            <Text style={st.helpTxt}>
              Prüfe, ob Tailscale/VPN aktiv ist und die Server-Adresse stimmt.
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            {IS_IOS && (
              <View style={{ flex: 1 }}><Button label="Einstellungen" color="#374151" onPress={openAppSettings} /></View>
            )}
            <View style={{ flex: 1 }}><Button label="Erneut verbinden" onPress={retryNow} /></View>
          </View>
        </View>
      )}

      {/* Formular */}
      <View style={{ paddingHorizontal: 24, marginTop: online === false ? 16 : 40 }}>
        <Text style={st.label}>BENUTZERNAME</Text>
        <TextInput style={st.input} value={username} onChangeText={setUsername}
          autoCapitalize="none" placeholder="cctv / patrol / vendor / prosecutor" placeholderTextColor={C.muted} />
        <Text style={[st.label, { marginTop: 14 }]}>PASSWORT</Text>
        <TextInput style={st.input} value={password} onChangeText={setPassword}
          secureTextEntry autoCapitalize="none" placeholder="••••••••" placeholderTextColor={C.muted} />
        <Button label={loading ? "" : "ANMELDEN"} onPress={submit} loading={loading} />
        <TouchableOpacity onPress={() => { setBaseUrl(api.getBaseUrl()); setSettingsOpen(true); }}>
          <Text style={st.serverHint}>Server: {api.getBaseUrl()}  ·  ⚙︎ ändern</Text>
        </TouchableOpacity>
        <Text style={st.notice}>🔒 Zugriff nur für berechtigte Nutzer (über VPN)</Text>
      </View>

      {/* iOS-Erstlauf-Hinweis: Lokales-Netzwerk-Dialog kommt gleich */}
      <Modal visible={netInfo} transparent animationType="fade">
        <View style={st.modalBg}><View style={st.modalCard}>
          <Text style={st.mTitle}>🔐 Lokales Netzwerk erlauben</Text>
          <Text style={st.helpTxt}>
            SafeZone verbindet sich mit dem Server im Tailscale-/lokalen Netzwerk.
            Gleich fragt iOS „Möchte im lokalen Netzwerk suchen" – bitte auf
            <Text style={{ color: C.text, fontWeight: "700" }}> „Erlauben"</Text> tippen,
            sonst kann die App den Server nicht erreichen.
          </Text>
          <Text style={[st.helpTxt, { marginTop: 8 }]}>
            Falls versehentlich abgelehnt: Einstellungen → Datenschutz & Sicherheit →
            Lokales Netzwerk → „SafeZone AI" aktivieren.
          </Text>
          <View style={{ marginTop: 14 }}>
            <Button label="Verstanden" onPress={async () => {
              await AsyncStorage.setItem("netInfoShown", "1");
              setNetInfo(false);
              await triggerLocalNetworkPrompt();   // löst den iOS-Dialog aktiv aus
              retryNow();
            }} />
          </View>
        </View></View>
      </Modal>

      {/* Server-Einstellung */}
      <Modal visible={settingsOpen} transparent animationType="slide">
        <View style={st.modalBg}><View style={st.modalCard}>
          <Text style={st.mTitle}>Server-Adresse</Text>
          <TextInput style={st.input} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />
          {IS_IOS && (
            <TouchableOpacity onPress={openAppSettings}>
              <Text style={[st.serverHint, { marginTop: 4, marginBottom: 8 }]}>
                iOS „Lokales Netzwerk"-Berechtigung öffnen
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Abbrechen" color="#374151" onPress={() => setSettingsOpen(false)} /></View>
            <View style={{ flex: 1 }}><Button label="Speichern" onPress={async () => { await api.setBaseUrl(baseUrl.trim()); setSettingsOpen(false); }} /></View>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

function UnknownRole({ user, onLogout }) {
  return (
    <View style={st.boot}>
      <Text style={{ color: C.text, marginBottom: 12 }}>Unbekannte Rolle: {user.role}</Text>
      <Button label="Abmelden" onPress={onLogout} />
    </View>
  );
}

const st = StyleSheet.create({
  boot: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  login: { flex: 1, backgroundColor: "#0b0b13" },
  logo: { width: 80, height: 80, borderRadius: 22, backgroundColor: "#13131e", borderWidth: 1.5, borderColor: "#f9731630", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  brand: { color: "#f0f2f8", fontSize: 32, fontWeight: "700", letterSpacing: 1 },
  brandSub: { color: C.muted, fontSize: 12, marginTop: 6, letterSpacing: 1.5 },
  sysPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#1a1a28", borderWidth: 1, borderColor: "#1e1e30" },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  sysTxt: { color: C.green, fontSize: 10, letterSpacing: 0.5 },
  helpCard: { marginHorizontal: 24, marginTop: 20, backgroundColor: "#1a1420", borderWidth: 1, borderColor: "#5b1f1f", borderRadius: 14, padding: 16 },
  helpTitle: { color: "#f0a6a6", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  helpTxt: { color: "#c9cede", fontSize: 12.5, lineHeight: 18 },
  label: { color: C.muted, fontSize: 11, letterSpacing: 1, marginBottom: 6 },
  input: { backgroundColor: "#1a1a28", borderColor: "#1e1e30", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 14, marginBottom: 4 },
  serverHint: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
  notice: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 18 },
  modalBg: { flex: 1, backgroundColor: "#000000aa", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#0b0b13", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#26263a" },
  mTitle: { color: C.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
});
