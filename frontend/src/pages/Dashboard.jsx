import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CheckSquare, Clock, FolderKanban, MessageCircle, CheckCircle2, Activity, Zap, CalendarClock, StickyNote, Plus, Settings2, Image, ArrowUp, ArrowDown, Eye, EyeOff, RotateCcw, Trash2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, errMsg, fileUrl } from "../lib/api";
import { bgLayer } from "../lib/theme";
import { Avatar, Labels, PriorityBadge, dueInfo, rel, Empty, AccentButton, GhostButton } from "../components/common";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import BackgroundEditor from "./settings/BackgroundEditor";
import TaskCreate from "./tasks/TaskCreate";

const WIDGETS = { today: ["Today's Tasks", CheckSquare], deadlines: ["Upcoming Deadlines", Clock], projects: ["My Projects", FolderKanban], conversations: ["Recent Conversations", MessageCircle], completed: ["Recently Completed", CheckCircle2], activity: ["Team Activity", Activity], quick: ["Quick Actions", Zap], meetings: ["Upcoming Meetings", CalendarClock], reminders: ["Personal Reminders", StickyNote] };
const DEFAULT_ORDER = Object.keys(WIDGETS);

function Widget({ id, children, wide }) {
  const [title, Icon] = WIDGETS[id];
  return (
    <section className={`card p-5 animate-rise ${wide ? "md:col-span-2" : ""}`} data-testid={`widget-${id}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-lg tint-accent"><Icon size={14} /></span>{title}</h3>
      {children}
    </section>
  );
}

function TaskRow({ t, done }) {
  const d = dueInfo(t.deadline, done);
  return (
    <Link to={`/tasks?task=${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface2" data-testid={`dash-task-${t.id}`}>
      <span className="text-[10px] font-semibold text-sub w-9">{t.number_str}</span>
      <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${done ? "line-through text-sub" : ""}`}>{t.title}</span><Labels ids={t.label_ids} small max={2} /></span>
      {d && <span className={`text-[11px] ${d.cls}`}>{d.text}</span>}
    </Link>
  );
}

function Reminders({ kind, items, reload }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState("");
  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/reminders", { text, kind, at: at ? new Date(at).toISOString() : null }); setText(""); setAt(""); reload(); } catch (er) { toast.error(errMsg(er)); }
  };
  const list = items.filter((r) => r.kind === kind);
  return (
    <div>
      <ul className="space-y-1">
        {list.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface2">
            <input type="checkbox" checked={r.done} onChange={() => api.patch(`/reminders/${r.id}`, { done: !r.done }).then(reload)} className="h-4 w-4 accent-[var(--c-accent)]" data-testid={`reminder-check-${r.id}`} />
            <span className={`flex-1 text-sm ${r.done ? "line-through text-sub" : ""}`}>{r.text}</span>
            {r.at && <span className="text-[11px] text-sub">{format(new Date(r.at), "d MMM HH:mm")}</span>}
            <button onClick={() => api.delete(`/reminders/${r.id}`).then(reload)} className="opacity-0 group-hover:opacity-100 text-sub" aria-label="Delete"><Trash2 size={14} /></button>
          </li>
        ))}
        {!list.length && <li className="px-2 text-sm text-sub">Nothing here yet.</li>}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} required placeholder={kind === "meeting" ? "Add meeting…" : "Add reminder…"} className="h-10 min-w-[140px] flex-1 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid={`${kind}-input`} />
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="order-last h-10 w-full rounded-xl border bg-surface2 px-2 text-xs" aria-label="Date and time" />
        <button className="btn-accent h-10 w-10 flex items-center justify-center" aria-label="Add" data-testid={`${kind}-add-btn`}><Plus size={16} /></button>
      </form>
    </div>
  );
}

export default function Dashboard() {
  const { me, prefs, savePrefs, userMap, statuses } = useApp();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const navigate = useNavigate();
  const doneKeys = statuses.filter((s) => s.is_done).map((s) => s.key);
  const load = async () => {
    const [mine, projects, convs, act, rem] = await Promise.all([api.get("/tasks", { params: { view: "my" } }), api.get("/projects"), api.get("/conversations"), api.get("/activity"), api.get("/reminders")]);
    setData({ tasks: mine.data, projects: projects.data.filter((p) => p.member_ids.includes(me.user_id)), convs: convs.data.slice(0, 5), act: act.data, rem: rem.data });
  };
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line
  const dash = prefs.dashboard || {};
  const baseOrder = dash.order || DEFAULT_ORDER;
  const order = [...new Set([...baseOrder.filter((k) => WIDGETS[k]), ...DEFAULT_ORDER.filter((k) => !baseOrder.includes(k))])];
  const hidden = dash.hidden || [];
  const move = (k, dir) => { const o = [...order]; const i = o.indexOf(k); const j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; savePrefs({ dashboard: { ...dash, order: o } }); };
  const toggle = (k) => savePrefs({ dashboard: { ...dash, hidden: hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k] } });
  const layer = bgLayer(prefs.background, prefs.background?.file_id ? fileUrl(prefs.background.file_id) : null);
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";

  const render = (k) => {
    if (!data) return null;
    const open = data.tasks.filter((t) => !doneKeys.includes(t.status));
    const today = open.filter((t) => t.assignee_id === me.user_id && t.deadline && new Date(t.deadline).toDateString() === new Date().toDateString());
    const todayList = today.length ? today : open.filter((t) => t.assignee_id === me.user_id).slice(0, 5);
    switch (k) {
      case "today": return <Widget id={k}>{todayList.length ? todayList.map((t) => <TaskRow key={t.id} t={t} />) : <p className="text-sm text-sub">No tasks for today. Enjoy the calm.</p>}</Widget>;
      case "deadlines": { const up = open.filter((t) => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6); return <Widget id={k}>{up.length ? up.map((t) => <TaskRow key={t.id} t={t} />) : <p className="text-sm text-sub">No upcoming deadlines.</p>}</Widget>; }
      case "projects": return <Widget id={k}>{data.projects.length ? data.projects.map((p) => (
        <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-xl px-2 py-2 hover:bg-surface2"><div className="flex justify-between text-sm font-medium"><span className="truncate">{p.name}</span><span className="text-sub">{p.progress}%</span></div><div className="mt-1.5 h-1.5 rounded-full bg-surface2"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${p.progress}%` }} /></div></Link>)) : <p className="text-sm text-sub">You're not in any project yet.</p>}</Widget>;
      case "conversations": return <Widget id={k}>{data.convs.map((c) => { const other = c.type === "dm" ? userMap[c.member_ids.find((x) => x !== me.user_id)] : null; return (
        <Link key={c.id} to={`/messages/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface2">{other ? <Avatar user={other} size={30} /> : <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-soft-purple text-xs font-bold">#</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{other?.name || c.name}</span><span className="block truncate text-xs text-sub">{c.last_message_preview}</span></span>{c.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}</Link>); })}</Widget>;
      case "completed": { const done = data.tasks.filter((t) => doneKeys.includes(t.status)).slice(0, 5); return <Widget id={k}>{done.length ? done.map((t) => <TaskRow key={t.id} t={t} done />) : <p className="text-sm text-sub">Completed tasks will appear here.</p>}</Widget>; }
      case "activity": return <Widget id={k}><ul className="space-y-2">{data.act.slice(0, 7).map((a) => <li key={a.id} className="flex items-start gap-2.5 text-sm"><Avatar user={userMap[a.actor_id]} size={24} showStatus={false} /><span className="min-w-0 flex-1"><b className="font-semibold">{userMap[a.actor_id]?.name?.split(" ")[0]}</b> <span className="text-sub">{a.action}</span> <Link to={`/tasks?task=${a.task_id}`} className="font-medium hover:underline">{a.task_title}</Link><span className="block text-[11px] text-sub">{rel(a.created_at)}</span></span></li>)}{!data.act.length && <li className="text-sm text-sub">No activity yet.</li>}</ul></Widget>;
      case "quick": return <Widget id={k}><div className="grid grid-cols-2 gap-2">{[["New task", CheckSquare, () => setNewTask(true), "bg-soft-red"], ["Message", MessageCircle, () => navigate("/messages"), "bg-soft-blue"], ["New poll", BarChart3, () => navigate("/polls"), "bg-soft-purple"], ["Projects", FolderKanban, () => navigate("/projects"), "bg-soft-green"]].map(([t, I, fn, c]) => <button key={t} onClick={fn} className={`flex h-20 flex-col items-start justify-between rounded-2xl p-3 text-left text-sm font-semibold ${c} transition-transform hover:-translate-y-0.5`} data-testid={`quick-${t.replace(" ", "-").toLowerCase()}`}><I size={18} />{t}</button>)}</div></Widget>;
      case "meetings": return <Widget id={k}><Reminders kind="meeting" items={data.rem} reload={load} /></Widget>;
      case "reminders": return <Widget id={k}><Reminders kind="reminder" items={data.rem} reload={load} /></Widget>;
      default: return null;
    }
  };

  return (
    <div className="relative min-h-full" data-testid="dashboard-page">
      <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0" style={layer.base} /><div className="absolute inset-0" style={layer.overlay} /></div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="glass w-fit rounded-3xl px-5 py-4">
            <p className="text-sm text-sub" data-testid="dashboard-date">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="dashboard-greeting">{greet}, {me.name.split(" ")[0]}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <AccentButton onClick={() => setNewTask(true)} data-testid="dashboard-new-task-btn"><Plus size={16} />New Task</AccentButton>
            <GhostButton onClick={() => setBgOpen(true)} data-testid="dashboard-background-btn"><Image size={16} />Background</GhostButton>
            <GhostButton onClick={() => setEdit(!edit)} data-testid="dashboard-customize-btn"><Settings2 size={16} />{edit ? "Done" : "Customize"}</GhostButton>
          </div>
        </div>
        {edit && (
          <div className="card mb-6 p-4" data-testid="widget-customizer">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Arrange widgets</p><button onClick={() => savePrefs({ dashboard: { order: DEFAULT_ORDER, hidden: [] } })} className="flex items-center gap-1 text-xs font-semibold text-brand" data-testid="widget-reset-btn"><RotateCcw size={12} />Restore default</button></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {order.map((k, i) => (
                <div key={k} className="flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-sm">
                  <span className={`flex-1 ${hidden.includes(k) ? "text-sub line-through" : "font-medium"}`}>{WIDGETS[k][0]}</span>
                  <button onClick={() => move(k, -1)} disabled={!i} className="text-sub disabled:opacity-30" aria-label="Move up" data-testid={`widget-up-${k}`}><ArrowUp size={14} /></button>
                  <button onClick={() => move(k, 1)} disabled={i === order.length - 1} className="text-sub disabled:opacity-30" aria-label="Move down" data-testid={`widget-down-${k}`}><ArrowDown size={14} /></button>
                  <button onClick={() => toggle(k)} className="text-sub" aria-label="Toggle visibility" data-testid={`widget-toggle-${k}`}>{hidden.includes(k) ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!data ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="card h-48 animate-pulse" />)}</div> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{order.filter((k) => !hidden.includes(k)).map((k) => <div key={k} className="contents">{render(k)}</div>)}</div>
        )}
        {data && order.every((k) => hidden.includes(k)) && <Empty icon={Eye} title="All widgets hidden" text="Use Customize to show widgets again." />}
      </div>
      <Sheet open={bgOpen} onOpenChange={setBgOpen}>
        <SheetContent className="w-full overflow-y-auto bg-surface sm:max-w-md"><SheetHeader><SheetTitle>Dashboard background</SheetTitle></SheetHeader><BackgroundEditor /></SheetContent>
      </Sheet>
      <TaskCreate open={newTask} onOpenChange={setNewTask} onCreated={load} />
    </div>
  );
}

export { PriorityBadge };
