import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, ArrowUp, ArrowDown, Eye, EyeOff, Paperclip, Plus, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar, Labels, PRIORITY, dueInfo, fmtDate } from "../../components/common";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { TaskCard } from "./Board";

const BASE_COLS = [["number", "ID"], ["title", "Task name"], ["description", "Description"], ["status", "Status"], ["requestor_id", "Requestor"], ["assignee_id", "Assignee"], ["priority", "Priority"], ["label_ids", "IP / Brand"], ["start_date", "Start"], ["deadline", "Deadline"], ["completed_at", "Completed"], ["attachments", "Files"], ["project_id", "Project"], ["department", "Department"], ["updated_at", "Last updated"]];
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function Cell({ k, t, projects, patch }) {
  const { userMap, users, statuses, ws } = useApp();
  const sel = "h-8 w-full rounded-lg bg-transparent px-1 text-xs hover:bg-surface2 outline-none";
  const done = statuses.find((s) => s.key === t.status)?.is_done;
  switch (k) {
    case "number": return <span className="text-xs text-sub">{t.number_str}</span>;
    case "title": return <input defaultValue={t.title} key={t.updated_at} onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch(t, { title: e.target.value })} className="h-8 w-full min-w-[200px] rounded-lg bg-transparent px-1 text-sm font-medium outline-none hover:bg-surface2 focus:bg-surface2" data-testid={`list-title-${t.id}`} />;
    case "description": return <span className="line-clamp-1 max-w-[220px] text-xs text-sub">{strip(t.description) || "—"}</span>;
    case "status": return <select value={t.status} onChange={(e) => patch(t, { status: e.target.value })} className={sel} data-testid={`list-status-${t.id}`}>{statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>;
    case "requestor_id": return <span className="flex items-center gap-1.5 text-xs whitespace-nowrap"><Avatar user={userMap[t.requestor_id]} size={20} showStatus={false} />{userMap[t.requestor_id]?.name?.split(" ")[0]}</span>;
    case "assignee_id": return <select value={t.assignee_id || ""} onChange={(e) => patch(t, { assignee_id: e.target.value || null })} className={sel} data-testid={`list-assignee-${t.id}`}><option value="">—</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>;
    case "priority": return <select value={t.priority} onChange={(e) => patch(t, { priority: e.target.value })} className={`${sel} font-semibold`} data-testid={`list-priority-${t.id}`}>{Object.entries(PRIORITY).map(([p, v]) => <option key={p} value={p}>{v.name}</option>)}</select>;
    case "label_ids": return <Labels ids={t.label_ids} small max={2} />;
    case "start_date": return <span className="text-xs whitespace-nowrap">{t.start_date ? fmtDate(t.start_date, "d MMM") : "—"}</span>;
    case "deadline": { const d = dueInfo(t.deadline, done); return <input type="date" defaultValue={t.deadline ? fmtDate(t.deadline, "yyyy-MM-dd") : ""} key={t.deadline} onBlur={(e) => { const v = e.target.value ? new Date(`${e.target.value}T17:00`).toISOString() : null; if ((v || "").slice(0, 10) !== (t.deadline || "").slice(0, 10)) patch(t, { deadline: v }); }} className={`h-8 rounded-lg bg-transparent px-1 text-xs outline-none hover:bg-surface2 ${d?.cls || ""}`} />; }
    case "completed_at": return <span className="text-xs whitespace-nowrap text-emerald-600">{t.completed_at ? fmtDate(t.completed_at, "d MMM HH:mm") : "—"}</span>;
    case "attachments": return t.attachments?.length ? <span className="flex items-center gap-1 text-xs"><Paperclip size={12} />{t.attachments.length}</span> : <span className="text-xs text-sub">—</span>;
    case "project_id": return <span className="text-xs whitespace-nowrap">{projects[t.project_id]?.name || "—"}</span>;
    case "department": return <span className="text-xs whitespace-nowrap">{t.department || "—"}</span>;
    case "updated_at": return <span className="text-xs whitespace-nowrap text-sub">{fmtDate(t.updated_at, "d MMM HH:mm")}</span>;
    default: {
      const cf = (ws.task_fields || []).find((f) => f.key === k);
      return cf ? <input defaultValue={t.custom?.[k] || ""} onBlur={(e) => e.target.value !== (t.custom?.[k] || "") && patch(t, { custom: { ...(t.custom || {}), [k]: e.target.value } })} className="h-8 w-full min-w-[100px] rounded-lg bg-transparent px-1 text-xs outline-none hover:bg-surface2" /> : null;
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
        <button onClick={() => save({})} className="mt-2 w-full text-xs font-semibold text-brand">Reset columns</button>
      </PopoverContent></Popover>
  );
}

export default function ListView({ tasks, projects, onOpen, selected, setSelected, reload, groupBy }) {
  const { prefs, savePrefs, ws, statuses, userMap, labelMap } = useApp();
  const [collapsed, setCollapsed] = useState({});
  const [sort, setSort] = useState({ k: "number", dir: 1 });
  const [limit, setLimit] = useState({});
  const cfg = prefs.task_columns || {};
  const all = [...BASE_COLS, ...(ws.task_fields || []).map((f) => [f.key, f.name])];
  const cols = [...(cfg.order || []).map((k) => all.find((c) => c[0] === k)).filter(Boolean), ...all.filter((c) => !(cfg.order || []).includes(c[0]))];
  const visible = cols.filter((c) => !(cfg.hidden || []).includes(c[0]));
  const patch = async (t, body) => { try { await api.patch(`/tasks/${t.id}`, body); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const sorted = useMemo(() => [...tasks].sort((a, b) => { const x = a[sort.k] ?? ""; const y = b[sort.k] ?? ""; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; }), [tasks, sort]);
  const groups = useMemo(() => {
    if (groupBy === "status") return statuses.map((s) => [s.key, s.name, s.color, sorted.filter((t) => t.status === s.key)]);
    if (groupBy === "assignee") { const ids = [...new Set(sorted.map((t) => t.assignee_id || ""))]; return ids.map((id) => [id || "none", userMap[id]?.name || "Unassigned", "var(--s-blue)", sorted.filter((t) => (t.assignee_id || "") === id)]); }
    if (groupBy === "department") { const ds = [...new Set(sorted.map((t) => t.department || ""))]; return ds.map((d) => [d || "none", d || "No department", "var(--s-green)", sorted.filter((t) => (t.department || "") === d)]); }
    if (groupBy === "label") { const ls = [...new Set(sorted.flatMap((t) => (t.label_ids?.length ? t.label_ids : [""])))]; return ls.map((l) => [l || "none", labelMap[l]?.name || "No label", labelMap[l] ? `${labelMap[l].color}33` : "var(--s-yellow)", sorted.filter((t) => (l ? t.label_ids?.includes(l) : !t.label_ids?.length))]); }
    return [["all", "All tasks", "var(--s-purple)", sorted]];
  }, [groupBy, sorted, statuses, userMap, labelMap]);
  const toggleSel = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div data-testid="task-list-view">
      <div className="mb-3 flex justify-end gap-2"><ColumnMenu cols={cols} cfg={cfg} save={(c) => savePrefs({ task_columns: c })} /></div>
      <div className="space-y-5">
        {groups.map(([key, name, color, items]) => {
          const lim = limit[key] || 50;
          return (
            <section key={key} data-testid={`list-group-${key}`}>
              <button onClick={() => setCollapsed({ ...collapsed, [key]: !collapsed[key] })} className="mb-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left" style={{ background: color }}>
                {collapsed[key] ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<span className="font-bold text-sm text-[#20283B] dark:text-ink">{name}</span><span className="rounded-full bg-surface px-2 text-xs font-semibold">{items.length}</span>
              </button>
              {!collapsed[key] && <>
                <div className="hidden overflow-x-auto rounded-2xl border bg-surface md:block scroll-thin">
                  <table className="w-full text-left">
                    <thead><tr className="border-b text-[11px] uppercase tracking-wide text-sub">
                      <th className="w-10 p-2"><input type="checkbox" checked={items.length > 0 && items.every((t) => selected.includes(t.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...items.map((t) => t.id)])] : selected.filter((x) => !items.some((t) => t.id === x)))} className="accent-[var(--c-accent)]" aria-label="Select all" data-testid={`select-all-${key}`} /></th>
                      {visible.map(([k, l]) => <th key={k} className="whitespace-nowrap p-2 font-semibold"><button onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })} className="flex items-center gap-1" data-testid={`sort-${k}`}>{l}<ArrowUpDown size={10} className={sort.k === k ? "text-brand" : "opacity-40"} /></button></th>)}
                    </tr></thead>
                    <tbody>{items.slice(0, lim).map((t) => (
                      <tr key={t.id} className={`border-b last:border-0 hover:bg-surface2 ${selected.includes(t.id) ? "bg-soft-red" : ""}`} data-testid={`task-row-${t.id}`}>
                        <td className="p-2"><input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSel(t.id)} className="accent-[var(--c-accent)]" aria-label="Select task" data-testid={`select-task-${t.id}`} /></td>
                        {visible.map(([k]) => <td key={k} className="p-1.5" onDoubleClick={() => onOpen(t.id)}>{k === "number" ? <button onClick={() => onOpen(t.id)} className="text-xs font-semibold text-brand" data-testid={`open-task-${t.id}`}>{t.number_str}</button> : <Cell k={k} t={t} projects={projects} patch={patch} />}</td>)}
                      </tr>))}
                      {!items.length && <tr><td colSpan={visible.length + 1} className="p-4 text-sm text-sub">No tasks</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 md:hidden">{items.slice(0, lim).map((t) => <div key={t.id} className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSel(t.id)} className="mt-4 h-5 w-5 accent-[var(--c-accent)]" aria-label="Select task" /><div className="flex-1"><TaskCard t={t} onOpen={onOpen} done={statuses.find((s) => s.key === t.status)?.is_done} /></div></div>)}</div>
                {items.length > lim && <button onClick={() => setLimit({ ...limit, [key]: lim + 50 })} className="mt-2 text-sm font-semibold text-brand">Show more ({items.length - lim})</button>}
              </>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
