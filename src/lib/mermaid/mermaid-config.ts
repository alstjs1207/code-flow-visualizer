import type { MermaidConfig } from "mermaid";

export const mermaidConfig: MermaidConfig = {
  startOnLoad: false,
  theme: "dark",
  darkMode: true,
  flowchart: {
    curve: "basis",
    padding: 24,
    nodeSpacing: 60,
    rankSpacing: 50,
    subGraphTitleMargin: { top: 10, bottom: 10 },
    htmlLabels: true,
    useMaxWidth: false,
  },
  themeVariables: {
    darkMode: true,
    background: "#030712",
    primaryColor: "#1e293b",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#475569",
    lineColor: "#64748b",
    secondaryColor: "#1e293b",
    tertiaryColor: "#0f172a",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: "13px",
  },
};
