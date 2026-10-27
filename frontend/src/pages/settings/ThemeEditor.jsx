import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { api, errMsg } from "../../lib/api";
import { DEFAULTS, TOKEN_LABELS, contrast, isHex, resolveMode } from "../../lib/theme";
import { Slider } from "../../components/ui/slider";

export default function ThemeEditor({ scope }) {
  const { prefs, ws, savePrefs, setThemeDraft, reloadWs } = useApp();
  const mode = resolveMode(prefs.theme_mode || "light");
  const source = scope === "workspace" ? ws.theme || {} : prefs.theme || {};
  const [draft, setDraft] = useState(source);
  useEffect(() => { setDraft(source); }, [scope]); // eslint-disable-line
  useEffect(() => () => setThemeDraft(null), [setThemeDraft]);
  const base = { ...DEFAULTS[mode], ...(scope === "personal" ? ws.theme?.[mode] || {} : {}) };
  const tokens = { ...base, ...(draft[mode] || {}) };
  const update = (next) => { setDraft(next); setThemeDraft(scope === "personal" ? next : null); };
  const setTok = (k, v) => update({ ...draft, [mode]: { ...(draft[mode] || {}), [k]: v } });
  const warnings = [["text", "surface"], ["text", "bg"], ["muted", "surface"]].filter(([a, b]) => isHex(tokens[a]) && isHex(tokens[b]) && contrast(tokens[a], tokens[b]) < (a === "muted" ? 3 : 4.5));
  const save = async () => {
    try {
      if (scope === "workspace") { await api.patch("/workspace", { theme: draft }); await reloadWs(); } else await savePrefs({ theme: draft });
      setThemeDraft(null); toast.success("Theme saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-5" data-testid={`theme-editor-${scope}`}>
      <p className="text-sm text-sub">Editing the <b className="text-ink">{mode}</b> palette {scope === "workspace" ? "for everyone (personal themes still override it)" : "for you only"}. Switch mode above to edit the other palette.{scope === "workspace" && " Live preview applies after saving."}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(TOKEN_LABELS).map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 rounded-2xl border bg-surface2 p-2.5">
            <input type="color" value={isHex(tokens[k]) ? tokens[k] : "#000000"} onChange={(e) => setTok(k, e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg" aria-label={l} data-testid={`theme-color-${k}`} />
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{l}</span>
              <input value={tokens[k]} onChange={(e) => setTok(k, e.target.value)} className={`mt-0.5 h-7 w-full rounded-md border bg-surface px-2 font-mono text-xs ${isHex(tokens[k]) ? "" : "border-rose-400"}`} data-testid={`theme-hex-${k}`} /></span>
          </label>
        ))}
      </div>
      {warnings.length > 0 && <div className="flex gap-2 rounded-2xl bg-soft-yellow p-3 text-sm text-amber-900 dark:text-amber-100" data-testid="contrast-warning"><AlertTriangle size={16} className="mt-0.5 shrink-0" />Low contrast: {warnings.map(([a, b]) => `${TOKEN_LABELS[a]} on ${TOKEN_LABELS[b]} (${contrast(tokens[a], tokens[b]).toFixed(1)}:1)`).join(", ")}. Text may be hard to read.</div>}
      <div><p className="mb-2 flex justify-between text-xs font-semibold"><span>Corner radius</span><span className="text-sub">{draft.radius ?? 14}px</span></p><Slider min={4} max={24} step={1} value={[draft.radius ?? 14]} onValueChange={([v]) => update({ ...draft, radius: v })} data-testid="theme-radius-slider" /></div>
      <div><p className="mb-2 text-xs font-semibold">Button style</p><div className="flex gap-2">{[["pill", "Pill"], ["rounded", "Rounded"], ["sharp", "Sharp"]].map(([k, l]) => <button key={k} onClick={() => update({ ...draft, button: k })} className={`h-10 flex-1 border text-sm font-semibold ${(draft.button || "pill") === k ? "bg-brand text-white" : ""}`} style={{ borderRadius: k === "pill" ? 999 : k === "sharp" ? 6 : 14 }} data-testid={`theme-button-${k}`}>{l}</button>)}</div></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={!Object.values(draft[mode] || {}).every(isHex)} className="btn-accent h-10 px-5 text-sm font-semibold disabled:opacity-50" data-testid="theme-save-btn">Save</button>
        <button onClick={() => update(source)} className="btn-ghost h-10 border px-5 text-sm font-semibold" data-testid="theme-cancel-btn">Cancel</button>
        <button onClick={() => update({})} className="btn-ghost h-10 border px-5 text-sm font-semibold" data-testid="theme-reset-btn">Reset to defaults</button>
      </div>
    </div>
  );
}
