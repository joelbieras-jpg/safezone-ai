/**
 * SafeZone AI - Wiederverwendbare UI-Bausteine (Figma-Look, Material-Farben).
 *
 * Alle Farben kommen aus theme.js (Material-Farbrollen). Fuer gefuellte Flaechen
 * wird die passende "on"-Farbe automatisch bestimmt (onColor), damit die Schrift
 * immer lesbar ist - z.B. schwarze Schrift auf Orange 500, weisse auf Grau 800.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { C, colors, spacing, radius, type, elevation, onColor, STUFE_COLOR, STATUS_COLOR } from "./theme";

// App-Bar: Titel, optional Zurueck-Button und Menue (rechts)
export function Header({ title, subtitle, onBack, right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
      ) : <View style={{ width: 34 }} />}
      <View style={{ flex: 1 }}>
        <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.hSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right || <View style={{ width: 34 }} />}
    </View>
  );
}

// Karte (Material Surface, 01dp)
export function Card({ children, style, onPress, accent }) {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp onPress={onPress} activeOpacity={0.85} style={[s.card, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>
      {children}
    </Comp>
  );
}

// Abschnittsueberschrift (Material "overline")
export function Section({ children, style }) {
  return <Text style={[s.section, style]}>{children}</Text>;
}

// Farbiges Label (Status / Gefahrenstufe) - tonal: Farbe 12 % Flaeche + farbige Schrift
export function Badge({ text, color, solid }) {
  if (solid) {
    return (
      <View style={[s.badge, { backgroundColor: color, borderColor: color }]}>
        <Text style={[s.badgeTxt, { color: onColor(color) }]}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={[s.badge, { borderColor: color + "66", backgroundColor: color + "1f" }]}>
      <Text style={[s.badgeTxt, { color }]}>{text}</Text>
    </View>
  );
}
export const StufeBadge = ({ stufe }) =>
  <Badge text={stufe?.toUpperCase()} color={STUFE_COLOR[stufe] || C.muted} solid={stufe === "kritisch"} />;
export const StatusBadge = ({ status }) =>
  <Badge text={(status || "").replace("_", " ").toUpperCase()} color={STATUS_COLOR[status] || C.muted} />;

/**
 * Button.
 *   variant "filled"   (Standard) - gefuellt, Schrift = passende on-Farbe
 *   variant "tonal"    - 12-%-Flaeche der Farbe, farbige Schrift (Material "tonal")
 *   variant "outlined" - nur Rahmen, farbige Schrift
 */
export function Button({ label, onPress, color = colors.primary, disabled, loading, variant = "filled", style }) {
  const dis = disabled || loading;
  let box, txtColor;
  if (variant === "tonal") {
    box = { backgroundColor: color + "1f", borderColor: color + "55", borderWidth: 1 };
    txtColor = color;
  } else if (variant === "outlined") {
    box = { backgroundColor: "transparent", borderColor: color + "88", borderWidth: 1 };
    txtColor = color;
  } else {
    box = { backgroundColor: dis ? colors.neutralVariant : color };
    txtColor = dis ? colors.onSurfaceDisabled : onColor(color);
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={dis} activeOpacity={0.85}
      style={[s.btn, box, dis && { opacity: loading ? 0.7 : 0.9 }, style]}>
      {loading
        ? <ActivityIndicator color={variant === "filled" ? onColor(color) : color} />
        : <Text style={[s.btnTxt, { color: txtColor }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

// Info-Zeile (Label: Wert)
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
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: 54, paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.outline,
  },
  backBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  backTxt: { color: colors.onSurface, fontSize: 30, marginTop: -4 },
  hTitle: { color: colors.onSurface, ...type.h6 },
  hSub: { color: colors.onSurfaceMedium, ...type.overline, marginTop: 3 },

  card: {
    backgroundColor: colors.surface, borderColor: colors.outline, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    ...elevation.card,
  },
  section: {
    color: colors.onSurfaceMedium, ...type.overline,
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },

  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
    borderWidth: 1, alignSelf: "flex-start",
  },
  badgeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },

  btn: {
    minHeight: 44, paddingVertical: 13, paddingHorizontal: spacing.lg,
    borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    marginTop: spacing.sm,
  },
  btnTxt: { ...type.button, textAlign: "center" },

  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing.sm, borderBottomColor: colors.outline, borderBottomWidth: 1,
  },
  rowLabel: { color: colors.onSurfaceMedium, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  rowValue: { color: colors.onSurface, ...type.body2, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: spacing.md },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.background },
});
