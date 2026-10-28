import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, ArrowUp, ArrowDown, Eye, EyeOff, Plus, ArrowUpDown, Pencil, Maximize2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { PRIORITY, dueInfo, fmtDate } from "../../components/common";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { TaskCard } from "./Board";
import { ItemPicker, ItemChip } from "./fields";

const COLS = [["assignee_id", "Name", 12], ["label_ids", "Owner", 10], ["item_type", "Item", 13], ["link_url", "Link File/Folder", 15], ["title", "Title", 18], ["submit_date", "Submit Date", 11], ["deadline", "Deadline", 11], ["status", "Status", 11], ["number", "ID", 5], ["priority", "Priority", 8], ["requestor_id", "Requestor", 10], ["project_id", "Project", 10], ["completed_at", "Completed", 9], ["updated_at", "Last updated", 9]];
const DEFAULT_HIDDEN = ["number", "priority", "requestor_id", "project_id", "completed_at", "updated_at"];
const ci = "h-8 w-full min-w-0 rounded-md bg-transparent px-1.5 text-xs outline-none hover:bg-surface2 focus:bg-surface focus:ring-2 focus:ring-[var(--c-accent)]";
const pill = "h-7 w-full min-w-0 cursor-pointer truncate rounded-full px-2.5 text-xs font-medium outline-none";
const OPT = { color: "#20283B", background: "#fff" };
const dayOf = (iso) => (iso ? fmtDate(iso, "yyyy-MM-dd") : "");

function LinkCell({ t, patch }) {
  const [edit, setEdit] = useState(false);
  const v = t.link_url || "";
  if (edit || !v) return <input autoFocus={edit} defaultValue={v} placeholder={edit ? "Tempel link…" : ""} onBlur={(e) => { setEdit(false); const n = e.target.value.trim(); if (n !== v) patch(t, { link_url: n }); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className={ci} data-testid={`sheet-link-input-${t.id}`} />;
  const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return (
    <div className="flex h-8 items-center gap-1 px-1.5">
      <Link2 size={12} className="shrink-0 text-sub" />
      <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-blue-600 underline dark:text-blue-400" data-testid={`sheet-link-${t.id}`}>{v.replace(/^https?:\/\//i, "")}</a>
      <button onClick={() => setEdit(true)} className="shrink-0 text-sub opacity-0 group-hover:opacity-100" aria-label="Edit link" data-testid={`sheet-link-edit-${t.id}`}><Pencil size={11} /></button>
    </div>
  );
}

function Cell({ k, t, projects, patch, onOpen }) {
  const { userMap, users, statuses, labels, labelMap, ws } = useApp();
  const done = statuses.find((s) => s.key === t.status)?.is_done;
  switch (k) {
    case "assignee_id": return <select value={t.assignee_id || ""} onChange={(e) => patch(t, { assignee_id: e.target.value || null })} className={`${pill} bg-surface2`} data-testid={`sheet-name-${t.id}`}><option value="">—</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>;
    case "label_ids": {
      const l = labelMap[t.label_ids?.[0]];
      const set = (id) => patch(t, { label_ids: id ? [id, ...(t.label_ids || []).slice(1).filter((x) => x !== id)] : (t.label_ids || []).slice(1) });
      return <select value={l?.id || ""} onChange={(e) => set(e.target.value)} className={`${pill} font-semibold ${l ? "" : "bg-surface2"}`} style={l ? { background: l.color, color: "#fff" } : undefined} data-testid={`sheet-owner-${t.id}`}><option value="" style={OPT}>—</option>{labels.filter((x) => !x.archived || x.id === l?.id).map((x) => <option key={x.id} value={x.id} style={OPT}>{x.name}</option>)}</select>;
    }
    case "item_type": return <ItemPicker value={t.item_type} onChange={(v) => patch(t, { item_type: v })} testid={`sheet-item-${t.id}`} trigger={<button type="button" className="flex h-8 w-full min-w-0 items-center rounded-md px-1 hover:bg-surface2" data-testid={`sheet-item-${t.id}`}>{t.item_type ? <ItemChip name={t.item_type} small /> : <span className="px-1 text-xs text-sub">—</span>}</button>} />;
    case "link_url": return <LinkCell t={t} patch={patch} />;
    case "title": return (
      <div className="flex items-center">
        <input defaultValue={t.title} key={t.updated_at} onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch(t, { title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className={`${ci} text-[13px] font-medium`} data-testid={`list-title-${t.id}`} />
        <button onClick={() => onOpen(t.id)} className="shrink-0 rounded-md p-1 text-sub opacity-0 hover:bg-surface2 group-hover:opacity-100" aria-label="Buka detail" data-testid={`open-task-${t.id}`}><Maximize2 size={12} /></button>
      </div>);
    case "submit_date": return <input type="date" defaultValue={t.submit_date || ""} key={`sd${t.submit_date}`} onChange={(e) => e.target.value !== (t.submit_date || "") && patch(t, { submit_date: e.target.value || null })} className={ci} data-testid={`sheet-submit-${t.id}`} />;
    case "deadline": { const d = dueInfo(t.deadline, done); return <input type="date" defaultValue={dayOf(t.deadline)} key={`dl${t.deadline}`} onChange={(e) => { if (e.target.value !== dayOf(t.deadline)) patch(t, { deadline: e.target.value ? new Date(`${e.target.value}T17:00`).toISOString() : null }); }} className={`${ci} ${d?.cls || ""}`} data-testid={`sheet-deadline-${t.id}`} />; }
    case "status": { const s = statuses.find((x) => x.key === t.status); return <select value={t.status} onChange={(e) => patch(t, { status: e.target.value })} className={`${pill} text-[#20283B]`} style={{ background: s?.color }} data-testid={`list-status-${t.id}`}>{statuses.map((x) => <option key={x.key} value={x.key} style={OPT}>{x.name}</option>)}</select>; }
    case "number": return <span className="px-1.5 text-xs text-sub">{t.number_str}</span>;
    case "priority": return <select value={t.priority} onChange={(e) => patch(t, { priority: e.target.value })} className={`${ci} font-semibold`} data-testid={`list-priority-${t.id}`}>{Object.entries(PRIORITY).map(([p, v]) => <option key={p} value={p}>{v.name}</option>)}</select>;
    case "requestor_id": return <span className="block truncate px-1.5 text-xs">{userMap[t.requestor_id]?.name || "—"}</span>;
    case "project_id": return <span className="block truncate px-1.5 text-xs">{projects[t.project_id]?.name || "—"}</span>;
    case "completed_at": return <span className="block truncate px-1.5 text-xs text-emerald-600">{t.completed_at ? fmtDate(t.completed_at, "d MMM") : "—"}</span>;
    case "updated_at": return <span className="block truncate px-1.5 text-xs text-sub">{fmtDate(t.updated_at, "d MMM HH:mm")}</span>;
    default: {
      const cf = (ws.task_fields || []).find((f) => f.key === k);
      return cf ? <input defaultValue={t.custom?.[k] || ""} onBlur={(e) => e.target.value !== (t.custom?.[k] || "") && patch(t, { custom: { ...(t.custom || {}), [k]: e.target.value } })} className={ci} /> : null;
    }
  }
}

function ColumnMenu({ cols, cfg, save }) {
  const { isManager, ws, reloadWs } = useApp();
  const [name, setName] = useState("");
  const move = (k, dir) => { const o = cols.map((c) => c[0]); const i = o.indexOf(k); const j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; save({ ...cfg, order: o }); };
  const toggle = (k) => save({ ...cfg, hidden: (cfg.hidden || []).includes(k) ? cfg.hidden.filter((x) => x !== k) : [...(cfg.hidden || []), k] });
  const add = async () => { try { await api.put("/settings/task-config", { task_fields: [...(ws.task_fields || []), { name }] }); setName(""); reloadWs(); toast.success("Column added"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Popover><PopoverTrigger asChild><button className="btn-ghost flex h-10 items-center gap-1.5 border bg-surface px-3 text-sm font-medium" data-testid="list-columns-btn"><Columns3 size={15} />Columns</button></PopoverTrigger>
      <PopoverContent className="w-72 bg-surface p-2" align="end">
        <div className="max-h-72 overflow-y-auto">{cols.map(([k, l], i) => (
          <div key={k} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-surface2"><span className={`flex-1 ${(cfg.hidden || []).includes(k) ? "text-sub line-through" : ""}`}>{l}</span>
            <button onClick={() => move(k, -1)} disabled={!i} className="text-sub disabled:opacity-30" aria-label="Move left"><ArrowUp size={13} /></button><button onClick={() => move(k, 1)} className="text-sub" aria-label="Move right"><ArrowDown size={13} /></button>
            <button onClick={() => toggle(k)} className="text-sub" aria-label="Toggle column" data-testid={`toggle-col-${k}`}>{(cfg.hidden || []).includes(k) ? <EyeOff size={13} /> : <Eye size={13} />}</button></div>))}</div>
        {isManager && <div className="mt-2 flex gap-1 border-t pt-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New custom column" className="h-8 flex-1 rounded-lg border bg-surface2 px-2 text-xs" data-testid="custom-column-input" /><button onClick={add} disabled={!name.trim()} className="btn-accent flex h-8 w-8 items-center justify-center disabled:opacity-40" aria-label="Add column" data-testid="custom-column-add"><Plus size={14} /></button></div>}
        <button onClick={() => save({ hidden: DEFAULT_HIDDEN })} className="mt-2 w-full text-xs font-semibold text-brand">Reset columns</button>
      </PopoverContent></Popover>
  );
}

function AddRow({ span, onAdd, gkey }) {
  const [v, setV] = useState("");
  const submit = async () => { if (!v.trim()) return; await onAdd(v.trim()); setV(""); };
  return <tr><td className="border-r p-0 text-center text-sub"><Plus size={13} className="mx-auto" /></td><td colSpan={span} className="p-0"><input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} onBlur={submit} placeholder="Tambah baris baru — ketik judul lalu Enter" className="h-9 w-full bg-transparent px-3 text-xs outline-none placeholder:text-sub focus:bg-surface2" data-testid={`sheet-add-row-${gkey}`} /></td></tr>;
}

export default function ListView({ tasks, projects, onOpen, selected, setSelected, reload, groupBy }) {
  const { prefs, savePrefs, ws, statuses, userMap, labelMap, me } = useApp();
  const [collapsed, setCollapsed] = useState({});
  const [sort, setSort] = useState({ k: "number", dir: 1 });
  const [limit, setLimit] = useState({});
  const cfg = prefs.task_sheet || { hidden: DEFAULT_HIDDEN };
  const all = [...COLS, ...(ws.task_fields || []).map((f) => [f.key, f.name, 10])];
  const cols = [...(cfg.order || []).map((k) => all.find((c) => c[0] === k)).filter(Boolean), ...all.filter((c) => !(cfg.order || []).includes(c[0]))];
  const visible = cols.filter((c) => !(cfg.hidden || []).includes(c[0]));
  const total = 4 + visible.reduce((s, c) => s + c[2], 0);
  const patch = async (t, body) => { try { await api.patch(`/tasks/${t.id}`, body); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const val = (t, k) => (k === "assignee_id" ? userMap[t.assignee_id]?.name : k === "label_ids" ? labelMap[t.label_ids?.[0]]?.name : t[k]) ?? "";
  const sorted = useMemo(() => [...tasks].sort((a, b) => { const x = val(a, sort.k); const y = val(b, sort.k); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; }), [tasks, sort, userMap, labelMap]); // eslint-disable-line
  const groups = useMemo(() => {
    if (groupBy === "status") return statuses.map((s) => [s.key, s.name, s.color, sorted.filter((t) => t.status === s.key)]);
    if (groupBy === "assignee") { const ids = [...new Set(sorted.map((t) => t.assignee_id || ""))]; return ids.map((id) => [id || "none", userMap[id]?.name || "Unassigned", "var(--s-blue)", sorted.filter((t) => (t.assignee_id || "") === id)]); }
    if (groupBy === "department") { const ds = [...new Set(sorted.map((t) => t.department || ""))]; return ds.map((d) => [d || "none", d || "No department", "var(--s-green)", sorted.filter((t) => (t.department || "") === d)]); }
    if (groupBy === "label") { const ls = [...new Set(sorted.flatMap((t) => (t.label_ids?.length ? t.label_ids : [""])))]; return ls.map((l) => [l || "none", labelMap[l]?.name || "No label", labelMap[l] ? `${labelMap[l].color}33` : "var(--s-yellow)", sorted.filter((t) => (l ? t.label_ids?.includes(l) : !t.label_ids?.length))]); }
    return [["all", null, null, sorted]];
  }, [groupBy, sorted, statuses, userMap, labelMap]);
  const toggleSel = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const addRow = async (key, title) => {
    const body = { title, assignee_id: me.user_id };
    if (groupBy === "status") body.status = key;
    if (groupBy === "assignee" && key !== "none") body.assignee_id = key;
    if (groupBy === "label" && key !== "none") body.label_ids = [key];
    try { await api.post("/tasks", body); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid="task-list-view">
      <div className="mb-3 hidden justify-end gap-2 md:flex"><ColumnMenu cols={cols} cfg={cfg} save={(c) => savePrefs({ task_sheet: c })} /></div>
      {!tasks.length && <p className="mb-3 rounded-2xl border border-dashed p-6 text-center text-sm text-sub" data-testid="task-list-empty">No tasks match these filters.</p>}
      <div className="space-y-5">
        {groups.map(([key, name, color, items]) => {
          const lim = limit[key] || 100;
          return (
            <section key={key} data-testid={`list-group-${key}`}>
              {name && <button onClick={() => setCollapsed({ ...collapsed, [key]: !collapsed[key] })} className="mb-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left" style={{ background: color }}>
                {collapsed[key] ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<span className="text-sm font-bold text-[#20283B] dark:text-ink">{name}</span><span className="rounded-full bg-surface px-2 text-xs font-semibold">{items.length}</span>
              </button>}
              {!collapsed[key] && <>
                <div className="hidden overflow-hidden rounded-xl border bg-surface md:block">
                  <table className="w-full table-fixed border-collapse text-left" data-testid={`task-sheet-${key}`}>
                    <colgroup><col style={{ width: `${(4 / total) * 100}%` }} />{visible.map(([k, , w]) => <col key={k} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
                    <thead><tr className="bg-surface2">
                      <th className="border-b border-r p-0 text-center"><input type="checkbox" checked={items.length > 0 && items.every((t) => selected.includes(t.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...items.map((t) => t.id)])] : selected.filter((x) => !items.some((t) => t.id === x)))} className="accent-[var(--c-accent)]" aria-label="Select all" data-testid={`select-all-${key}`} /></th>
                      {visible.map(([k, l]) => <th key={k} className="border-b border-r px-2 py-2 last:border-r-0"><button onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })} className="flex w-full min-w-0 items-center gap-1 text-xs font-bold text-ink" data-testid={`sort-${k}`}><span className="truncate">{l}</span><ArrowUpDown size={10} className={`shrink-0 ${sort.k === k ? "text-brand" : "opacity-30"}`} /></button></th>)}
                    </tr></thead>
                    <tbody>{items.slice(0, lim).map((t, i) => { const on = selected.includes(t.id); return (
                      <tr key={t.id} className={`group border-b ${on ? "bg-soft-red" : i % 2 ? "bg-[var(--s-blue)]/30" : ""} hover:bg-surface2/70`} data-testid={`task-row-${t.id}`}>
                        <td className="relative border-r p-0 text-center"><span className={`text-[11px] text-sub ${on ? "opacity-0" : "group-hover:opacity-0"}`}>{i + 1}</span><input type="checkbox" checked={on} onChange={() => toggleSel(t.id)} className={`absolute inset-0 m-auto h-4 w-4 accent-[var(--c-accent)] ${on ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} aria-label="Select task" data-testid={`select-task-${t.id}`} /></td>
                        {visible.map(([k]) => <td key={k} className="border-r px-0.5 py-0.5 last:border-r-0"><Cell k={k} t={t} projects={projects} patch={patch} onOpen={onOpen} /></td>)}
                      </tr>); })}
                      <AddRow span={visible.length} onAdd={(title) => addRow(key, title)} gkey={key} />
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 md:hidden">{items.slice(0, lim).map((t) => <div key={t.id} className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSel(t.id)} className="mt-4 h-5 w-5 accent-[var(--c-accent)]" aria-label="Select task" /><div className="min-w-0 flex-1"><TaskCard t={t} onOpen={onOpen} done={statuses.find((s) => s.key === t.status)?.is_done} />{t.item_type && <div className="mt-1 pl-1"><ItemChip name={t.item_type} small /></div>}</div></div>)}</div>
                {items.length > lim && <button onClick={() => setLimit({ ...limit, [key]: lim + 100 })} className="mt-2 text-sm font-semibold text-brand">Show more ({items.length - lim})</button>}
              </>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
