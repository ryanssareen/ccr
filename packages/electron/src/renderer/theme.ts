/** Desktop palette — mirrors the website (cream / ink / clay). */
export const theme = {
  // Surfaces
  bg: "#faf9f5",
  bgAlt: "#f5f3ec",
  bgAlt2: "#ecead9",
  white: "#ffffff",

  // Text
  text: "#141413",
  textDim: "#5b5a55",
  textMute: "#8a8881",
  textSoft: "#b0aea5",

  // Accents
  clay: "#d97757",
  clayHover: "#c66a4a",
  claySoft: "rgba(217, 119, 87, 0.12)",
  clayMute: "#d6b3a4",
  sky: "#6a9bcc",
  sage: "#788c5d",
  amber: "#c98e3a",
  red: "#b42c2c",
  green: "#788c5d",

  // Borders
  border: "#141413",
  borderSoft: "#d8d4c8",
  borderSoft2: "#e3dfd2",

  // Legacy aliases kept so existing components compile while we migrate.
  // Pointing at new tokens so even un-touched components pick up the
  // cream palette.
  tealDim: "#6a9bcc",
  teal: "#6a9bcc",
  amberDim: "#c98e3a",
  purple: "#7a6fb0",
  magenta: "#b07aa1",
  borderDim: "#e3dfd2",
} as const;

export type DesktopMode = "ask" | "accept-edits" | "bypass";
