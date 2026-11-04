import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, Plus, Search, Download, KanbanSquare, List, GanttChart, CalendarDays, SlidersHorizontal, X, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, downloadFrom } from "../lib/api";
import { useApp } from "../context/AppContext";
import { PageHeader, AccentButton, GhostButton, Spinner, PRIORITY } from "../components/common";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import Board from "./tasks/Board";
import ListView from "./tasks/ListView";
import { Timeline, Calendar } from "./tasks/TimelineCalendar";
import TaskCreate from "./tasks/TaskCreate";
import TaskDetail from "./tasks/TaskDetail";
import BoardDialog from "./tasks/BoardDialog";

export const SAVED_VIEWS = [["all", "All Tasks"], ["active", "Active"], ["my", "My Tasks"], ["requested", "Requested by Me"], ["assigned", "Assigned to Me"], ["today", "Due Today"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["issues", "Ada Kendala"], ["completed", "Completed"], ["archived", "Archived"]];
const VIEWS = [["board", "Board", KanbanSquare], ["list", "List", List], ["timeline", "Timeline", GanttChart], ["calendar", "Calendar", CalendarDays]];
const sel = "h-10 rounded-full border bg-surface px-3 text-sm";

export function TaskWorkspace({ projectId, compactHeader }) {
  const { users, labels, statuses, subscribe, prefs, savePrefs, isManager } = useApp();
  const [params, setParams] = useSearchParams();
  const [boards, setBoards] = useState(null);
  const [boardId, setBoardId] = useState(params.get("board") || "");
  const [editBoard, setEditBoard] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [projects, setProjects] = useState({});
  const [saved, setSaved] = useState(params.get("view") || "all");
  const [view, setView] = useState(params.get("kanban") ? "board" : prefs.task_view || "board");
  const [f, setF] = useState({ q: "", label: params.get("label") || "", assignee_id: params.get("assignee") || "", priority: "", department: "" });
  const [groupBy, setGroupBy] = useState("none");
  const [selected, setSelected] = useState([]);
  const [create, setCreate] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const openId = params.get("task");
  const query = useCallback(() => ({ view: saved, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), ...(projectId ? { project_id: projectId } : {}), ...(boardId ? { board_id: boardId } : {}) }), [saved, f, projectId, boardId]);
  const loadBoards = useCallback(() => api.get("/boards").then((r) => setBoards(r.data)).catch(() => setBoards([])), []);
  useEffect(() => { loadBoards(); }, [loadBoards]);
  useEffect(() => subscribe((e) => e.type === "tasks:changed" && loadBoards()), [subscribe, loadBoards]);
  const pickBoard = (id) => { setBoardId(id); setSelected([]); if (id) params.set("board", id); else params.delete("board"); setParams(params); };
  const newTask = (extra = {}) => (boards?.length ? setCreate({ board_id: boardId, ...extra }) : toast.error("Kamu belum diundang ke board mana pun"));
  const load = useCallback(() => api.get("/tasks", { params: query() }).then((r) => setTasks(r.data)).catch(() => setTasks([])), [query]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.get("/projects").then((r) => setProjects(Object.fromEntries(r.data.map((p) => [p.id, p])))); }, []);
  useEffect(() => subscribe((e) => e.type === "tasks:changed" && load()), [subscribe, load]);
  const open = (id) => { params.set("task", id); setParams(params); };
  const close = () => { params.delete("task"); setParams(params); };
  const switchView = (v) => { setView(v); savePrefs({ task_view: v }).catch(() => {}); };
  const exp = async (format, ids) => {
    try {
      const res = await downloadFrom("/tasks/export", { ...query(), format, ...(ids ? { ids: ids.join(",") } : {}) }, `circle-tasks.${format}`);
      toast.success(`Exported ${res.headers["x-record-count"] || ""} tasks`.replace("  ", " "));
    } catch (e) { toast.error(errMsg(e, "Export failed")); }
  };
  const bulk = async (patch) => { try { const { data } = await api.post("/tasks/bulk", { ids: selected, patch }); toast.success(`Updated ${data.updated} tasks`); setSelected([]); load(); } catch (e) { toast.error(errMsg(e)); } };
  const depts = [...new Set(users.map((u) => u.department).filter(Boolean))];
  const active = Object.values(f).filter(Boolean).length;
  return (
    <div>
      {!compactHeader && <PageHeader icon={CheckSquare} title="Tasks" subtitle="One shared task database across board, list, timeline and calendar." actions={<>
        <DropdownMenu><DropdownMenuTrigger asChild><GhostButton data-testid="export-menu-btn"><Download size={15} />Export</GhostButton></DropdownMenuTrigger>
          <DropdownMenuContent className="bg-surface" align="end"><DropdownMenuItem onClick={() => exp("csv")} data-testid="export-csv-btn">Export CSV (current filters)</DropdownMenuItem>{selected.length > 0 && <DropdownMenuItem onClick={() => exp("csv", selected)} data-testid="export-selected-btn">Export selected ({selected.length})</DropdownMenuItem>}<DropdownMenuItem onClick={() => exp("json")} data-testid="export-json-btn">Export JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <AccentButton onClick={() => newTask()} data-testid="new-task-btn"><Plus size={16} />New Task</AccentButton></>} />}
      {compactHeader && <div className="mb-4 flex justify-end gap-2"><GhostButton onClick={() => exp("csv")} data-testid="export-csv-btn"><Download size={15} />CSV</GhostButton><AccentButton onClick={() => newTask()} data-testid="new-task-btn"><Plus size={16} />New Task</AccentButton></div>}
      {!projectId && boards && (
        <div className="mb-4" data-testid="board-switcher">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => pickBoard("")} className={`h-10 rounded-2xl px-4 text-sm font-semibold ${!boardId ? "bg-ink text-[var(--c-surface)]" : "border bg-surface text-sub"}`} data-testid="board-all">Semua board</button>
            {boards.map((b) => (
              <div key={b.id} className={`flex h-10 items-center rounded-2xl border pl-3 ${boardId === b.id ? "border-transparent text-[#20283B]" : "bg-surface"}`} style={boardId === b.id ? { background: b.color } : undefined}>
                <button onClick={() => pickBoard(b.id)} className="flex items-center gap-2 pr-3 text-sm font-semibold" data-testid={`board-tab-${b.id}`}>{boardId !== b.id && <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />}{b.name}<span className="rounded-full bg-surface/70 px-1.5 text-xs">{b.task_count}</span></button>
                {isManager && <button onClick={() => setEditBoard(b)} className="flex h-full items-center border-l border-black/10 px-2 opacity-70 hover:opacity-100" aria-label={`Atur ${b.name}`} data-testid={`board-edit-${b.id}`}><Settings2 size={14} /></button>}
              </div>))}
            {isManager && <button onClick={() => setEditBoard({})} className="flex h-10 items-center gap-1 rounded-2xl border border-dashed px-3 text-sm font-semibold text-brand" data-testid="board-new-btn"><Plus size={14} />Board</button>}
          </div>
          {!boards.length && <p className="mt-3 rounded-2xl bg-soft-yellow p-4 text-sm" data-testid="no-boards-msg">Kamu belum diundang ke board mana pun. Minta admin atau manager divisimu untuk mengundangmu.</p>}
        </div>
      )}
      {editBoard && <BoardDialog board={editBoard} onClose={() => setEditBoard(null)} onSaved={(b) => { loadBoards(); load(); if (!b && editBoard.id === boardId) pickBoard(""); }} />}
      <select value={saved} onChange={(e) => { setSaved(e.target.value); setSelected([]); }} className={`${sel} mb-3 w-full md:hidden`} data-testid="saved-view-select">{SAVED_VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <div className="mb-4 hidden flex-wrap gap-1.5 md:flex" data-testid="saved-views">
        {SAVED_VIEWS.map(([k, l]) => <button key={k} onClick={() => { setSaved(k); setSelected([]); }} className={`h-9 whitespace-nowrap rounded-full px-3.5 text-sm font-medium ${saved === k ? "bg-ink text-[var(--c-surface)]" : "border bg-surface text-sub"}`} data-testid={`saved-view-${k}`}>{l}</button>)}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border bg-surface p-1" data-testid="view-switcher">{VIEWS.map(([k, l, I]) => <button key={k} onClick={() => switchView(k)} className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${view === k ? "bg-brand text-white" : "text-sub"}`} data-testid={`view-${k}`}><I size={14} /><span className="hidden sm:inline">{l}</span></button>)}</div>
        <div className="flex h-10 min-w-[180px] flex-1 items-center gap-2 rounded-full border bg-surface px-4"><Search size={15} className="text-sub" /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search tasks or T-ID" className="flex-1 bg-transparent text-sm outline-none" data-testid="task-search-input" /></div>
        <button onClick={() => setShowFilters(!showFilters)} className="btn-ghost flex h-10 items-center gap-1.5 border bg-surface px-3 text-sm font-medium md:hidden" data-testid="mobile-filters-btn"><SlidersHorizontal size={15} />Filters{active > 0 && ` (${active})`}</button>
        <div className={`${showFilters ? "flex" : "hidden"} w-full flex-wrap gap-2 md:flex md:w-auto`}>
          <select value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={sel} data-testid="filter-label"><option value="">All brands</option>{labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={f.assignee_id} onChange={(e) => setF({ ...f, assignee_id: e.target.value })} className={sel} data-testid="filter-assignee"><option value="">Any assignee</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={sel} data-testid="filter-priority"><option value="">Any priority</option>{Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select>
          <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} className={sel} data-testid="filter-task-department"><option value="">Any department</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          {view === "list" && <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={sel} data-testid="group-by-select"><option value="status">Group: Status</option><option value="assignee">Group: Assignee</option><option value="department">Group: Department</option><option value="label">Group: IP / Brand</option><option value="none">No grouping</option></select>}
          {active > 0 && <button onClick={() => setF({ q: "", label: "", assignee_id: "", priority: "", department: "" })} className="flex items-center gap-1 text-sm font-semibold text-brand" data-testid="clear-filters-btn"><X size={14} />Clear</button>}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="sticky top-16 md:top-2 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-surface p-2.5 shadow-lg" data-testid="bulk-actions-bar">
          <span className="px-2 text-sm font-semibold">{selected.length} selected</span>
          <select onChange={(e) => e.target.value && bulk({ status: e.target.value })} value="" className="h-9 rounded-full border bg-surface2 px-3 text-sm" data-testid="bulk-status"><option value="">Set status…</option>{statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
          <select onChange={(e) => e.target.value && bulk({ priority: e.target.value })} value="" className="h-9 rounded-full border bg-surface2 px-3 text-sm" data-testid="bulk-priority"><option value="">Set priority…</option>{Object.entries(PRIORITY).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select>
          <select onChange={(e) => e.target.value && bulk({ assignee_id: e.target.value })} value="" className="h-9 rounded-full border bg-surface2 px-3 text-sm" data-testid="bulk-assignee"><option value="">Assign to…</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>
          <button onClick={() => bulk({ archived: saved !== "archived" })} className="h-9 rounded-full border px-3 text-sm font-medium" data-testid="bulk-archive">{saved === "archived" ? "Unarchive" : "Archive"}</button>
          <button onClick={() => exp("csv", selected)} className="h-9 rounded-full border px-3 text-sm font-medium" data-testid="bulk-export">Export</button>
          <button onClick={() => setSelected([])} className="ml-auto text-sub" aria-label="Clear selection"><X size={16} /></button>
        </div>
      )}
      {!tasks || !boards ? <Spinner /> : !boards.length && !projectId ? null : view === "board" ? <Board tasks={tasks} onOpen={open} onNew={(status) => newTask({ status })} reload={load} />
        : view === "list" ? <ListView tasks={tasks} projects={projects} onOpen={open} selected={selected} setSelected={setSelected} reload={load} groupBy={groupBy} boardId={boardId} />
        : view === "timeline" ? <Timeline tasks={tasks} onOpen={open} /> : <Calendar tasks={tasks} onOpen={open} />}
      <TaskCreate open={!!create} onOpenChange={(v) => !v && setCreate(null)} defaults={{ ...create, project_id: projectId }} onCreated={load} />
      <TaskDetail id={openId} onClose={close} onChanged={load} />
    </div>
  );
}

export default function Tasks() {
  return <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="tasks-page"><TaskWorkspace /></div>;
}
