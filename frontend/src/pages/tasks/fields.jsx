import { useRef, useState } from "react";
import { Plus, X, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fileUrl, uploadFile } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { LabelChip, PRIORITY } from "../../components/common";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";

export const CARD_COLORS = ["#FF5364", "#F59E0B", "#EAB308", "#22C55E", "#0EA5A4", "#2F7DE1", "#8B5CF6", "#EC4899", "#64748B"];
export const inp = "h-10 w-full rounded-xl border bg-surface2 px-3 text-sm outline-none";

export function UserSelect({ value, onChange, placeholder = "Unassigned", testid }) {
  const { users } = useApp();
  return <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inp} data-testid={testid}><option value="">{placeholder}</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>;
}

export function PrioritySelect({ value, onChange, testid }) {
  return <select value={value || "medium"} onChange={(e) => onChange(e.target.value)} className={inp} data-testid={testid}>{Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select>;
}

export function LabelPicker({ value = [], onChange, testid = "label-picker" }) {
  const { labels, reloadLabels } = useApp();
  const [name, setName] = useState("");
  const [color, setColor] = useState(CARD_COLORS[5]);
  const create = async () => {
    try { const { data } = await api.post("/labels", { name, color }); await reloadLabels(); onChange([...value, data.id]); setName(""); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-h-[40px] w-full flex-wrap items-center gap-1 rounded-xl border bg-surface2 px-2 py-1.5 text-left text-sm" data-testid={testid}>
          {value.length ? value.map((id) => <LabelChip key={id} label={labels.find((l) => l.id === id)} small />) : <span className="text-sub">Add IP / Brand labels</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-surface p-2" align="start">
        <div className="max-h-56 overflow-y-auto">
          {labels.filter((l) => !l.archived).map((l) => { const on = value.includes(l.id); return (
            <button key={l.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])} className="flex w-full items-center gap-2 rounded-lg p-1.5 hover:bg-surface2" data-testid={`label-option-${l.id}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded border">{on && <Check size={12} />}</span><LabelChip label={l} small />
            </button>); })}
        </div>
        <div className="mt-2 flex items-center gap-1 border-t pt-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New label" className="h-8 min-w-0 flex-1 rounded-lg border bg-surface2 px-2 text-xs" data-testid="new-label-input" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 rounded" aria-label="Label color" />
          <button type="button" onClick={create} disabled={!name.trim()} className="btn-accent h-8 px-2 text-xs disabled:opacity-40" data-testid="create-label-btn">Add</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const itemStyle = (c) => ({ background: `${c}38`, color: "#1F2937", border: `1px solid ${c}90` });

export function ItemChip({ name, small }) {
  const { ws } = useApp();
  if (!name) return null;
  const it = (ws.item_types || []).find((i) => i.name === name);
  return <span className={`inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full font-medium ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"}`} style={itemStyle(it?.color || "#94A3B8")} data-testid="item-chip">{name}</span>;
}

export function ItemPicker({ value, onChange, testid = "item-picker", trigger }) {
  const { ws, reloadWs } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = ws.item_types || [];
  const list = all.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = all.find((i) => i.name.toLowerCase() === q.trim().toLowerCase());
  const pick = (n) => { onChange(n); setOpen(false); setQ(""); };
  const create = async () => { try { await api.post("/item-types", { name: q.trim() }); await reloadWs(); pick(q.trim()); } catch (e) { toast.error(errMsg(e)); } };
  const onKey = (e) => { if (e.key !== "Enter") return; e.preventDefault(); if (exact) pick(exact.name); else if (q.trim()) create(); else if (list[0]) pick(list[0].name); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger || <button type="button" className={`${inp} flex items-center text-left`} data-testid={testid}>{value ? <ItemChip name={value} /> : <span className="text-sub">Pilih item</span>}</button>}</PopoverTrigger>
      <PopoverContent className="w-64 bg-surface p-2" align="start">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Cari atau ketik item baru" className="h-9 w-full rounded-lg border bg-surface2 px-2 text-sm outline-none" data-testid={`${testid}-search`} />
        <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">{list.map((i) => <button key={i.name} type="button" onClick={() => pick(i.name)} className={`block w-full rounded-lg px-1.5 py-1 text-left hover:bg-surface2 ${value === i.name ? "bg-surface2" : ""}`} data-testid={`${testid}-option-${i.name.replace(/\s/g, "-")}`}><ItemChip name={i.name} /></button>)}</div>
        {q.trim() && !exact && <button type="button" onClick={create} className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-brand hover:bg-surface2" data-testid={`${testid}-create`}><Plus size={13} />Tambah "{q.trim()}"</button>}
        {value && <button type="button" onClick={() => pick(null)} className="mt-1 w-full rounded-lg py-1 text-xs text-sub hover:bg-surface2" data-testid={`${testid}-clear`}>Kosongkan</button>}
      </PopoverContent>
    </Popover>
  );
}

export function ColorPicker({ value, onChange, style, onStyle }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="card-color-picker">
      {CARD_COLORS.map((c) => <button type="button" key={c} onClick={() => onChange(c)} className={`h-7 w-7 rounded-full ${value === c ? "ring-2 ring-offset-2 ring-[var(--c-text)]" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} data-testid={`card-color-${c.slice(1)}`} />)}
      <input type="color" value={value || "#FF5364"} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 rounded" aria-label="Custom color" />
      <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-sub" data-testid="card-color-reset">Reset</button>
      {onStyle && <select value={style || "accent"} onChange={(e) => onStyle(e.target.value)} className="h-8 rounded-lg border bg-surface2 px-2 text-xs" data-testid="card-style-select"><option value="accent">Accent bar</option><option value="tint">Soft background</option><option value="badge">Badges only</option></select>}
    </div>
  );
}

export function AttachmentList({ items, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <div key={a.id || a.key} className="relative">
          <a href={a.id ? fileUrl(a.id) : undefined} target="_blank" rel="noreferrer" className="flex h-16 items-center gap-2 rounded-xl border bg-surface2 p-1.5 pr-3 text-xs" data-testid={`attachment-${a.id}`}>
            {a.content_type?.startsWith("image/") && a.id ? <img src={fileUrl(a.id)} alt={a.name} className="h-12 w-12 rounded-lg object-cover" /> : <FileText size={18} className="ml-1 text-brand" />}
            <span className="max-w-[120px] truncate">{a.uploading ? "Uploading…" : a.name}</span>
          </a>
          {onRemove && <button type="button" onClick={() => onRemove(a)} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-[var(--c-surface)]" aria-label="Remove attachment" data-testid={`remove-attachment-${a.id}`}><X size={11} /></button>}
        </div>
      ))}
    </div>
  );
}

export function useUploader(setList) {
  const ref = useRef(null);
  const pick = () => ref.current.click();
  const input = <input ref={ref} type="file" multiple hidden onChange={async (e) => {
    const files = Array.from(e.target.files); e.target.value = "";
    for (const f of files) {
      if (f.size > 15 * 1024 * 1024) { toast.error(`${f.name} is larger than 15 MB`); continue; }
      try { const up = await uploadFile(f); setList((x) => [...x, up]); } catch (er) { toast.error(errMsg(er)); }
    }
  }} data-testid="task-attachment-input" />;
  return { pick, input };
}

export function ListEditor({ items, onChange, placeholder, field = "text", testid }) {
  const [t, setT] = useState("");
  return (
    <div data-testid={testid}>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2 py-1">
          <input type="checkbox" checked={!!it.done} onChange={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="h-4 w-4 accent-[var(--c-accent)]" />
          <span className={`flex-1 text-sm ${it.done ? "line-through text-sub" : ""}`}>{it[field]}</span>
          <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-sub" aria-label="Remove"><X size={13} /></button>
        </div>
      ))}
      <div className="mt-1 flex gap-1"><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (t.trim()) { onChange([...items, { id: `i${Date.now()}`, [field]: t.trim(), done: false }]); setT(""); } } }} placeholder={placeholder} className="h-9 flex-1 rounded-lg border bg-surface2 px-2 text-sm" />
        <button type="button" onClick={() => { if (t.trim()) { onChange([...items, { id: `i${Date.now()}`, [field]: t.trim(), done: false }]); setT(""); } }} className="flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="Add"><Plus size={14} /></button></div>
    </div>
  );
}
