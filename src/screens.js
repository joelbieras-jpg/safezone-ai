/**
 * SafeZone AI – Rollen-Screens (Dashboards + Detailansicht).
 * Alle Daten kommen vom echten Backend (rollen-gefiltert). Aktionen je Rolle.
 * Design: Figma-Look (dunkel, Karten/Badges) mit Material-Farbrollen aus theme.js.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Alert, Modal, TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, spacing, radius, type, elevation, STUFE_COLOR, ROLE_LABEL } from "./theme";
import { Header, Card, Section, StufeBadge, StatusBadge, Badge, Button, Row, Center } from "./ui";
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
        <Text style={{ color: colors.onSurface, fontSize: 22 }}>⋯</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={mst.bg} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={mst.card}>
            <View style={mst.userRow}>
              <View style={mst.avatar}>
                <Text style={mst.avatarTxt}>{(user.display_name || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mst.name} numberOfLines={1}>{user.display_name}</Text>
                <Text style={mst.role} numberOfLines={1}>{ROLE_LABEL[user.role] || user.role}</Text>
              </View>
            </View>
            <View style={mst.divider} />
            <Button label="BENACHRICHTIGUNGEN" color={colors.secondary} variant="tonal"
              onPress={() => { setOpen(false); setPermOpen(true); }} />
            <Button label="ABMELDEN" color={colors.error} variant="tonal"
              onPress={() => { setOpen(false); onLogout(); }} />
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

  // Statuspunkt: grün = ok, rot = Problem, grau = wird geprüft
  const dotColor = (ok) => (ok == null ? colors.onSurfaceMedium : ok ? colors.success : colors.error);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mst.bg2}><View style={mst.card2}>
        <Text style={mst.title}>Benachrichtigungen</Text>
        <Text style={cst.helpTxt}>
          Damit du bei Gefahren auch benachrichtigt wirst, wenn die App minimiert ist,
          im Standby läuft oder der Bildschirm aus ist.
        </Text>

        <View style={cst.permRow}>
          <View style={[cst.dot, { backgroundColor: dotColor(notifOk) }]} />
          <Text style={cst.permTxt}>Benachrichtigungen {notifOk == null ? "…" : notifOk ? "erlaubt" : "blockiert"}</Text>
        </View>
        <View style={cst.permRow}>
          <View style={[cst.dot, { backgroundColor: dotColor(battOpt == null ? null : !battOpt) }]} />
          <Text style={cst.permTxt}>Akku-Optimierung {battOpt == null ? "…" : battOpt ? "aktiv (kann Zustellung verhindern)" : "aus"}</Text>
        </View>

        <View style={{ height: spacing.sm }} />
        {!notifOk && (
          <Button label="BENACHRICHTIGUNGEN ERLAUBEN" onPress={async () => { await notify.requestPermission(); refresh(); }} />
        )}
        {battOpt && (
          <Button label="AKKU-OPTIMIERUNG DEAKTIVIEREN" color={colors.primary}
            onPress={async () => { await notify.openBatterySettings(); }} />
        )}
        <Button label="HERSTELLER-ENERGIEEINSTELLUNGEN" color={colors.neutral} onPress={() => notify.openPowerSettings()} />
        <Button label="SYSTEM-EINSTELLUNGEN ÖFFNEN" color={colors.neutral} onPress={() => notify.openNotifSettings()} />
        <Button label="SCHLIESSEN" color={colors.onSurfaceMedium} variant="outlined" onPress={onClose} />
      </View></View>
    </Modal>
  );
}

// Datum hübsch
const fmt = (s) => { try { return new Date(s).toLocaleString("de-DE"); } catch { return s; } };
// Ort/Bereich hübsch zusammenfassen (kein nackter Trenner, wenn Felder leer sind)
const ortText = (v) => [v.kamerabereich, v.ort].filter(Boolean).join(" · ") || "Ort unbekannt";

// Farbe/Beschriftung des Koordinationsstatus (wer hat den Einsatz übernommen?)
const KOORD_COLOR = {
  uebernommen: colors.secondary,
  unterwegs: colors.secondary,
  vor_ort: colors.primary,
  abgeschlossen: colors.success,
  fehlalarm: colors.onSurfaceMedium,
};
const koordLabel = (k) => (k || "").replace("_", " ").toUpperCase();

// Wiederverwendbare Vorfall-Karte
function VorfallCard({ v, onPress, freigabe }) {
  const stufeFarbe = STUFE_COLOR[v.gefahrenstufe] || colors.onSurfaceMedium;
  const koord = v.koordination_status;
  return (
    <Card onPress={onPress} accent={stufeFarbe}>
      <View style={cst.cardTop}>
        <Text style={cst.fallId} numberOfLines={1}>{v.fall_id}</Text>
        <StufeBadge stufe={v.gefahrenstufe} />
      </View>
      <Text style={cst.art} numberOfLines={2}>{v.gefahrenart || "—"}</Text>
      <Text style={cst.meta} numberOfLines={1}>{ortText(v)}</Text>

      {/* Freigabe-Zeitpunkt betonen (Staatsanwaltschaft) */}
      {freigabe && v.freigegeben_am ? (
        <View style={cst.freigabeBox}>
          <Text style={cst.freigabeLabel}>FREIGEGEBEN</Text>
          <Text style={cst.freigabeWert}>{fmt(v.freigegeben_am)}</Text>
        </View>
      ) : null}

      <View style={cst.cardFoot}>
        {/* Vorfall-Status + (falls gesetzt) Einsatz-/Koordinationsstatus */}
        <View style={cst.badgeReihe}>
          <StatusBadge status={v.status} />
          {koord ? <Badge text={koordLabel(koord)} color={KOORD_COLOR[koord] || colors.onSurfaceMedium} /> : null}
        </View>
        <Text style={cst.time}>{fmt(v.erkannt_am)}</Text>
      </View>
    </Card>
  );
}

// Beweisanforderung der Staatsanwaltschaft (Leitstelle/CCTV).
// Backlog 7: der Prosecutor fordert Material an - ohne diese Ansicht landete die
// Anforderung nur in der Datenbank und niemand in der Leitstelle erfuhr davon.
function AnforderungCard({ a, onOpen, onErledigt }) {
  const erledigt = a.status === "erledigt";
  return (
    <Card onPress={onOpen} accent={erledigt ? colors.success : colors.warning}>
      <View style={cst.cardTop}>
        <Text style={cst.fallId} numberOfLines={1}>{a.fall_id}</Text>
        <Badge text={erledigt ? "ERLEDIGT" : "OFFEN"}
          color={erledigt ? colors.success : colors.warning} />
      </View>
      <Text style={cst.art} numberOfLines={4}>{a.beschreibung || "—"}</Text>
      <Text style={cst.meta} numberOfLines={1}>
        Angefordert von {a.von || "Staatsanwaltschaft"}
      </Text>
      <View style={cst.cardFoot}>
        <Text style={cst.time}>{fmt(a.erstellt_am)}</Text>
      </View>
      {!erledigt ? (
        <Button label="ALS ERLEDIGT MARKIEREN" color={colors.primary} onPress={onErledigt} />
      ) : null}
    </Card>
  );
}

// Leerzustand
function Empty({ text }) {
  return (
    <View style={cst.emptyBox}>
      <Text style={cst.emptyIcon}>🛡️</Text>
      <Text style={cst.empty}>{text}</Text>
    </View>
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
      {!loading ? (
        <View style={cst.statusBar}>
          <View style={[cst.dot, { backgroundColor: colors.success }]} />
          <Text style={cst.statusTxt}>LIVE · {items.length} {items.length === 1 ? "EINTRAG" : "EINTRÄGE"}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={cst.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        {loading && items.length === 0 ? <Center><ActivityIndicator color={colors.primary} /></Center> : null}
        {!loading && items.length === 0 ? <Empty text={emptyText} /> : null}
        {items.map((v) => (
          <VorfallCard key={v.id} v={v} freigabe={user.role === "prosecutor"} onPress={() => onOpen(v.id)} />
        ))}
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
  const [anforderungen, setAnforderungen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voll, setVoll] = useState(null);   // Kamera im Vollbild-Live

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "vorfaelle") setItems(await api.listVorfaelle());
      else if (tab === "kameras") setKameras(await api.getKameras());
      else setAnforderungen(await api.getBeweisAnforderungen());
    } catch (e) {
      Alert.alert("Fehler", String(e.message || e));
    } finally { setLoading(false); }
  }, [tab]);

  // Offene Beweisanforderungen immer im Hintergrund zaehlen (fuer das Tab-Badge),
  // damit die Leitstelle eine neue Anforderung auch sieht, wenn sie gerade in
  // einem anderen Tab steht.
  const ladeAnforderungen = useCallback(async () => {
    try { setAnforderungen(await api.getBeweisAnforderungen()); } catch { /* egal */ }
  }, []);
  useEffect(() => { ladeAnforderungen(); }, [ladeAnforderungen]);

  async function erledigt(aid) {
    try { await api.beweisAnforderungErledigt(aid); ladeAnforderungen(); }
    catch (e) { Alert.alert("Fehler", String(e.message || e)); }
  }

  const offen = anforderungen.filter((a) => a.status !== "erledigt").length;

  useEffect(() => { load(); }, [load]);
  // Echtzeit: bei Live-Events die Vorfallsliste neu laden. 'beweis.angefordert'
  // aktualisiert zusaetzlich die Anforderungsliste/das Badge.
  useEffect(() => subscribe((ev) => {
    if (tab === "vorfaelle") load();
    if (!ev || ev.typ === "beweis.angefordert") ladeAnforderungen();
  }), [load, tab, ladeAnforderungen]);
  // Kameraliste regelmäßig auffrischen (Live-Status ändert sich)
  useEffect(() => {
    if (tab !== "kameras") return;
    const id = setInterval(() => api.getKameras().then(setKameras).catch(() => {}), 8000);
    return () => clearInterval(id);
  }, [tab]);

  const leer = tab === "vorfaelle" ? "Keine Vorfälle."
    : tab === "kameras" ? "Keine Kameras registriert."
      : "Keine Beweisanforderungen.";
  const liste = tab === "vorfaelle" ? items : tab === "kameras" ? kameras : anforderungen;
  const liveKameras = kameras.filter((k) => k.live).length;
  const untertitel = tab === "vorfaelle" ? "Alle Vorfälle"
    : tab === "kameras" ? "Alle Kameras" : "Staatsanwaltschaft";

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title="Leitstelle · CCTV" subtitle={untertitel}
        right={<Menu user={user} onLogout={onLogout} />} />

      {/* Umschalter (Material-Tabs mit Indikator) */}
      <View style={cst.tabRow}>
        <TouchableOpacity style={[cst.tab, tab === "vorfaelle" && cst.tabAktiv]} activeOpacity={0.8}
          onPress={() => setTab("vorfaelle")}>
          <Text style={[cst.tabTxt, tab === "vorfaelle" && cst.tabTxtAktiv]}>VORFÄLLE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cst.tab, tab === "kameras" && cst.tabAktiv]} activeOpacity={0.8}
          onPress={() => setTab("kameras")}>
          <Text style={[cst.tabTxt, tab === "kameras" && cst.tabTxtAktiv]}>KAMERAS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cst.tab, tab === "anforderungen" && cst.tabAktiv]} activeOpacity={0.8}
          onPress={() => setTab("anforderungen")}>
          <Text style={[cst.tabTxt, tab === "anforderungen" && cst.tabTxtAktiv]}>
            BEWEISE{offen > 0 ? ` (${offen})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Statuszeile */}
      {!loading ? (
        <View style={cst.statusBar}>
          <View style={[cst.dot, { backgroundColor: colors.success }]} />
          <Text style={cst.statusTxt}>
            {tab === "vorfaelle"
              ? `LIVE · ${items.length} ${items.length === 1 ? "VORFALL" : "VORFÄLLE"}`
              : tab === "kameras"
                ? `${kameras.length} KAMERAS · ${liveKameras} LIVE`
                : `${offen} OFFEN · ${anforderungen.length} GESAMT`}
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={cst.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        {loading && liste.length === 0 ? <Center><ActivityIndicator color={colors.primary} /></Center> : null}
        {!loading && liste.length === 0 ? <Empty text={leer} /> : null}

        {tab === "vorfaelle"
          ? items.map((v) => <VorfallCard key={v.id} v={v} onPress={() => onOpen(v.id)} />)
          : tab === "kameras"
            ? kameras.map((k) => <KameraKachel key={k.id} k={k} onOpen={setVoll} />)
            : anforderungen.map((a) => (
              <AnforderungCard key={a.id} a={a} onOpen={() => onOpen(a.vorfall_id)}
                onErledigt={() => erledigt(a.id)} />
            ))}
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
      <ScrollView contentContainerStyle={cst.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        {!loading && items.length === 0 ? <Empty text="Aktuell keine Meldungen." /> : null}
        {items.map((v) => {
          // Empfehlungen aus dem Detail-Endpunkt; falls (noch) keine da sind, die
          // Kurzfassung aus der Liste anzeigen (empfehlung / empfehlung_bereich / entwarnung).
          const geladen = v.empfehlungen || [];
          const empf = geladen.length > 0
            ? geladen
            : (v.empfehlung
                ? [{ id: `list-${v.id}`, empfehlung: v.empfehlung, bereich: v.empfehlung_bereich || v.kamerabereich, entwarnung: !!v.entwarnung, nurAnzeige: true }]
                : []);
          // Karte grün (Entwarnung), gelb (aktiver Hinweis) bzw. grau (nichts) akzentuieren
          const aktiv = empf.some((e) => !e.entwarnung);
          const akzent = empf.length === 0 ? colors.onSurfaceDisabled : aktiv ? colors.warning : colors.success;
          return (
            <Card key={v.id} accent={akzent}>
              <Text style={cst.bereichTitel}>{ortText(v)}</Text>
              {empf.map((e, i) => (
                <View key={e.id} style={[cst.empfBlock, i > 0 && cst.empfTrenner]}>
                  <View style={cst.empfKopf}>
                    <Badge text={e.entwarnung ? "✓ ENTWARNUNG" : "SICHERHEITSHINWEIS"}
                      color={e.entwarnung ? colors.success : colors.warning} />
                  </View>
                  <Text style={[cst.recText, e.entwarnung && { color: colors.onSurfaceMedium }]}>{e.empfehlung}</Text>
                  {e.bereich ? <Text style={cst.meta}>Bereich: {e.bereich}</Text> : null}
                  {e.entwarnung ? (
                    <View style={cst.entwarnungBox}>
                      <Text style={cst.entwarnungTxt}>Lage geklärt – keine Maßnahmen mehr nötig.</Text>
                    </View>
                  ) : e.nurAnzeige ? null : e.bestaetigt ? (
                    // Backend liefert 'bestaetigt' - vorher blieb der Knopf ewig aktiv und
                    // das Personal sah nie, dass die Quittung schon raus war.
                    <View style={cst.quittungBox}>
                      <Text style={cst.quittungTxt}>✓ Von Ihnen als gelesen bestätigt</Text>
                    </View>
                  ) : (
                    <Button label="GELESEN BESTÄTIGEN" color={colors.primary} onPress={() => bestaetigen(e.id)} />
                  )}
                </View>
              ))}
              {empf.length === 0 &&
                <Text style={cst.meta}>Noch keine Handlungsempfehlung.</Text>}
            </Card>
          );
        })}
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

  if (loading || !v) return <View style={cst.screen}><Header title="Vorfall" onBack={onBack} /><Center><ActivityIndicator color={colors.primary} /></Center></View>;

  const stufeFarbe = STUFE_COLOR[v.gefahrenstufe] || colors.onSurfaceMedium;

  return (
    <View style={cst.screen}>
      <StatusBar style="light" />
      <Header title={v.fall_id} subtitle={ROLE_LABEL[user.role]} onBack={onBack} />
      <ScrollView contentContainerStyle={cst.list}>
        {/* Medienbereich je Rolle (Figma-Kamerafläche) – Vendor sieht bewusst nichts */}
        {user.role === "cctv" && <View style={{ marginBottom: spacing.md }}><CctvFeed v={v} /></View>}
        {user.role === "prosecutor" && <View style={{ marginBottom: spacing.md }}>
          <Section style={{ marginTop: 0 }}>Gesicherte Kamerasequenz</Section>
          <SequenzGalerie v={v} />
        </View>}
        {user.role === "patrol" && <View style={{ marginBottom: spacing.md }}>
          <Section style={{ marginTop: 0 }}>Lagebild & Einsatzbilder</Section>
          <PatrolMedia v={v} onChanged={load} />
        </View>}

        {/* Kopf */}
        <Card accent={stufeFarbe}>
          <View style={cst.cardTop}>
            <StufeBadge stufe={v.gefahrenstufe} />
            <StatusBadge status={v.status} />
          </View>
          <Text style={cst.artGross}>{v.gefahrenart}</Text>
          <Row label="Ort" value={v.ort || "unbekannt"} />
          <Row label="Kamerabereich" value={v.kamerabereich || "—"} />
          <Row label="Erkannt am" value={fmt(v.erkannt_am)} />
        </Card>

        {/* KI-Einschätzung (getrennt von menschlicher Bewertung) */}
        <Section>KI-Einschätzung</Section>
        <Card accent={colors.secondary}>
          <Row label="Konfidenz" value={v.ki?.konfidenz != null ? `${(v.ki.konfidenz * 100).toFixed(1)} %` : "–"} />
          {v.ki?.konfidenz != null ? (
            <View style={cst.balken}>
              <View style={[cst.balkenFuellung, { width: `${Math.min(100, Math.max(0, v.ki.konfidenz * 100))}%` }]} />
            </View>
          ) : null}
          <Text style={[cst.meta, { marginTop: spacing.sm }]}>{v.ki?.einschaetzung || "—"}</Text>
        </Card>

        {/* Verlauf: menschliche Bewertungen */}
        {v.bewertungen?.length > 0 && <>
          <Section>Bewertungen (Mensch)</Section>
          {v.bewertungen.map((b, i) => (
            <Card key={i} style={cst.verlaufCard}><Text style={cst.recText}>{b.typ?.toUpperCase()}</Text>
              <Text style={cst.meta}>{b.von} · {fmt(b.erstellt_am)}</Text>
              {b.kommentar ? <Text style={cst.zitat}>„{b.kommentar}“</Text> : null}</Card>
          ))}
        </>}

        {/* Verlauf: Koordination */}
        {v.koordination?.length > 0 && <>
          <Section>Einsatzverlauf</Section>
          {v.koordination.map((k, i) => (
            <Card key={i} style={cst.verlaufCard}><Text style={cst.recText}>{k.status?.replace("_", " ").toUpperCase()}</Text>
              <Text style={cst.meta}>{k.von} · {fmt(k.erstellt_am)}</Text></Card>
          ))}
        </>}

        {/* Beweise (Prosecutor) */}
        {user.role === "prosecutor" && <>
          <Section>Gesicherte Beweise</Section>
          {v.beweise?.length ? v.beweise.map((b) => (
            <Card key={b.id} style={cst.verlaufCard} accent={colors.tertiary}>
              <Text style={cst.recText} numberOfLines={1}>{b.dateipfad}</Text>
              <Text style={cst.meta}>Gesichert: {fmt(b.gesichert_am)} · SHA256: {b.sha256 ? b.sha256.slice(0, 12) + "…" : "–"}</Text></Card>
          )) : <Card style={cst.verlaufCard}><Text style={cst.meta}>Keine Sequenzen gesichert.</Text></Card>}
        </>}

        {/* --- Rollen-Aktionen --- */}
        {user.role === "cctv" && <>
          <Section>Bewerten</Section>
          <Button label="SICHERHEITSRELEVANT" color={colors.error} disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "sicherheitsrelevant"), "Als sicherheitsrelevant markiert.")} />
          <Button label="UNKLAR" color={colors.warning} variant="tonal" disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "unklar"))} />
          <Button label="FEHLALARM" color={colors.onSurfaceMedium} variant="outlined" disabled={busy}
            onPress={() => act(() => api.bewerten(vid, "fehlalarm"))} />
          <Section>Freigabe</Section>
          <Button label="FÜR STAATSANWALTSCHAFT FREIGEBEN" color={colors.secondary} disabled={busy}
            onPress={() => act(() => api.freigeben(vid), "Freigegeben.")} />
        </>}

        {user.role === "patrol" && <>
          <Section>Einsatzstatus setzen</Section>
          {["uebernommen", "unterwegs", "vor_ort", "abgeschlossen", "fehlalarm"].map((sset) => (
            <Button key={sset} label={sset.replace("_", " ").toUpperCase()} disabled={busy}
              color={sset === "abgeschlossen" ? colors.success : sset === "fehlalarm" ? colors.onSurfaceMedium : colors.primary}
              variant={sset === "fehlalarm" ? "outlined" : "filled"}
              onPress={() => act(() => api.koordinieren(vid, sset), "Status aktualisiert.")} />
          ))}
        </>}

        {user.role === "prosecutor" && <>
          <Section>Beweissicherung</Section>
          <Button label="ZUSÄTZLICHE BEWEISE ANFORDERN" color={colors.tertiary} disabled={busy}
            onPress={() => setReqOpen(true)} />
        </>}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Prosecutor: Beweisanforderung */}
      <Modal visible={reqOpen} transparent animationType="slide">
        <View style={mst.bg2}><View style={mst.card2}>
          <Text style={mst.title}>Beweise anfordern</Text>
          <TextInput style={cst.reqInput} value={reqText} onChangeText={setReqText} multiline
            placeholder="z.B. Kamerasequenz 5 Min vor Vorfall, Perspektive Gleis 3" placeholderTextColor={colors.onSurfaceDisabled} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Button label="ABBRECHEN" color={colors.onSurfaceMedium} variant="outlined" onPress={() => setReqOpen(false)} /></View>
            <View style={{ flex: 1 }}><Button label="SENDEN" color={colors.secondary}
              onPress={() => { const t = reqText; setReqOpen(false); setReqText(""); act(() => api.beweisAnfordern(vid, t), "Anforderung gesendet."); }} /></View>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const cst = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },

  // Umschalter Vorfälle | Kameras (nur Leitstelle/CCTV)
  tabRow: { flexDirection: "row", paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  tab: {
    flex: 1, paddingVertical: spacing.md, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: colors.outline,
  },
  tabAktiv: { borderBottomColor: colors.primary },
  tabTxt: { color: colors.onSurfaceMedium, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  tabTxtAktiv: { color: colors.primaryLight },

  // Statuszeile unter Kopf/Tabs
  statusBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  statusTxt: { color: colors.onSurfaceMedium, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Karten-Inhalte
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  badgeReihe: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1, flexWrap: "wrap" },

  // Freigabe-Zeitpunkt (Staatsanwaltschaft)
  freigabeBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.sm, backgroundColor: colors.tertiary + "1f",
    borderWidth: 1, borderColor: colors.tertiary + "55",
  },
  freigabeLabel: { color: colors.tertiaryLight, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  freigabeWert: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  fallId: { color: colors.primaryLight, fontSize: 12, fontWeight: "800", letterSpacing: 1, flexShrink: 1 },
  art: { color: colors.onSurface, ...type.subtitle, marginBottom: 2 },
  artGross: { color: colors.onSurface, ...type.h6, marginBottom: spacing.sm },
  meta: { color: colors.onSurfaceMedium, ...type.caption, marginTop: 2 },
  time: { color: colors.onSurfaceMedium, fontSize: 11 },
  recText: { color: colors.onSurface, ...type.body, fontWeight: "600" },
  zitat: { color: colors.onSurfaceMedium, ...type.body2, fontStyle: "italic", marginTop: spacing.xs },
  verlaufCard: { padding: spacing.md, marginBottom: spacing.sm },

  // Vendor
  bereichTitel: { color: colors.onSurface, ...type.subtitle, marginBottom: spacing.xs },
  empfBlock: { marginTop: spacing.md },
  empfTrenner: { borderTopWidth: 1, borderTopColor: colors.outline, paddingTop: spacing.md },
  empfKopf: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  entwarnungBox: {
    marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.sm, backgroundColor: colors.success + "1f",
    borderWidth: 1, borderColor: colors.success + "55",
  },
  entwarnungTxt: { color: colors.successLight, ...type.body2, fontWeight: "600" },
  quittungBox: {
    marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.sm, backgroundColor: colors.primary + "14",
    borderWidth: 1, borderColor: colors.primary + "44",
  },
  quittungTxt: { color: colors.onSurfaceMedium, ...type.body2, fontWeight: "600" },

  // KI-Konfidenzbalken
  balken: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden", marginTop: spacing.md },
  balkenFuellung: { height: 6, borderRadius: 3, backgroundColor: colors.secondary },

  // Leerzustand
  emptyBox: { alignItems: "center", marginTop: 64 },
  emptyIcon: { fontSize: 30, opacity: 0.5, marginBottom: spacing.md },
  empty: { color: colors.onSurfaceMedium, ...type.body, textAlign: "center" },

  // Modal-Inhalte
  reqInput: {
    backgroundColor: colors.surfaceVariant, color: colors.onSurface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.outline,
    minHeight: 90, textAlignVertical: "top", marginBottom: spacing.md, ...type.body,
  },
  helpTxt: { color: colors.onSurfaceMedium, ...type.body2, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.md },
  permRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.outline },
  permTxt: { color: colors.onSurface, ...type.body2, flex: 1 },
});

const mst = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 90, paddingRight: spacing.lg },
  card: {
    backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.outline, width: 260, ...elevation.modal,
  },
  bg2: { flex: 1, backgroundColor: "#000000aa", justifyContent: "center", padding: spacing.xl },
  card2: {
    backgroundColor: colors.surfaceHigh, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.outline, ...elevation.modal,
  },
  title: { color: colors.onSurface, ...type.h6, marginBottom: spacing.xs },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { color: colors.onPrimary, fontSize: 17, fontWeight: "800" },
  name: { color: colors.onSurface, ...type.subtitle },
  role: { color: colors.onSurfaceMedium, ...type.caption, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.outline, marginVertical: spacing.md },
});
