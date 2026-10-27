import { toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { BG_PRESETS, DEFAULT_BG, bgLayer } from "../../lib/theme";
import { errMsg, fileUrl, uploadFile } from "../../lib/api";
import { Slider } from "../../components/ui/slider";

const TYPES = [["solid", "Solid"], ["gradient", "Gradient"], ["abstract", "Abstract"], ["nature", "Nature"], ["pattern", "Pattern"], ["image", "Upload"]];

export default function BackgroundEditor() {
  const { prefs, savePrefs } = useApp();
  const bg = { ...DEFAULT_BG, ...(prefs.background || {}) };
  const set = (patch) => savePrefs({ background: { ...bg, ...patch } });
  const layer = bgLayer(bg, bg.file_id ? fileUrl(bg.file_id) : null);
  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file");
    try { const up = await uploadFile(f); set({ type: "image", file_id: up.id }); toast.success("Background uploaded"); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="mt-4 space-y-5" data-testid="background-editor">
      <div className="relative h-36 overflow-hidden rounded-2xl border"><div className="absolute inset-0" style={layer.base} /><div className="absolute inset-0" style={layer.overlay} /><div className="absolute bottom-3 left-3 rounded-xl bg-surface px-3 py-2 text-xs font-semibold shadow">Cards stay readable</div></div>
      <div className="grid grid-cols-3 gap-1.5">{TYPES.map(([k, l]) => <button key={k} onClick={() => k !== "image" && set({ type: k, value: k === "solid" ? BG_PRESETS.solid[0] : BG_PRESETS[k][0].id })} className={`h-9 rounded-xl text-xs font-semibold ${bg.type === k ? "bg-brand text-white" : "bg-surface2"}`} data-testid={`bg-type-${k}`}>{l}</button>)}</div>
      {bg.type === "solid" && <div className="flex flex-wrap gap-2">{BG_PRESETS.solid.map((c) => <button key={c} onClick={() => set({ value: c })} className={`h-9 w-9 rounded-full border ${bg.value === c ? "ring-2 ring-[var(--c-accent)] ring-offset-2" : ""}`} style={{ background: c }} aria-label={c} />)}<input type="color" value={bg.value?.startsWith("#") ? bg.value : "#F5F7FB"} onChange={(e) => set({ value: e.target.value })} className="h-9 w-9" aria-label="Custom color" /></div>}
      {["gradient", "abstract", "nature", "pattern"].includes(bg.type) && <div className="grid grid-cols-3 gap-2">{BG_PRESETS[bg.type].map((p) => <button key={p.id} onClick={() => set({ value: p.id })} className={`h-20 overflow-hidden rounded-xl border text-[10px] font-semibold ${bg.value === p.id ? "ring-2 ring-[var(--c-accent)] ring-offset-2" : ""}`} style={{ background: p.url ? `url(${p.url}) center/cover` : p.css }} data-testid={`bg-preset-${p.id}`}><span className="rounded bg-surface px-1">{p.name}</span></button>)}</div>}
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed text-sm font-semibold text-sub hover:bg-surface2">Upload your own image<input type="file" accept="image/*" hidden onChange={upload} data-testid="bg-upload-input" /></label>
      {[["brightness", "Brightness", 40, 130], ["blur", "Blur", 0, 20], ["overlay", "Overlay opacity", 0, 90]].map(([k, l, min, max]) => (
        <div key={k}><p className="mb-2 flex justify-between text-xs font-semibold"><span>{l}</span><span className="text-sub">{bg[k]}</span></p><Slider min={min} max={max} step={1} value={[bg[k]]} onValueChange={([v]) => set({ [k]: v })} data-testid={`bg-${k}-slider`} /></div>
      ))}
      <div className="flex items-center justify-between text-xs font-semibold"><span>Color tint</span><input type="color" value={bg.tint} onChange={(e) => set({ tint: e.target.value })} className="h-8 w-10" data-testid="bg-tint-input" /></div>
      <div className="flex items-center justify-between text-xs font-semibold"><span>Position</span><select value={bg.position} onChange={(e) => set({ position: e.target.value })} className="h-9 rounded-lg border bg-surface2 px-2" data-testid="bg-position-select">{["center", "top", "bottom", "left", "right"].map((p) => <option key={p}>{p}</option>)}</select></div>
      <button onClick={() => savePrefs({ background: DEFAULT_BG })} className="btn-ghost h-10 w-full border text-sm font-semibold" data-testid="bg-reset-btn">Reset to default</button>
    </div>
  );
}
