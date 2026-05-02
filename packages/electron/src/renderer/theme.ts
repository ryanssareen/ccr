/** 1:1 with `packages/cli/src/app.tsx` `theme` — desktop brand parity with Ink TUI. */
export const theme = {
  text: "#EDEFF3",
  textDim: "#A8ACB6",
  textMute: "#7A7F8A",
  teal: "#5FD3CC",
  tealDim: "#42A8A2",
  amber: "#F0C078",
  amberDim: "#C09155",
  red: "#EE7E62",
  green: "#7FD8A4",
  purple: "#BBAFEC",
  magenta: "#E8A0CB",
  border: "#3D4350",
  borderDim: "#2D3340",
} as const;

export type DesktopMode = "ask" | "accept-edits" | "bypass";
