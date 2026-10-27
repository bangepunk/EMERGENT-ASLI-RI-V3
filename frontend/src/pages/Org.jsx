import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Network, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Download, Upload, Search, GripVertical, Crown } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, errMsg, downloadFrom } from "../lib/api";
import { Avatar, PageHeader, Spinner, GhostButton } from "../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

function UnitDialog({ state, setState, units, levels, onDone }) {
  const { users } = useApp();
  const [f, setF] = useState({});
  useEffect(() => { if (state) setF(state.unit ? { ...state.unit } : { name: "", level: levels[2] || "Department", parent_id: state.parent_id, head_id: "" }); }, [state]); // eslint-disable-line
  if (!state) return null;
  const save = async () => {
    try {
      if (state.unit) await api.patch(`/org/units/${state.unit.id}`, { name: f.name, level: f.level, head_id: f.head_id || null, parent_id: f.parent_id || null });
      else await api.post("/org/units", { ...f, head_id: f.head_id || null });
      toast.success("Saved"); setState(null); onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const inp = "h-10 w-full rounded-xl border bg-surface2 px-3 text-sm";
  return (
    <Dialog open onOpenChange={() => setState(null)}>
      <DialogContent className="bg-surface rounded-3xl max-w-md">
        <DialogHeader><DialogTitle>{state.unit ? "Edit unit" : "Add unit"}</DialogTitle></DialogHeader>
        <input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Unit name" className={inp} data-testid="unit-name-input" />
        <select value={f.level || ""} onChange={(e) => setF({ ...f, level: e.target.value })} className={inp} data-testid="unit-level-select">{levels.map((l) => <option key={l}>{l}</option>)}</select>
        <select value={f.parent_id || ""} onChange={(e) => setF({ ...f, parent_id: e.target.value })} className={inp} data-testid="unit-parent-select"><option value="">No parent (top level)</option>{units.filter((u) => u.id !== state.unit?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={f.head_id || ""} onChange={(e) => setF({ ...f, head_id: e.target.value })} className={inp} data-testid="unit-head-select"><option value="">No head</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>
        <button onClick={save} className="btn-accent h-11 font-semibold" data-testid="unit-save-btn">Save</button>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ unit, setUnit, units, counts, onDone }) {
  const [to, setTo] = useState("");
  if (!unit) return null;
  const nonEmpty = counts.kids || counts.members;
  const del = async () => {
    try { await api.delete(`/org/units/${unit.id}`, { params: nonEmpty ? { reassign_to: to } : {} }); toast.success("Unit deleted"); setUnit(null); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={() => setUnit(null)}>
      <DialogContent className="bg-surface rounded-3xl max-w-md">
        <DialogHeader><DialogTitle>Delete “{unit.name}”?</DialogTitle></DialogHeader>
        {nonEmpty ? <>
          <p className="text-sm text-sub">This unit has {counts.kids} sub-units and {counts.members} employees. Choose where to move them — no employee will be left without a unit.</p>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl border bg-surface2 px-3 text-sm" data-testid="reassign-select"><option value="">Select a unit…</option>{units.filter((u) => u.id !== unit.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </> : <p className="text-sm text-sub">This unit is empty and can be deleted safely.</p>}
        <button onClick={del} disabled={nonEmpty && !to} className="h-11 rounded-full bg-rose-500 font-semibold text-white disabled:opacity-40" data-testid="confirm-delete-unit-btn">Delete unit</button>
      </DialogContent>
    </Dialog>
  );
}

function Node({ unit, tree, members, depth, ctx }) {
  const [open, setOpen] = useState(depth < 2);
  const { userMap } = useApp();
  const navigate = useNavigate();
  const kids = tree[unit.id] || [];
  const mem = members[unit.id] || [];
  const total = ctx.totals[unit.id];
  const head = userMap[unit.head_id];
  const hit = ctx.q && mem.some((u) => u.name.toLowerCase().includes(ctx.q));
  useEffect(() => { if (ctx.q && ctx.hasHit(unit.id)) setOpen(true); }, [ctx.q]); // eslint-disable-line
  const drop = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const d = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
    try {
      if (d.unit && d.unit !== unit.id) await api.patch(`/org/units/${d.unit}`, { parent_id: unit.id });
      else if (d.user) await api.patch(`/org/members/${d.user}`, { org_unit_id: unit.id });
      else return;
      toast.success("Moved"); ctx.reload();
    } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className={depth ? "ml-4 sm:ml-7 border-l pl-3 sm:pl-5" : ""}>
      <div draggable={ctx.admin} onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ unit: unit.id }))} onDragOver={(e) => ctx.canMove && e.preventDefault()} onDrop={drop}
        className={`group my-2 flex items-center gap-2 rounded-2xl border bg-surface p-3 shadow-sm ${hit ? "ring-2 ring-[var(--c-accent)]" : ""}`} data-testid={`org-unit-${unit.id}`}>
        {ctx.admin && <GripVertical size={14} className="hidden cursor-grab text-sub sm:block" />}
        <button onClick={() => setOpen(!open)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface2" aria-label="Expand" data-testid={`org-toggle-${unit.id}`}>{kids.length || mem.length ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-border)]" />}</button>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{unit.name}</p><p className="text-[11px] text-sub">{unit.level} · {total} {total === 1 ? "person" : "people"}</p></div>
        {head && <span className="hidden items-center gap-1.5 rounded-full bg-soft-yellow px-2 py-1 text-[11px] font-semibold sm:flex"><Crown size={11} />{head.name}</span>}
        {ctx.admin && <span className="flex gap-0.5 md:opacity-0 group-hover:opacity-100">
          <button onClick={() => ctx.add(unit.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-surface2" aria-label="Add sub-unit" data-testid={`org-add-${unit.id}`}><Plus size={15} /></button>
          <button onClick={() => ctx.edit(unit)} className="flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-surface2" aria-label="Edit" data-testid={`org-edit-${unit.id}`}><Pencil size={14} /></button>
          <button onClick={() => ctx.del(unit)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-surface2" aria-label="Delete" data-testid={`org-delete-${unit.id}`}><Trash2 size={14} /></button>
        </span>}
      </div>
      {open && (<>
        {mem.length > 0 && <div className="ml-4 sm:ml-7 flex flex-wrap gap-2 border-l pl-3 sm:pl-5 py-1">{mem.map((u) => (
          <button key={u.user_id} draggable={ctx.canMove} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", JSON.stringify({ user: u.user_id })); }} onClick={() => navigate(`/people/${u.user_id}`)}
            className={`flex items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3 text-left ${ctx.q && u.name.toLowerCase().includes(ctx.q) ? "ring-2 ring-[var(--c-accent)]" : ""}`} data-testid={`org-member-${u.user_id}`}>
            <Avatar user={u} size={28} /><span><span className="block text-xs font-semibold">{u.name}</span><span className="block text-[10px] text-sub">{u.job_title}{userMap[u.manager_id] ? ` · ↑ ${userMap[u.manager_id].name.split(" ")[0]}` : ""}</span></span>
          </button>))}</div>}
        {kids.map((k) => <Node key={k.id} unit={k} tree={tree} members={members} depth={depth + 1} ctx={ctx} />)}
      </>)}
    </div>
  );
}

function Table({ units, reload, canMove }) {
  const { users } = useApp();
  const update = async (uid, patch) => { try { await api.patch(`/org/members/${uid}`, patch); toast.success("Updated"); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="card overflow-x-auto" data-testid="org-management-table">
      <table className="w-full min-w-[720px] text-sm">
        <thead><tr className="border-b text-left text-xs text-sub"><th className="p-3">Employee</th><th className="p-3">Job title</th><th className="p-3">Unit</th><th className="p-3">Reporting manager</th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.user_id} className="border-b last:border-0">
            <td className="p-3"><span className="flex items-center gap-2"><Avatar user={u} size={28} showStatus={false} />{u.name}</span></td>
            <td className="p-3">{canMove ? <input defaultValue={u.job_title} onBlur={(e) => e.target.value !== u.job_title && update(u.user_id, { job_title: e.target.value })} className="h-9 w-full rounded-lg border bg-surface2 px-2" /> : u.job_title}</td>
            <td className="p-3"><select disabled={!canMove} value={u.org_unit_id || ""} onChange={(e) => update(u.user_id, { org_unit_id: e.target.value || null })} className="h-9 w-full rounded-lg border bg-surface2 px-2" data-testid={`table-unit-${u.user_id}`}><option value="">Unassigned</option>{units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
            <td className="p-3"><select disabled={!canMove} value={u.manager_id || ""} onChange={(e) => update(u.user_id, { manager_id: e.target.value || null })} className="h-9 w-full rounded-lg border bg-surface2 px-2" data-testid={`table-manager-${u.user_id}`}><option value="">None</option>{users.filter((x) => x.user_id !== u.user_id).map((x) => <option key={x.user_id} value={x.user_id}>{x.name}</option>)}</select></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export default function Org() {
  const { users, ws, isAdmin, isManager, reloadUsers } = useApp();
  const [units, setUnits] = useState(null);
  const [view, setView] = useState("chart");
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState(null);
  const [delUnit, setDelUnit] = useState(null);
  const fileRef = useRef(null);
  const load = () => api.get("/org/units").then((r) => setUnits(r.data));
  useEffect(() => { load(); }, []);
  const reload = () => { load(); reloadUsers(); };
  const { tree, members, totals, roots } = useMemo(() => {
    const tr = {}, mem = {}, tot = {};
    (units || []).forEach((u) => { (tr[u.parent_id || "root"] = tr[u.parent_id || "root"] || []).push(u); });
    users.forEach((u) => { if (u.org_unit_id) (mem[u.org_unit_id] = mem[u.org_unit_id] || []).push(u); });
    const count = (id) => (tot[id] = (mem[id] || []).length + (tr[id] || []).reduce((a, k) => a + count(k.id), 0));
    (tr.root || []).forEach((r) => count(r.id));
    return { tree: tr, members: mem, totals: tot, roots: tr.root || [] };
  }, [units, users]);
  if (!units) return <Spinner />;
  const ql = q.toLowerCase();
  const hasHit = (id) => (members[id] || []).some((u) => u.name.toLowerCase().includes(ql)) || (tree[id] || []).some((k) => hasHit(k.id));
  const ctx = { admin: isAdmin, canMove: isManager, totals, q: ql, hasHit, reload, add: (pid) => setDlg({ parent_id: pid }), edit: (u) => setDlg({ unit: u }), del: setDelUnit };
  const unassigned = users.filter((u) => !u.org_unit_id);
  const importCsv = async (e) => {
    const fd = new FormData(); fd.append("file", e.target.files[0]); e.target.value = "";
    try { const { data } = await api.post("/org/import", fd); toast.success(`Imported: ${data.created} new, ${data.updated} updated`); reload(); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="org-page">
      <PageHeader icon={Network} title="Organization" subtitle="Your company structure. Drag units or people to reorganize." actions={<>
        {isManager && <GhostButton onClick={() => downloadFrom("/org/export", {}, "organization.csv").then(() => toast.success("Exported"))} data-testid="org-export-btn"><Download size={15} />Export</GhostButton>}
        {isAdmin && <><GhostButton onClick={() => fileRef.current.click()} data-testid="org-import-btn"><Upload size={15} />Import CSV</GhostButton><input ref={fileRef} type="file" accept=".csv" hidden onChange={importCsv} />
          <button onClick={() => setDlg({ parent_id: roots[0]?.id })} className="btn-accent flex h-10 items-center gap-2 px-4 text-sm font-semibold" data-testid="org-add-unit-btn"><Plus size={16} />Add unit</button></>}
      </>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border bg-surface p-1 text-sm font-medium">{["chart", "table"].map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 capitalize ${view === v ? "bg-ink text-[var(--c-surface)]" : "text-sub"}`} data-testid={`org-view-${v}`}>{v === "chart" ? "Chart" : "Management table"}</button>)}</div>
        {view === "chart" && <div className="flex h-10 flex-1 min-w-[200px] items-center gap-2 rounded-full border bg-surface px-4"><Search size={15} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an employee in the chart" className="flex-1 bg-transparent text-sm outline-none" data-testid="org-search-input" /></div>}
        {isAdmin && <p className="w-full text-xs text-sub">Levels: {(ws.org_levels || []).join(" → ")} → Employee (edit levels in Settings → Workspace)</p>}
      </div>
      {view === "chart" ? <>
        {roots.map((r) => <Node key={r.id} unit={r} tree={tree} members={members} depth={0} ctx={ctx} />)}
        {unassigned.length > 0 && <div className="mt-6 rounded-2xl border border-dashed p-4"><p className="mb-2 text-sm font-semibold">Unassigned ({unassigned.length})</p><div className="flex flex-wrap gap-2">{unassigned.map((u) => <span key={u.user_id} draggable={isManager} onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ user: u.user_id }))} className="flex items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3 text-xs"><Avatar user={u} size={24} showStatus={false} />{u.name}</span>)}</div></div>}
      </> : <Table units={units} reload={reload} canMove={isManager} />}
      <UnitDialog state={dlg} setState={setDlg} units={units} levels={ws.org_levels || ["Company", "Division", "Department", "Team"]} onDone={reload} />
      <DeleteDialog unit={delUnit} setUnit={setDelUnit} units={units} counts={{ kids: (tree[delUnit?.id] || []).length, members: (members[delUnit?.id] || []).length }} onDone={reload} />
    </div>
  );
}
