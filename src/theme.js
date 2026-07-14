/**
 * SafeZone AI - Design-Tokens.
 *
 * Look & Feel: dunkles Theme nach dem Figma-Prototyp (dunkel, Orange-Akzent,
 * Karten/Badges, iPhone-Hochformat).
 * Farben: Material-Design-Farbsystem (m2.material.io/design/color/the-color-system).
 *
 * Rollen (Material):
 *   primary / primaryVariant   - Orange 500 / Orange 700   (Marke, Hauptaktion)
 *   secondary / secondaryVar.  - Blue   500 / Blue   700   (Nebenaktion: Freigabe, Einstellungen)
 *   background / surface       - Dark-Theme-Baseline #121212 / erhoehte Flaechen
 *   error                      - Red    500 / Red    700
 *   dazu Semantik: success (Green 500), warning (Amber 500), tertiary (Purple 500, Beweise)
 *   "on"-Farben (onPrimary, onSurface, ...) sorgen fuer lesbaren Kontrast.
 *
 * Im dunklen Theme werden fuer Text/Icons die helleren 200er-Toene benutzt,
 * fuer gefuellte Flaechen die 500er/700er-Toene mit passender "on"-Farbe.
 *
 * WICHTIG: alle Farbwerte bleiben 6-stellige Hex-Werte - im Code wird an
 * einigen Stellen ein Alpha-Suffix angehaengt (z.B. color + "22").
 */

// --- Material-Baseline-Paletten (nur die verwendeten Toene) ----------------
const M = {
  orange500: "#ff9800", orange700: "#f57c00", orange300: "#ffb74d", orange200: "#ffcc80",
  blue500: "#2196f3", blue700: "#1976d2", blue200: "#90caf9",
  green500: "#4caf50", green700: "#388e3c", green200: "#a5d6a7",
  amber500: "#ffc107", amber700: "#ffa000", amber200: "#ffe082",
  red500: "#f44336", red700: "#d32f2f", red200: "#ef9a9a",
  purple500: "#9c27b0", purple200: "#ce93d8",
  grey900: "#212121", grey800: "#424242", grey700: "#616161", grey500: "#9e9e9e",
  white: "#ffffff", black: "#000000",
};

// --- Material-Farbrollen (Dark Theme) --------------------------------------
export const colors = {
  // Marke / Hauptaktion
  primary: M.orange500,
  primaryVariant: M.orange700,
  primaryLight: M.orange200,        // Text/Icons auf dunklem Grund (200er-Ton)
  onPrimary: M.black,

  // Nebenaktion
  secondary: M.blue500,
  secondaryVariant: M.blue700,
  secondaryLight: M.blue200,
  onSecondary: M.black,

  // Flaechen (Material Dark-Theme-Baseline: #121212 + Elevation-Overlays)
  background: "#121212",
  surface: "#1e1e1e",               // Karte (01dp)
  surfaceVariant: "#242424",        // erhoehte Flaeche (Eingabefeld, Modal-Kopf)
  surfaceHigh: "#2c2c2c",           // Overlay/Modal (08dp)
  outline: "#333333",               // Rahmen (weiss 12 %)
  scrim: "#000000",

  // Text/Icons auf Background/Surface (Emphasis-Stufen)
  onSurface: M.white,               // high emphasis
  onSurfaceMedium: M.grey500,       // medium emphasis (Meta, Labels)
  onSurfaceDisabled: M.grey700,     // disabled

  // Zustand / Semantik
  error: M.red500,
  errorVariant: M.red700,
  errorLight: M.red200,
  onError: M.black,

  success: M.green500,
  successVariant: M.green700,
  successLight: M.green200,

  warning: M.amber500,
  warningVariant: M.amber700,
  warningLight: M.amber200,

  // Beweissicherung / Staatsanwaltschaft
  tertiary: M.purple500,
  tertiaryLight: M.purple200,

  // Neutrale (tertiaere) Buttons
  neutral: M.grey800,
  neutralVariant: M.grey900,
  onNeutral: M.white,
};

// --- Abstaende, Radien, Typografie ----------------------------------------
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 };

// Material Type Scale (auf die App reduziert)
export const type = {
  h5:       { fontSize: 24, fontWeight: "700", letterSpacing: 0 },
  h6:       { fontSize: 19, fontWeight: "700", letterSpacing: 0.15 },
  subtitle: { fontSize: 15, fontWeight: "600", letterSpacing: 0.15 },
  body:     { fontSize: 14, fontWeight: "400", letterSpacing: 0.25 },
  body2:    { fontSize: 13, fontWeight: "400", letterSpacing: 0.25 },
  caption:  { fontSize: 12, fontWeight: "400", letterSpacing: 0.4 },
  overline: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  button:   { fontSize: 14, fontWeight: "700", letterSpacing: 1.25 },
};

// Material-Elevation im Dark Theme = hellere Flaeche + weicher Schatten
export const elevation = {
  card:  { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modal: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
};

/**
 * Passende "on"-Farbe (schwarz/weiss) fuer eine beliebige Fuellfarbe.
 * Material: on-Farbe muss ausreichend Kontrast zur Flaeche haben - helle
 * 500er-Toene (Orange/Amber/Green) brauchen SCHWARZE Schrift, dunkle Flaechen weisse.
 */
export function onColor(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return colors.onSurface;
  const lin = (v) => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(h.slice(0, 2)) + 0.7152 * lin(h.slice(2, 4)) + 0.0722 * lin(h.slice(4, 6));
  // Kontrast gegen Weiss bzw. Schwarz vergleichen
  const cWhite = 1.05 / (L + 0.05);
  const cBlack = (L + 0.05) / 0.05;
  return cBlack >= cWhite ? "#000000" : "#ffffff";
}

// --- Kompatibilitaets-Kurznamen (werden in App.js/ui.js/media.js benutzt) ---
export const C = {
  bg: colors.background,
  card: colors.surface,
  cardBorder: colors.outline,
  surfaceVariant: colors.surfaceVariant,
  accent: colors.primary,          // Orange 500
  accent2: colors.primaryVariant,  // Orange 700
  accentLight: colors.primaryLight,
  blue: colors.secondary,
  green: colors.success,
  yellow: colors.warning,
  red: colors.error,
  purple: colors.tertiary,
  neutral: colors.neutral,
  text: colors.onSurface,
  muted: colors.onSurfaceMedium,
  faint: colors.onSurfaceDisabled,
};

// Farbe je Gefahrenstufe (niedrig=gruen, mittel=gelb, hoch=orange, kritisch=rot)
export const STUFE_COLOR = {
  niedrig: colors.success,
  mittel: colors.warning,
  hoch: colors.primary,
  kritisch: colors.error,
};

// Farbe je Vorfall-Status
export const STATUS_COLOR = {
  ungeprueft: colors.onSurfaceMedium,
  unklar: colors.warning,
  sicherheitsrelevant: colors.error,
  fehlalarm: colors.onSurfaceMedium,
  abgeschlossen: colors.success,
};

// Anzeigename je Rolle
export const ROLE_LABEL = {
  cctv: "CCTV-Operator",
  patrol: "Patrol Officer",
  vendor: "Station Vendor",
  prosecutor: "Staatsanwaltschaft",
  admin: "Administrator",
};
