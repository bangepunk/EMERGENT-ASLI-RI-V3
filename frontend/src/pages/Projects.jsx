import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FolderKanban, Plus, ArrowLeft, MessageCircle, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../lib/api";
import { useApp } from "../context/AppContext";
import { PageHeader, AccentButton, AvatarStack, Labels, Spinner, Empty, fmtDate, Avatar } from "../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { LabelPicker, inp } from "./tasks/fields";
import { TaskWorkspace } from "./Tasks";

function ProjectDialog({ open, onOpenChange, project, onSaved }) {
  const { users } = useApp();
  const empty = { name: "", description: "", start_date: "", deadline: "", status: "active", label_ids: [], member_ids: [], department: "", location: "", create_group: true };
  const [f, setF] = useState(empty);
  useEffect(() => { if (open) setF(project ? { ...project } : empty); }, [open]); // eslint-disable-line
  const save = async () => {
    try { const { data } = project ? await api.patch(`/projects/${project.id}`, f) : await api.post("/projects", f); toast.success("Project saved"); onOpenChange(false); onSaved(data); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Project name" className={inp} data-testid="project-name-input" />
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" className={`${inp} h-20 py-2`} data-testid="project-description-input" />
        <div className="grid grid-cols-2 gap-2"><label className="text-xs text-sub">Start<input type="date" value={f.start_date || ""} onChange={(e) => setF({ ...f, start_date: e.target.value })} className={inp} /></label><label className="text-xs text-sub">Deadline<input type="date" value={f.deadline || ""} onChange={(e) => setF({ ...f, deadline: e.target.value })} className={inp} data-testid="project-deadline-input" /></label></div>
        <div className="grid grid-cols-2 gap-2"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={inp} data-testid="project-status-select">{["active", "planning", "on_hold", "completed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select><input value={f.department || ""} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Department" className={inp} /></div>
        <input value={f.location || ""} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location (optional)" className={inp} />
        <LabelPicker value={f.label_ids} onChange={(v) => setF({ ...f, label_ids: v })} testid="project-label-picker" />
        <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">{users.map((u) => { const on = f.member_ids.includes(u.user_id); return <button key={u.user_id} onClick={() => setF({ ...f, member_ids: on ? f.member_ids.filter((x) => x !== u.user_id) : [...f.member_ids, u.user_id] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--c-accent)] bg-soft-red" : ""}`} data-testid={`project-member-${u.user_id}`}>{u.name}</button>; })}</div>
        {!project && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.create_group} onChange={(e) => setF({ ...f, create_group: e.target.checked })} className="accent-[var(--c-accent)]" />Create a project chat group</label>}
        <AccentButton onClick={save} data-testid="project-save-btn">Save project</AccentButton>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ pid }) {
  const { userMap } = useApp();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const navigate = useNavigate();
  const load = () => api.get(`/projects/${pid}`).then((r) => setP(r.data)).catch(() => navigate("/projects"));
  useEffect(() => { load(); }, [pid]); // eslint-disable-line
  if (!p) return <Spinner />;
  return (
    <div data-testid="project-detail">
      <button onClick={() => navigate("/projects")} className="mb-4 flex items-center gap-1 text-sm font-semibold text-sub"><ArrowLeft size={15} />All projects</button>
      <div className="card mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="project-title">{p.name}</h1>
            <p className="mt-1 text-sm text-sub">{p.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-sub">
              <span className="rounded-full bg-soft-green px-2.5 py-1 font-semibold capitalize text-ink">{p.status.replace("_", " ")}</span>
              <span className="flex items-center gap-1"><Avatar user={userMap[p.owner_id]} size={18} showStatus={false} />Owner: {userMap[p.owner_id]?.name}</span>
              {p.deadline && <span className="flex items-center gap-1"><Calendar size={12} />{fmtDate(p.start_date, "d MMM")} – {fmtDate(p.deadline, "d MMM yyyy")}</span>}
              {p.location && <span className="flex items-center gap-1"><MapPin size={12} />{p.location}</span>}
              <Labels ids={p.label_ids} small max={5} />
            </div>
          </div>
          <div className="flex gap-2">{p.conversation_id && <button onClick={() => navigate(`/messages/${p.conversation_id}`)} className="btn-ghost flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold" data-testid="project-chat-btn"><MessageCircle size={15} />Chat</button>}<button onClick={() => setEdit(true)} className="btn-ghost h-10 border px-4 text-sm font-semibold" data-testid="project-edit-btn">Edit</button></div>
        </div>
        <div className="mt-5"><div className="flex justify-between text-sm"><span className="font-semibold">Progress</span><span data-testid="project-progress">{p.task_done}/{p.task_total} tasks · {p.progress}%</span></div><div className="mt-2 h-2.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${p.progress}%` }} /></div></div>
        <div className="mt-4"><AvatarStack ids={p.member_ids} max={8} /></div>
      </div>
      <TaskWorkspace projectId={pid} compactHeader />
      <ProjectDialog open={edit} onOpenChange={setEdit} project={p} onSaved={load} />
    </div>
  );
}

export default function Projects() {
  const { pid } = useParams();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (!pid) api.get("/projects").then((r) => setList(r.data)); }, [pid]);
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="projects-page">
      {pid ? <Detail pid={pid} /> : <>
        <PageHeader icon={FolderKanban} title="Projects" subtitle="Progress is calculated from real task data." actions={<AccentButton onClick={() => setOpen(true)} data-testid="new-project-btn"><Plus size={16} />New project</AccentButton>} />
        {!list ? <Spinner /> : !list.length ? <Empty icon={FolderKanban} title="No projects yet" /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="card p-5 text-left transition-transform hover:-translate-y-0.5" data-testid={`project-card-${p.id}`}>
                <div className="flex items-center justify-between"><span className="h-10 w-10 rounded-2xl" style={{ background: `linear-gradient(135deg, ${p.color || "#FF5364"}, var(--c-accent2))` }} /><span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-semibold capitalize">{p.status.replace("_", " ")}</span></div>
                <p className="mt-4 font-bold">{p.name}</p><p className="mt-1 line-clamp-2 text-sm text-sub">{p.description}</p>
                <div className="mt-3"><Labels ids={p.label_ids} small /></div>
                <div className="mt-4 flex justify-between text-xs text-sub"><span>{p.task_done}/{p.task_total} tasks</span><span className="font-semibold text-ink">{p.progress}%</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-brand" style={{ width: `${p.progress}%` }} /></div>
                <div className="mt-4"><AvatarStack ids={p.member_ids} /></div>
              </button>
            ))}
          </div>
        )}
        <ProjectDialog open={open} onOpenChange={setOpen} onSaved={(d) => navigate(`/projects/${d.id}`)} />
      </>}
    </div>
  );
}
