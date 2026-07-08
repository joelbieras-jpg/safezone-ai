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
  ActivityIndicator, Alert, Modal,
} from "react-native";
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

  // Server-Erreichbarkeit beim Öffnen prüfen + laufend aktuell halten (Echtzeit).
  // Nach Schließen der Server-Einstellung (evtl. geänderte URL) sofort neu prüfen.
  useEffect(() => {
    let alive = true;
    const check = async () => { const ok = await api.checkHealth(); if (alive) setOnline(ok); };
    check();
    const id = setInterval(check, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [settingsOpen]);

  async function submit() {
    setLoading(true);
    try {
      const u = await api.login(username.trim(), password);
      onLoggedIn(u);
    } catch (e) {
      Alert.alert("Anmeldung fehlgeschlagen", String(e.message || e));
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

      {/* Formular */}
      <View style={{ paddingHorizontal: 24, marginTop: 40 }}>
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

      {/* Server-Einstellung */}
      <Modal visible={settingsOpen} transparent animationType="slide">
        <View style={st.modalBg}><View style={st.modalCard}>
          <Text style={st.mTitle}>Server-Adresse</Text>
          <TextInput style={st.input} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />
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
  label: { color: C.muted, fontSize: 11, letterSpacing: 1, marginBottom: 6 },
  input: { backgroundColor: "#1a1a28", borderColor: "#1e1e30", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 14, marginBottom: 4 },
  serverHint: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
  notice: { color: C.muted, fontSize: 11, textAlign: "center", marginTop: 18 },
  modalBg: { flex: 1, backgroundColor: "#000000aa", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#0b0b13", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#26263a" },
  mTitle: { color: C.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
});
