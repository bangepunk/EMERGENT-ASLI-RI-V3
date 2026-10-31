import { useState } from "react";
import { MessageSquare, Paperclip, ListChecks, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar, Labels, PriorityBadge, dueInfo } from "../../components/common";

export function TaskCard({ t, onOpen, done, draggable, onDragStart }) {
  const { userMap, labelMap } = useApp();
  const d = dueInfo(t.deadline, done);
  const color = t.card_color || labelMap[t.label_ids?.[0]]?.color;
  const style = t.card_style || "accent";
  const sub = t.subtasks?.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : null;
  return (
    <button draggable={draggable} onDragStart={onDragStart} onClick={() => onOpen(t.id)} data-testid={`task-card-${t.id}`}
      className="relative w-full overflow-hidden rounded-2xl border bg-surface p-3.5 text-left shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
      style={style === "tint" && color ? { background: `color-mix(in srgb, ${color} 10%, var(--c-surface))` } : undefined}>
      {style === "accent" && color && <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />}
      <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold text-sub">{t.number_str}</span><PriorityBadge value={t.priority} /></div>
      <p className={`mt-1.5 text-sm font-semibold leading-snug ${done ? "line-through text-sub" : ""}`}>{t.title}</p>
      {t.label_ids?.length > 0 && <div className="mt-2"><Labels ids={t.label_ids} small /></div>}
      {t.checkpoints?.length > 0 && <div className="mt-2.5 flex items-center gap-2" data-testid={`card-progress-${t.id}`}><span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-surface2"><span className={`block h-full rounded-full ${t.progress === 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${t.progress || 0}%` }} /></span><span className="text-[11px] font-bold">{t.progress || 0}%</span></div>}
      <div className="mt-3 flex items-center gap-2.5 text-[11px] text-sub">
        {t.assignee_id ? <Avatar user={userMap[t.assignee_id]} size={22} showStatus={false} /> : <span className="h-[22px] w-[22px] rounded-full border border-dashed" />}
        {d && <span className={d.cls}>{d.text}</span>}
        <span className="ml-auto flex items-center gap-2">
          {t.open_issues > 0 && <span className="flex items-center gap-0.5 font-bold text-rose-500" data-testid={`card-issue-indicator-${t.id}`}><AlertTriangle size={11} />{t.open_issues}</span>}
          {t.comment_count > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={11} />{t.comment_count}</span>}
          {t.attachments?.length > 0 && <span className="flex items-center gap-0.5" data-testid="card-attachment-indicator"><Paperclip size={11} />{t.attachments.length}</span>}
          {sub && <span className="flex items-center gap-0.5"><ListChecks size={11} />{sub}</span>}
        </span>
      </div>
    </button>
  );
}

export default function Board({ tasks, onOpen, onNew, reload }) {
  const { statuses } = useApp();
  const [over, setOver] = useState(null);
  const dark = document.documentElement.classList.contains("dark");
  const drop = async (e, key) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("task");
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === key) return;
    try { await api.patch(`/tasks/${id}`, { status: key }); reload(); toast.success(`Moved to ${statuses.find((s) => s.key === key)?.name}`); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": statuses.length }} data-testid="task-board">
      {statuses.map((s) => {
        const col = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, s.key)}
            className={`flex min-w-0 flex-col rounded-3xl p-2.5 transition-shadow ${over === s.key ? "ring-2 ring-[var(--c-accent)]" : ""}`}
            style={{ background: dark ? `${s.color}1A` : s.color }} data-testid={`kanban-column-${s.key}`}>
            <div className="mb-3 flex items-center gap-2 px-1"><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-1.5 text-xs font-bold">{col.length}</span><span className="flex-1 font-bold">{s.name}</span>
              <button onClick={() => onNew(s.key)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface" aria-label={`Add task to ${s.name}`} data-testid={`kanban-add-${s.key}`}><Plus size={16} /></button></div>
            <div className="flex min-h-[80px] flex-1 flex-col gap-2.5">
              {col.map((t) => <TaskCard key={t.id} t={t} onOpen={onOpen} done={s.is_done} draggable onDragStart={(e) => e.dataTransfer.setData("task", t.id)} />)}
              <button onClick={() => onNew(s.key)} className="mt-1 flex h-11 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[color:var(--c-border)] text-sm font-semibold text-sub hover:bg-surface">+ Add task</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
