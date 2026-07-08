/**
 * SafeZone AI – Design-Tokens (aus dem Figma-Prototyp übernommen).
 */
export const C = {
  bg: "#0b0b13",
  card: "#1a1a28",
  cardBorder: "#1e1e30",
  accent: "#f97316",       // Orange
  accent2: "#ea6a0a",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#dc2626",
  text: "#f0f2f8",
  muted: "#64708a",
  faint: "#2a2a42",
};

// Farbe je Gefahrenstufe
export const STUFE_COLOR = {
  niedrig: C.green,
  mittel: C.yellow,
  hoch: C.accent,
  kritisch: C.red,
};

// Farbe je Vorfall-Status
export const STATUS_COLOR = {
  ungeprueft: C.muted,
  unklar: C.yellow,
  sicherheitsrelevant: C.red,
  fehlalarm: C.muted,
  abgeschlossen: C.green,
};

// Anzeigename je Rolle
export const ROLE_LABEL = {
  cctv: "CCTV-Operator",
  patrol: "Patrol Officer",
  vendor: "Station Vendor",
  prosecutor: "Staatsanwaltschaft",
  admin: "Administrator",
};
