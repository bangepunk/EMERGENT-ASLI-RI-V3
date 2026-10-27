export const DEFAULTS = {
  light: { bg: "#F5F7FB", surface: "#FFFFFF", surface2: "#F0F4FA", sidebar: "#FFFFFF", text: "#20283B", muted: "#778198", border: "#E6EAF1", accent: "#FF5364", accentHover: "#F04456", accent2: "#6C8CFF" },
  dark: { bg: "#101522", surface: "#171E2E", surface2: "#202A3D", sidebar: "#141B2A", text: "#F4F6FC", muted: "#A4AEC2", border: "#2B3549", accent: "#FF5364", accentHover: "#F04456", accent2: "#7C9BFF" },
};
const SOFT = {
  light: { red: "#FFF0F2", blue: "#DDEEFF", purple: "#EEE6FF", green: "#DFF7E8", yellow: "#FFF3C4" },
  dark: { red: "#3A2230", blue: "#1E2F4A", purple: "#2C2546", green: "#1B3A2E", yellow: "#3A3420" },
};
export const TOKEN_LABELS = {
  accent: "Primary accent", accentHover: "Accent hover", accent2: "Secondary accent", bg: "Main background", surface: "Cards & surfaces",
  surface2: "Secondary surface", sidebar: "Sidebar background", text: "Primary text", muted: "Secondary text", border: "Borders",
};
const VAR = { bg: "--c-bg", surface: "--c-surface", surface2: "--c-surface2", sidebar: "--c-sidebar", text: "--c-text", muted: "--c-muted", border: "--c-border", accent: "--c-accent", accentHover: "--c-accent-hover", accent2: "--c-accent2" };

export function resolveMode(mode) {
  if (mode === "dark") return "dark";
  if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return "light";
}

export function buildTheme(wsTheme, prefs, draft) {
  const personal = draft || prefs?.theme || {};
  const mode = resolveMode(prefs?.theme_mode || "light");
  const tokens = { ...DEFAULTS[mode], ...(wsTheme?.[mode] || {}), ...(personal?.[mode] || {}) };
  return { mode, tokens, radius: personal.radius ?? wsTheme?.radius ?? 14, button: personal.button || wsTheme?.button || "pill" };
}

export function applyTheme(t) {
  const root = document.documentElement;
  root.classList.toggle("dark", t.mode === "dark");
  Object.entries(VAR).forEach(([k, v]) => root.style.setProperty(v, t.tokens[k]));
  Object.entries(SOFT[t.mode]).forEach(([k, v]) => root.style.setProperty(`--s-${k}`, v));
  root.style.setProperty("--radius", `${t.radius}px`);
  root.style.setProperty("--btn-radius", t.button === "pill" ? "9999px" : t.button === "sharp" ? "6px" : `${t.radius}px`);
}

function lum(hex) {
  const h = (hex || "#000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || "");

export const BG_PRESETS = {
  solid: ["#F5F7FB", "#FFF0F2", "#DDEEFF", "#EEE6FF", "#DFF7E8", "#FFF3C4", "#101522", "#1E2F4A"],
  gradient: [
    { id: "g1", name: "Blush", css: "linear-gradient(135deg,#FFF0F2 0%,#EEE6FF 50%,#DDEEFF 100%)" },
    { id: "g2", name: "Mint", css: "linear-gradient(135deg,#DFF7E8 0%,#DDEEFF 100%)" },
    { id: "g3", name: "Sunrise", css: "linear-gradient(160deg,#FFF3C4 0%,#FFE1E5 55%,#EEE6FF 100%)" },
    { id: "g4", name: "Night", css: "linear-gradient(160deg,#101522 0%,#202A3D 60%,#3A2230 100%)" },
  ],
  abstract: [
    { id: "a1", name: "Bubbles", css: "radial-gradient(circle at 15% 20%,#FFB3BC 0,transparent 28%),radial-gradient(circle at 85% 15%,#C9B6FF 0,transparent 30%),radial-gradient(circle at 70% 85%,#A9D6FF 0,transparent 32%),#F5F7FB" },
    { id: "a2", name: "Shapes", url: "/bg/abstract-1.jpg" },
    { id: "a3", name: "Dunes", url: "/bg/abstract-2.jpg" },
  ],
  nature: [
    { id: "n1", name: "Forest lake", url: "/bg/nature-1.jpg" },
    { id: "n2", name: "Misty valley", url: "/bg/nature-2.jpg" },
    { id: "n3", name: "Alpine", url: "/bg/nature-3.jpg" },
  ],
  pattern: [
    { id: "p1", name: "Dots", css: "radial-gradient(var(--c-border) 1.2px, transparent 1.2px) 0 0/18px 18px, var(--c-bg)" },
    { id: "p2", name: "Grid", css: "linear-gradient(var(--c-border) 1px,transparent 1px) 0 0/28px 28px, linear-gradient(90deg,var(--c-border) 1px,transparent 1px) 0 0/28px 28px, var(--c-bg)" },
    { id: "p3", name: "Waves", css: "repeating-radial-gradient(circle at 0 100%, transparent 0 22px, var(--s-red) 22px 24px), var(--c-bg)" },
  ],
};
export const DEFAULT_BG = { type: "gradient", value: "g1", position: "center", brightness: 100, blur: 0, overlay: 0, tint: "#FFFFFF" };

export function bgLayer(bg, imgUrl) {
  const b = { ...DEFAULT_BG, ...(bg || {}) };
  let background = "var(--c-bg)";
  if (b.type === "solid") background = b.value;
  else if (b.type === "image" && imgUrl) background = `url(${imgUrl}) ${b.position}/cover no-repeat`;
  else {
    const p = (BG_PRESETS[b.type] || []).find((x) => x.id === b.value);
    if (p) background = p.url ? `url(${p.url}) ${b.position}/cover no-repeat` : p.css;
  }
  return {
    base: { background, filter: `brightness(${b.brightness}%) blur(${b.blur}px)`, transform: b.blur ? "scale(1.05)" : undefined },
    overlay: { background: b.tint, opacity: b.overlay / 100 },
  };
}
