/**
 * SafeZone AI – Rollen-Screens (Dashboards + Detailansicht).
 * Alle Daten kommen vom echten Backend (rollen-gefiltert). Aktionen je Rolle.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Alert, Modal, TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { C, ROLE_LABEL } from "./theme";
import { Header, Card, StufeBadge, StatusBadge, Button, Row, Center } from "./ui";
import { CctvFeed, SequenzGalerie, PatrolMedia, KameraKachel, KameraVollbild } from "./media";
import { subscribe } from "./live";
import * as notify from "./notify";
import * as api from "./api";

// Menü-Button rechts in der Kopfzeile (Berechtigungen + Logout)
function Menu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={{ width: 34, alignItems: "center" }}>
        <Text style={{ color: C.text, fontSize: 22 }}>⋯</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={mst.bg} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={mst.card}>
            <Text style={mst.name}>{user.display_name}</Text>
            <Text style={mst.role}>{ROLE_LABEL[user.role] || user.role}</Text>
            <View style={{ height: 12 }} />
            <Button label="BENACHRICHTIGUNGEN" color={C.blue} onPress={() => { setOpen(false); setPermOpen(true); }} />
            <View style={{ height: 8 }} />
            <Button label="ABMELDEN" color={C.red} onPress={() => { setOpen(false); onLogout(); }} />
          </View>
        </TouchableOpacity>
      </Modal>
      <PermissionsModal open={permOpen} onClose={() => setPermOpen(false)} />
    </>
  );
}

// Berechtigungs-Einstellungen: Benachrichtigungsrecht + Akku-Optimierung
function PermissionsModal({ open, onClose }) {
  const [notifOk, setNotifOk] = useState(null);
  const [battOpt, setBattOpt] = useState(null);

  const refresh = useCallback(async () => {
    setNotifOk(await notify.hasPermission());
    setBattOpt(await notify.isBatteryOptimized());
  }, []);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const dot = (ok) => (ok ? "🟢" : "🔴");

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mst.bg2}><View style={mst.card2}>
        <Text style={mst.name}>Benachrichtigungen</Text>
        <Text style={[cst.meta, { marginTop: 6, marginBottom: 12 }]}>
          Damit du bei Gefahren auch benachrichtigt wirst, wenn die App minimiert ist,
          im Standby läuft oder der Bildschirm aus ist.
        </Text>

        <View style={cst.permRow}>
          <Text style={cst.permTxt}>{dot(notifOk)}  Benachrichtigungen {notifOk == null ? "…" : notifOk ? "erlaubt" : "blockiert"}</Text>
        </View>
        <View style={cst.permRow}>
          <Text style={cst.permTxt}>{dot(!battOpt)}  Akku-Optimierung {battOpt == null ? "…" : battOpt ? "aktiv (kann Zustellung verhindern)" : "aus"}</Text>
        </View>

        <View style={{ height: 12 }} />
        {!notifOk && (
          <Button label="BENACHRICHTIGUNGEN ERLAUBEN" onPress={async () => { await notify.requestPermission(); refresh(); }} />
        )}
        {battOpt && (
          <>
            <View style={{ height: 8 }} />
            <Button label="AKKU-OPTIMIERUNG DEAKTIVIEREN" color={C.accent} onPress={async () => { await notify.openBatterySettings(); }} />
          </>
        )}
        <View style={{ height: 8 }} />
        <Button label="HERSTELLER-ENERGIEEINSTELLUNGEN" color="#374151" onPress={() => notify.openPowerSettings()} />
        <View style={{ height: 8 }} />
        <Button label="SYSTEM-EINSTELLUNGEN ÖFFNEN" color="#374151" onPress={() => notify.openNotifSettings()} />
        <View style={{ height: 12 }} />
        <Button label="Schließen" color="#374151" onPress={onClose} />
      </View></View>
    </Modal>
  );
}

// Datum hübsch
const fmt = (s) => { try { return new Date(s).toLocaleString("de-DE"); } catch { return s; } };
// Ort/Bereich hübsch zusammenfassen (kein nackter „·" wenn Felder leer sind)
const ortText = (v) => [v.kamerabereich, v.ort].filter(Boolean).join(" · ") || "Ort unbekannt";

// Wiederverwendbare Vorfall-Karte
function VorfallCard({ v, onPress }) {
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={cst.fallId}>{v.fall_id}</Text>
        <StufeBadge stufe={v.gefahrenstufe} />
      </View>
      <Text style={cst.art}>{v.gefahrenart || "—"}</Text>
      <Text style={cst.meta}>{ortText(v)}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <StatusBadge status={v.status} />
        <Text style={cst.time}>{fmt(v.erkannt_am)}</Text>
      </View>
    </Card>
  );
}

// Generisches Dashboard mit Liste (für cctv/patrol/prosecutor)
function ListDashboard({ user, onOpen, onLogout, title, subtitle, emptyText }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setItems(await api.listVorfaelle()); }
    catch (e) { Alert.alert("Fehler", String(e.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Echtzeit: bei jedem Live-Event (neue/aktualisierte Vorfälle) neu laden
  useEffect(() => subscribe(() => load()), [load]);

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title={title} subtitle={subtitle} right={<Menu user={user} onLogout={onLogout} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>
        {loading && items.length === 0 ? <Center><ActivityIndicator color={C.accent} /></Center> : null}
        {!loading && items.length === 0 ? <Text style={cst.empty}>{emptyText}</Text> : null}
        {items.map((v) => <VorfallCard key={v.id} v={v} onPress={() => onOpen(v.id)} />)}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
//  Leitstelle (CCTV) – zwei Ansichten:
//    "Vorfälle" = alle KI-Vorfälle (ungefiltert, RBAC im Backend)
//    "Kameras"  = ALLE registrierten Kameras mit Live-Feed, auch ohne Vorfall
// ---------------------------------------------------------------------------
export function CctvDashboard({ user, onOpen, onLogout }) {
  const [tab, setTab] = useState("vorfaelle");
  const [items, setItems] = useState([]);
  const [kameras, setKameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voll, setVoll] = useState(null);   // Kamera im Vollbild-Live

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "vorfaelle") setItems(await api.listVorfaelle());
      else setKameras(await api.getKameras());
    } catch (e) {
      Alert.alert("Fehler", String(e.message || e));
    } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  // Echtzeit: bei Live-Events die Vorfallsliste neu laden
  useEffect(() => subscribe(() => { if (tab === "vorfaelle") load(); }), [load, tab]);
  // Kameraliste regelmäßig auffrischen (Live-Status ändert sich)
  useEffect(() => {
    if (tab !== "kameras") return;
    const id = setInterval(() => api.getKameras().then(setKameras).catch(() => {}), 8000);
    return () => clearInterval(id);
  }, [tab]);

  const leer = tab === "vorfaelle" ? "Keine Vorfälle." : "Keine Kameras registriert.";
  const liste = tab === "vorfaelle" ? items : kameras;

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title="Leitstelle · CCTV"
        subtitle={tab === "vorfaelle" ? "Alle Vorfälle" : "Alle Kameras"}
        right={<Menu user={user} onLogout={onLogout} />} />

      {/* Umschalter */}
      <View style={cst.tabRow}>
        <TouchableOpacity style={[cst.tab, tab === "vorfaelle" && cst.tabAktiv]}
          onPress={() => setTab("vorfaelle")}>
          <Text style={[cst.tabTxt, tab === "vorfaelle" && cst.tabTxtAktiv]}>VORFÄLLE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cst.tab, tab === "kameras" && cst.tabAktiv]}
          onPress={() => setTab("kameras")}>
          <Text style={[cst.tabTxt, tab === "kameras" && cst.tabTxtAktiv]}>KAMERAS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>
        {loading && liste.length === 0 ? <Center><ActivityIndicator color={C.accent} /></Center> : null}
        {!loading && liste.length === 0 ? <Text style={cst.empty}>{leer}</Text> : null}

        {tab === "vorfaelle"
          ? items.map((v) => <VorfallCard key={v.id} v={v} onPress={() => onOpen(v.id)} />)
          : kameras.map((k) => <KameraKachel key={k.id} k={k} onOpen={setVoll} />)}
      </ScrollView>

      <KameraVollbild kamera={voll} onClose={() => setVoll(null)} />
    </View>
  );
}

export const PatrolDashboard = (p) =>
  <ListDashboard {...p} title="Einsatz · Patrol" subtitle="Sicherheitsrelevante Vorfälle" emptyText="Keine aktiven Einsätze." />;

export const ProsecutorDashboard = (p) =>
  <ListDashboard {...p} title="Staatsanwaltschaft" subtitle="Freigegebene Fälle" emptyText="Keine freigegebenen Fälle." />;

// ---------------------------------------------------------------------------
//  Station Vendor – nur reduzierte Handlungsempfehlungen (keine Kamerabilder)
// ---------------------------------------------------------------------------
export function VendorScreen({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const vs = await api.listVorfaelle();
      // pro Vorfall die Empfehlung(en) laden
      const withRec = await Promise.all(vs.map(async (v) => {
        try { return { ...v, empfehlungen: await api.getEmpfehlungen(v.id) }; }
        catch { return { ...v, empfehlungen: [] }; }
      }));
      setItems(withRec);
    } catch (e) { Alert.alert("Fehler", String(e.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Echtzeit: bei Live-Events (z.B. neue Handlungsempfehlung) neu laden
  useEffect(() => subscribe(() => load()), [load]);

  async function bestaetigen(eid) {
    try { await api.bestaetigen(eid); Alert.alert("Bestätigt", "Gelesen markiert."); load(); }
    catch (e) { Alert.alert("Fehler", String(e.message || e)); }
  }

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title="Bahnhofspersonal" subtitle="Handlungsempfehlungen" right={<Menu user={user} onLogout={onLogout} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>
        {!loading && items.length === 0 ? <Text style={cst.empty}>Aktuell keine Meldungen.</Text> : null}
        {items.map((v) => (
          <Card key={v.id}>
            <Text style={cst.fallId}>{ortText(v)}</Text>
            {(v.empfehlungen || []).map((e) => (
              <View key={e.id} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <StatusBadge status={e.entwarnung ? "abgeschlossen" : "sicherheitsrelevant"} />
                  <Text style={cst.time}>{e.entwarnung ? "ENTWARNUNG" : "AKTIV"}</Text>
                </View>
                <Text style={cst.recText}>{e.empfehlung}</Text>
                <Text style={cst.meta}>Bereich: {e.bereich}</Text>
                {!e.entwarnung && <Button label="GELESEN BESTÄTIGEN" onPress={() => bestaetigen(e.id)} />}
              </View>
            ))}
            {(!v.empfehlungen || v.empfehlungen.length === 0) &&
              <Text style={cst.meta}>Noch keine Handlungsempfehlung.</Text>}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
//  Detailansicht – Inhalt & Aktionen je nach Rolle
// ---------------------------------------------------------------------------
export function VorfallDetail({ user, vid, onBack }) {
  const [v, setV] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqText, setReqText] = useState("");

  const load = useCallback(async () => {
    try { setV(await api.getVorfall(vid)); }
    catch (e) { Alert.alert("Fehler", String(e.message || e)); onBack(); }
    finally { setLoading(false); }
  }, [vid]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okMsg) {
    setBusy(true);
    try { await fn(); if (okMsg) Alert.alert("OK", okMsg); await load(); }
    catch (e) { Alert.alert("Fehler", String(e.message || e)); }
    finally { setBusy(false); }
  }

  if (loading || !v) return <View style={cst.screen}><Header title="Vorfall" onBack={onBack} /><Center><ActivityIndicator color={C.accent} /></Center></View>;

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title={v.fall_id} subtitle={ROLE_LABEL[user.role]} onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
        {/* Medienbereich je Rolle (Figma-Kamerafläche) – Vendor sieht bewusst nichts */}
        {user.role === "cctv" && <View style={{ marginBottom: 10 }}><CctvFeed v={v} /></View>}
        {user.role === "prosecutor" && <View style={{ marginBottom: 10 }}>
          <Text style={cst.section}>GESICHERTE KAMERASEQUENZ</Text>
          <SequenzGalerie v={v} />
        </View>}
        {user.role === "patrol" && <View style={{ marginBottom: 10 }}>
          <Text style={cst.section}>LAGEBILD & EINSATZBILDER</Text>
          <PatrolMedia v={v} onChanged={load} />
        </View>}

        {/* Kopf */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <StufeBadge stufe={v.gefahrenstufe} />
            <StatusBadge status={v.status} />
          </View>
          <Text style={cst.art}>{v.gefahrenart}</Text>
          <Row label="Ort" value={v.ort || "unbekannt"} />
          <Row label="Kamerabereich" value={v.kamerabereich || "—"} />
          <Row label="Erkannt am" value={fmt(v.erkannt_am)} />
        </Card>

        {/* KI-Einschätzung (getrennt von menschlicher Bewertung) */}
        <Text style={cst.section}>KI-EINSCHÄTZUNG</Text>
        <Card>
          <Row label="Konfidenz" value={v.ki?.konfidenz != null ? `${(v.ki.konfidenz * 100).toFixed(1)} %` : "–"} />
          <Text style={[cst.meta, { marginTop: 6 }]}>{v.ki?.einschaetzung || "—"}</Text>
        </Card>

        {/* Verlauf: menschliche Bewertungen */}
        {v.bewertungen?.length > 0 && <>
          <Text style={cst.section}>BEWERTUNGEN (MENSCH)</Text>
          {v.bewertungen.map((b, i) => (
            <Card key={i}><Text style={cst.recText}>{b.typ?.toUpperCase()}</Text>
              <Text style={cst.meta}>{b.von} · {fmt(b.erstellt_am)}</Text>
              {b.kommentar ? <Text style={cst.meta}>„{b.kommentar}"</Text> : null}</Card>
          ))}
        </>}

        {/* Verlauf: Koordination */}
        {v.koordination?.length > 0 && <>
          <Text style={cst.section}>EINSATZVERLAUF</Text>
          {v.koordination.map((k, i) => (
            <Card key={i}><Text style={cst.recText}>{k.status?.replace("_", " ").toUpperCase()}</Text>
              <Text style={cst.meta}>{k.von} · {fmt(k.erstellt_am)}</Text></Card>
          ))}
        </>}

        {/* Beweise (Prosecutor) */}
        {user.role === "prosecutor" && <>
          <Text style={cst.section}>GESICHERTE BEWEISE</Text>
          {v.beweise?.length ? v.beweise.map((b) => (
            <Card key={b.id}><Text style={cst.recText}>{b.dateipfad}</Text>
              <Text style={cst.meta}>Gesichert: {fmt(b.gesichert_am)} · SHA256: {b.sha256 ? b.sha256.slice(0, 12) + "…" : "–"}</Text></Card>
          )) : <Card><Text style={cst.meta}>Keine Sequenzen gesichert.</Text></Card>}
        </>}

        {/* --- Rollen-Aktionen --- */}
        {user.role === "cctv" && <>
          <Text style={cst.section}>BEWERTEN</Text>
          <Button label="SICHERHEITSRELEVANT" color={C.red} disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "sicherheitsrelevant"), "Als sicherheitsrelevant markiert.")} />
          <Button label="UNKLAR" color={C.yellow} disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "unklar"))} />
          <Button label="FEHLALARM" color="#374151" disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "fehlalarm"))} />
          <Text style={cst.section}>FREIGABE</Text>
          <Button label="FÜR STAATSANWALTSCHAFT FREIGEBEN" color={C.blue} disabled={busy}
            onPress={() => act(() => api.freigeben(vid), "Freigegeben.")} />
        </>}

        {user.role === "patrol" && <>
          <Text style={cst.section}>EINSATZSTATUS SETZEN</Text>
          {["uebernommen", "unterwegs", "vor_ort", "abgeschlossen", "fehlalarm"].map((sset) => (
            <Button key={sset} label={sset.replace("_", " ").toUpperCase()} disabled={busy}
              color={sset === "abgeschlossen" ? C.green : sset === "fehlalarm" ? "#374151" : C.accent}
              onPress={() => act(() => api.koordinieren(vid, sset), "Status aktualisiert.")} />
          ))}
        </>}

        {user.role === "prosecutor" && <>
          <Text style={cst.section}>BEWEISSICHERUNG</Text>
          <Button label="ZUSÄTZLICHE BEWEISE ANFORDERN" color={C.blue} disabled={busy}
            onPress={() => setReqOpen(true)} />
        </>}
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Prosecutor: Beweisanforderung */}
      <Modal visible={reqOpen} transparent animationType="slide">
        <View style={mst.bg2}><View style={mst.card2}>
          <Text style={mst.name}>Beweise anfordern</Text>
          <TextInput style={cst.reqInput} value={reqText} onChangeText={setReqText} multiline
            placeholder="z.B. Kamerasequenz 5 Min vor Vorfall, Perspektive Gleis 3" placeholderTextColor={C.muted} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Abbrechen" color="#374151" onPress={() => setReqOpen(false)} /></View>
            <View style={{ flex: 1 }}><Button label="Senden" color={C.blue}
              onPress={() => { const t = reqText; setReqOpen(false); setReqText(""); act(() => api.beweisAnfordern(vid, t), "Anforderung gesendet."); }} /></View>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const cst = StyleSheet.create({
  // Umschalter Vorfälle | Kameras (nur Leitstelle/CCTV)
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
         backgroundColor: "#1a1a28", borderWidth: 1, borderColor: "#1e1e30" },
  tabAktiv: { backgroundColor: "#f9731622", borderColor: C.accent },
  tabTxt: { color: C.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  tabTxtAktiv: { color: C.accent },
  screen: { flex: 1, backgroundColor: C.bg },
  fallId: { color: C.accent, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  art: { color: C.text, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  meta: { color: C.muted, fontSize: 12, marginTop: 2 },
  time: { color: C.muted, fontSize: 11 },
  empty: { color: C.muted, textAlign: "center", marginTop: 40 },
  section: { color: C.muted, fontSize: 11, letterSpacing: 1.2, marginTop: 14, marginBottom: 8, fontWeight: "700" },
  recText: { color: C.text, fontSize: 14, fontWeight: "600" },
  reqInput: { backgroundColor: "#111118", color: C.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#26263a", minHeight: 80, textAlignVertical: "top", marginBottom: 12 },
  permRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  permTxt: { color: C.text, fontSize: 13 },
});

const mst = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 90, paddingRight: 16 },
  card: { backgroundColor: "#0b0b13", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#26263a", width: 240 },
  bg2: { flex: 1, backgroundColor: "#000000aa", justifyContent: "center", padding: 20 },
  card2: { backgroundColor: "#0b0b13", borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#26263a" },
  name: { color: C.text, fontSize: 16, fontWeight: "700" },
  role: { color: C.muted, fontSize: 12, marginTop: 2 },
});
