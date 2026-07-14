/**
 * SafeZone AI – Medienbereich der Detailansicht (je Rolle unterschiedlich).
 *
 * Bildet die Figma-Kameraflächen 1:1 nach – und wo sinnvoll besser:
 *   CCTV  (CCTVWarningDetail)        -> 16:9 Feed: Beweisfoto + Umschalten auf LIVE (HLS)
 *   Prosecutor (ProsecutorEvidenceDetail) -> „GESICHERTE KAMERASEQUENZ": Keyframe + Frame-Galerie
 *   Patrol (PatrolMissionDetail)     -> Kontext-Auslösefoto + eigene Einsatzbilder aufnehmen/hochladen
 *   Vendor (VendorWarning)           -> BEWUSST kein Kameramaterial (nur Handlungsempfehlung)
 *
 * Live-Video: expo-av <Video> spielt den HLS-Stream von MediaMTX (ExoPlayer/Android).
 * Bilder: geschützte Endpunkte, Token als Query-Parameter (siehe api.mediaUrl).
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { C } from "./theme";
import { Button } from "./ui";
import * as api from "./api";
import { rlog } from "./crashlog";

const PURPLE = "#a855f7";   // Prosecutor-Akzent (wie Figma)

const jetzt = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ---------------------------------------------------------------------------
//  Kleine Bausteine
// ---------------------------------------------------------------------------
function Platzhalter({ label, accent = C.faint }) {
  return (
    <View style={[m.abs, { alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: accent, fontSize: 26, marginBottom: 6 }}>▤</Text>
      <Text style={{ color: C.faint, fontSize: 10, letterSpacing: 1, fontWeight: "700" }}>{label}</Text>
      {/* dezentes Raster wie im Figma-Prototyp */}
      <View style={m.grid} pointerEvents="none" />
    </View>
  );
}

// Vollbild-Ansicht eines Bildes (Antippen der Fläche)
function Vollbild({ uri, onClose }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={m.fullBg} activeOpacity={1} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={m.fullImg} resizeMode="contain" /> : null}
        <Text style={m.fullHint}>Zum Schließen tippen</Text>
      </TouchableOpacity>
    </Modal>
  );
}

// Umschalt-Chip (Standbild / Live-Feed etc.)
function Chip({ active, label, color = C.accent, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[m.chip, { borderColor: active ? color : C.cardBorder, backgroundColor: active ? color + "22" : "transparent" }]}>
      <Text style={{ color: active ? color : C.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
//  CCTV – 16:9 Feed: Beweisfoto + Umschalten auf Live
// ---------------------------------------------------------------------------
export function CctvFeed({ v }) {
  const [live, setLive] = useState(false);
  const [voll, setVoll] = useState(null);
  const hasFoto = v.hat_beweisbild;
  const hasLive = !!v.live_url;
  const fotoUri = hasFoto ? api.beweisbildUrl(v.id) : null;

  return (
    <View>
      <TouchableOpacity activeOpacity={0.9} disabled={live || !hasFoto}
        onPress={() => setVoll(fotoUri)}>
        <View style={m.frame}>
          {live && hasLive ? (
            <Video source={{ uri: v.live_url }} style={m.abs} resizeMode={ResizeMode.COVER}
              shouldPlay isLooping isMuted useNativeControls={false} />
          ) : fotoUri ? (
            <Image source={{ uri: fotoUri }} style={m.abs} resizeMode="cover" />
          ) : (
            <Platzhalter label="KEIN KAMERABILD" />
          )}

          {/* Overlay: Status oben links, Kamera oben rechts */}
          <View style={m.topRow}>
            <View style={[m.badge, { backgroundColor: live ? "#dc262633" : "#00000066", borderColor: live ? C.red : "#ffffff22" }]}>
              <Text style={{ color: live ? C.red : "#e5e7eb", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>
                {live ? "● LIVE" : "STANDBILD"}
              </Text>
            </View>
            <View style={m.camTag}>
              <Text style={m.camTxt}>{v.kamera_stream || "CAM"} · {live ? "LIVE" : "HD"}</Text>
            </View>
          </View>

          {/* KI-Markierung dezent (Box ist bereits im Beweisfoto eingebrannt) */}
          {!live && hasFoto ? (
            <View style={m.aiTag}><Text style={m.aiTxt}>KI-MARKIERUNG</Text></View>
          ) : null}

          {/* REC unten */}
          <View style={m.recRow}>
            <Text style={m.recTxt}>● REC {jetzt()}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Umschalter */}
      <View style={m.toggleRow}>
        <Chip active={!live} label="STANDBILD" onPress={() => setLive(false)} />
        <Chip active={live} label={hasLive ? "● LIVE-FEED" : "LIVE (offline)"} color={C.red}
          onPress={() => hasLive ? setLive(true) : Alert.alert("Kein Live-Feed", "Für diese Kamera wird aktuell kein Live-Stream empfangen.")} />
      </View>
      <Text style={m.hint}>
        {live ? "Live-Feed der Kamera. Bitte menschlich prüfen und bewerten."
              : "Auslöse-Standbild der KI (Markierung eingezeichnet). Auf Live-Feed umschalten für das aktuelle Kamerabild."}
      </Text>

      <Vollbild uri={voll} onClose={() => setVoll(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
//  Prosecutor – „GESICHERTE KAMERASEQUENZ": Keyframe + Frame-Galerie
// ---------------------------------------------------------------------------
export function SequenzGalerie({ v }) {
  const [idx, setIdx] = useState(-1);   // -1 = Beweis-Keyframe, 0..n-1 = Sequenz
  const [voll, setVoll] = useState(null);
  const count = v.sequenz_count || 0;
  const hauptUri = idx < 0
    ? (v.hat_beweisbild ? api.beweisbildUrl(v.id) : null)
    : api.sequenzFrameUrl(v.id, idx);

  return (
    <View>
      <TouchableOpacity activeOpacity={0.9} disabled={!hauptUri} onPress={() => setVoll(hauptUri)}>
        <View style={[m.frame, { borderColor: PURPLE + "55" }]}>
          {hauptUri ? (
            <Image source={{ uri: hauptUri }} style={m.abs} resizeMode="cover" />
          ) : (
            <Platzhalter label="GESICHERTE KAMERASEQUENZ" accent={PURPLE} />
          )}
          <View style={m.topRow}>
            <View style={[m.badge, { backgroundColor: PURPLE + "22", borderColor: PURPLE + "66" }]}>
              <Text style={{ color: PURPLE, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>GESICHERT</Text>
            </View>
            <View style={m.camTag}>
              <Text style={m.camTxt}>{idx < 0 ? "KEYFRAME" : `FRAME ${idx + 1}/${count}`}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Thumbnail-Streifen: Keyframe + Sequenzframes */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        {v.hat_beweisbild ? (
          <Thumb uri={api.beweisbildUrl(v.id)} label="KEY" active={idx < 0} color={PURPLE} onPress={() => setIdx(-1)} />
        ) : null}
        {Array.from({ length: count }).map((_, i) => (
          <Thumb key={i} uri={api.sequenzFrameUrl(v.id, i)} label={String(i + 1)}
            active={idx === i} color={PURPLE} onPress={() => setIdx(i)} />
        ))}
      </ScrollView>
      <Text style={m.hint}>
        {count > 0
          ? `Gesicherte Kamerasequenz (${count} Frames) rund um den Erkennungszeitpunkt. Antippen zum Vergrößern.`
          : "Keyframe der Detektion. (Keine zusätzliche Sequenz gesichert.)"}
      </Text>

      <Vollbild uri={voll} onClose={() => setVoll(null)} />
    </View>
  );
}

function Thumb({ uri, label, active, color = C.accent, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[m.thumb, { borderColor: active ? color : C.cardBorder }]}>
      <Image source={{ uri }} style={m.abs} resizeMode="cover" />
      <View style={m.thumbLabel}><Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{label}</Text></View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
//  Patrol – Kontext-Auslösefoto + eigene Einsatzbilder aufnehmen/hochladen
// ---------------------------------------------------------------------------
export function PatrolMedia({ v, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [voll, setVoll] = useState(null);
  // vorbelegter Ort = Ort des Vorfalls (falls bekannt), sonst erster Listeneintrag
  const [ort, setOrt] = useState(v.ort && api.ORTE.includes(v.ort) ? v.ort : api.ORTE[0]);
  const bilder = v.einsatzbilder || [];

  async function auswaehlen(vonKamera) {
    try {
      const perm = vonKamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Berechtigung nötig", vonKamera ? "Kamerazugriff verweigert." : "Galeriezugriff verweigert.");
        return;
      }
      const res = vonKamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      await api.uploadEinsatzbild(v.id, res.assets[0].uri, ort);
      onChanged && onChanged();
    } catch (e) {
      // Fehler auch an den Server melden (z.B. fehlendes natives Modul)
      rlog("EINSATZBILD-FEHLER: " + String(e?.message || e));
      Alert.alert("Fehler", String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      {/* Kontext: Auslöse-Standbild der KI */}
      {v.hat_beweisbild ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setVoll(api.beweisbildUrl(v.id))}>
          <View style={m.frame}>
            <Image source={{ uri: api.beweisbildUrl(v.id) }} style={m.abs} resizeMode="cover" />
            <View style={m.topRow}>
              <View style={[m.badge, { backgroundColor: "#00000066", borderColor: "#ffffff22" }]}>
                <Text style={{ color: "#e5e7eb", fontSize: 10, fontWeight: "800" }}>KI-AUSLÖSER</Text>
              </View>
              <View style={m.camTag}><Text style={m.camTxt}>{v.kamera_stream || "CAM"}</Text></View>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={m.frame}><Platzhalter label="KEIN KAMERABILD" /></View>
      )}

      {/* eigene Einsatzbilder (je mit Ort-Label, falls gesetzt) */}
      {bilder.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {bilder.map((b) => (
            <Thumb key={b.name} uri={api.einsatzbildUrl(v.id, b.name)} label={b.ort ? "📍" : "📷"} active={false}
              onPress={() => setVoll(api.einsatzbildUrl(v.id, b.name))} />
          ))}
        </ScrollView>
      ) : null}

      {/* Ort-Auswahl: WO wurde das Bild gemacht */}
      <Text style={[m.label, { marginTop: 12 }]}>Ort des Einsatzbildes</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        {api.ORTE.map((o) => (
          <TouchableOpacity key={o} onPress={() => setOrt(o)}
            style={[m.ortChip, ort === o && m.ortChipActive]}>
            <Text style={[m.ortTxt, ort === o && m.ortTxtActive]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Aufnahme / Upload */}
      <View style={m.toggleRow}>
        <View style={{ flex: 1 }}>
          <Button label={busy ? "…" : "📷 FOTO AUFNEHMEN"} disabled={busy} onPress={() => auswaehlen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="GALERIE" color="#374151" disabled={busy} onPress={() => auswaehlen(false)} />
        </View>
      </View>
      {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 4 }} /> : null}
      <Text style={m.hint}>Ort „{ort}“ wird mit dem Einsatzbild gespeichert und im Verlauf dokumentiert.</Text>

      <Vollbild uri={voll} onClose={() => setVoll(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
//  Styles
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  CCTV – Kamera-Übersicht (alle Kameras, unabhängig von Vorfällen)
//  Eine Kachel je Kamera: Live-Bild (HLS) wenn ein Stream anliegt, sonst
//  "KEIN SIGNAL". Tippen auf eine Live-Kamera öffnet den Vollbild-Live-Feed.
// ---------------------------------------------------------------------------
export function KameraKachel({ k, onOpen }) {
  const ortText = [k.bereich, k.ort].filter(Boolean).join(" · ") || "Ort unbekannt";
  return (
    <TouchableOpacity activeOpacity={0.9} disabled={!k.live} onPress={() => onOpen && onOpen(k)}
      style={{ marginBottom: 14 }}>
      <View style={m.frame}>
        {k.live ? (
          <Video source={{ uri: k.live_url }} style={m.abs} resizeMode={ResizeMode.COVER}
            shouldPlay isLooping isMuted useNativeControls={false} />
        ) : (
          <Platzhalter label="KEIN SIGNAL" />
        )}
        <View style={m.topRow}>
          <View style={[m.badge, { backgroundColor: k.live ? "#dc262633" : "#00000066",
                                   borderColor: k.live ? C.red : "#ffffff22" }]}>
            <Text style={{ color: k.live ? C.red : C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>
              {k.live ? "● LIVE" : "OFFLINE"}
            </Text>
          </View>
          <View style={m.camTag}><Text style={m.camTxt}>{k.name}</Text></View>
        </View>
      </View>
      <View style={m.kamZeile}>
        <Text style={m.kamOrt}>{ortText}</Text>
        <Text style={[m.kamState, { color: k.live ? C.green : C.muted }]}>
          {k.live ? "Live-Feed – antippen" : k.aktiv ? "kein Stream" : "deaktiviert"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Vollbild-Live-Feed einer Kamera
export function KameraVollbild({ kamera, onClose }) {
  if (!kamera) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.vollBg}>
        <Video source={{ uri: kamera.live_url }} style={m.vollVid} resizeMode={ResizeMode.CONTAIN}
          shouldPlay isLooping isMuted={false} useNativeControls />
        <View style={{ position: "absolute", top: 50, left: 20, right: 20,
                       flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={m.camTag}>
            <Text style={m.camTxt}>{kamera.name} · {[kamera.bereich, kamera.ort].filter(Boolean).join(" · ")}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  abs: { ...StyleSheet.absoluteFillObject },
  frame: {
    width: "100%", aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden",
    backgroundColor: "#0f1219", borderWidth: 1, borderColor: C.cardBorder,
  },
  grid: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.12,
    borderWidth: 0,
  },
  topRow: {
    position: "absolute", top: 8, left: 8, right: 8,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  camTag: { backgroundColor: "#00000066", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  camTxt: { color: "#e5e7eb", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  kamZeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingHorizontal: 2 },
  kamOrt: { color: C.text, fontSize: 13, fontWeight: "600", flex: 1 },
  kamState: { fontSize: 11, fontWeight: "600", marginLeft: 8 },
  vollBg: { flex: 1, backgroundColor: "#000000ee", alignItems: "center", justifyContent: "center" },
  vollVid: { width: "100%", height: "70%" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center" },
  aiTag: { position: "absolute", left: 8, bottom: 26, backgroundColor: C.accent + "22", borderColor: C.accent, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  aiTxt: { color: C.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  recRow: { position: "absolute", left: 8, bottom: 8 },
  recTxt: { color: "#f87171", fontSize: 10, fontWeight: "700", letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
  toggleRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  chip: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  hint: { color: C.muted, fontSize: 11, marginTop: 8, lineHeight: 15 },
  label: { color: C.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  ortChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: "#0f1219" },
  ortChipActive: { borderColor: C.accent, backgroundColor: C.accent + "22" },
  ortTxt: { color: C.muted, fontSize: 12, fontWeight: "700" },
  ortTxtActive: { color: C.accent },
  thumb: { width: 74, height: 48, borderRadius: 8, overflow: "hidden", borderWidth: 2, marginRight: 8, backgroundColor: "#0f1219" },
  thumbLabel: { position: "absolute", right: 3, bottom: 3, backgroundColor: "#000000aa", paddingHorizontal: 4, borderRadius: 4 },
  fullBg: { flex: 1, backgroundColor: "#000000ee", alignItems: "center", justifyContent: "center" },
  fullImg: { width: "100%", height: "80%" },
  fullHint: { color: C.muted, fontSize: 12, marginTop: 10 },
});
