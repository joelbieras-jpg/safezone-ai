/**
 * SafeZone AI – Wiederverwendbare UI-Bausteine im Figma-Look.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { C, STUFE_COLOR, STATUS_COLOR } from "./theme";

// Kopfzeile mit Titel, optional Zurück-Button und Menü (Logout)
export function Header({ title, subtitle, onBack, right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn}><Text style={s.backTxt}>‹</Text></TouchableOpacity>
      ) : <View style={{ width: 34 }} />}
      <View style={{ flex: 1 }}>
        <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.hSub}>{subtitle}</Text> : null}
      </View>
      {right || <View style={{ width: 34 }} />}
    </View>
  );
}

// Karte
export function Card({ children, style, onPress }) {
  const Comp = onPress ? TouchableOpacity : View;
  return <Comp onPress={onPress} activeOpacity={0.8} style={[s.card, style]}>{children}</Comp>;
}

// Farbiges Label (Status / Gefahrenstufe)
export function Badge({ text, color }) {
  return (
    <View style={[s.badge, { borderColor: color + "66", backgroundColor: color + "22" }]}>
      <Text style={[s.badgeTxt, { color }]}>{text}</Text>
    </View>
  );
}
export const StufeBadge = ({ stufe }) => <Badge text={stufe?.toUpperCase()} color={STUFE_COLOR[stufe] || C.muted} />;
export const StatusBadge = ({ status }) => <Badge text={(status || "").replace("_", " ").toUpperCase()} color={STATUS_COLOR[status] || C.muted} />;

// Primär-/Sekundär-Button
export function Button({ label, onPress, color = C.accent, disabled, loading }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading}
      style={[s.btn, { backgroundColor: disabled ? C.faint : color, opacity: loading ? 0.7 : 1 }]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{label}</Text>}
    </TouchableOpacity>
  );
}

// Kleiner Info-Zeilen-Block (Label: Wert)
export function Row({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value ?? "–"}</Text>
    </View>
  );
}

export function Center({ children }) {
  return <View style={s.center}>{children}</View>;
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, gap: 8 },
  backBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  backTxt: { color: C.text, fontSize: 30, marginTop: -4 },
  hTitle: { color: C.text, fontSize: 19, fontWeight: "700", letterSpacing: 0.3 },
  hSub: { color: C.muted, fontSize: 11, marginTop: 2, letterSpacing: 0.8, textTransform: "uppercase" },
  card: { backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  badgeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomColor: C.cardBorder, borderBottomWidth: 1 },
  rowLabel: { color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  rowValue: { color: C.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: C.bg },
});
