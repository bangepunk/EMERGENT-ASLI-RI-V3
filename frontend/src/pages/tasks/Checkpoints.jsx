import { useState } from "react";
import { MessageSquare, AlertTriangle, X, Plus, CheckCircle2, RotateCcw, Flag } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar, rel } from "../../components/common";
import { UserSelect } from "./fields";

export function ProgressBar({ value, small }) {
  const v = value ?? 0;
  const color = v === 100 ? "bg-emerald-500" : v >= 50 ? "bg-sky-500" : "bg-amber-500";
  return <span className={`block w-full overflow-hidden rounded-full bg-surface2 ${small ? "h-1.5" : "h-2.5"}`}><span className={`block h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${v}%` }} /></span>;
}

export function CommentItem({ c, t, reload, showCheckpoint }) {
  const { userMap } = useApp();
  const cp = showCheckpoint && c.checkpoint_id && (t.checkpoints || []).find((x) => x.id === c.checkpoint_id);
  const issue = c.kind === "issue";
  const toggle = () => api.patch(`/tasks/${t.id}/comments/${c.id}`, { resolved: !c.resolved }).then(reload).catch((e) => toast.error(errMsg(e)));
  return (
    <div className="mb-3 flex gap-2.5" data-testid={`comment-${c.id}`}>
      <Avatar user={userMap[c.author_id]} size={28} showStatus={false} />
      <div className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${issue && !c.resolved ? "border border-rose-300 bg-rose-50 dark:bg-rose-500/10" : "bg-surface2"}`}>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs"><b>{userMap[c.author_id]?.name}</b><span className="text-sub">{rel(c.created_at)}</span>
          {cp && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-sub">↳ {cp.title}</span>}
          {issue && <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.resolved ? "bg-emerald-100 text-emerald-700" : "bg-rose-500 text-white"}`} data-testid={`comment-issue-badge-${c.id}`}><AlertTriangle size={10} />{c.resolved ? "Kendala selesai" : "Kendala"}</span>}
        </p>
        <p className="whitespace-pre-wrap text-sm">{c.text}</p>
        {issue && <button onClick={toggle} className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand" data-testid={`comment-resolve-${c.id}`}>{c.resolved ? <><RotateCcw size={11} />Buka lagi</> : <><CheckCircle2 size={11} />Tandai selesai</>}</button>}
      </div>
    </div>
  );
}

function Thread({ t, cp, reload }) {
  const [text, setText] = useState("");
  const [issue, setIssue] = useState(false);
  const list = t.comments.filter((c) => c.checkpoint_id === cp.id);
  const send = async () => {
    try { await api.post(`/tasks/${t.id}/comments`, { text, checkpoint_id: cp.id, kind: issue ? "issue" : "update" }); setText(""); setIssue(false); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="border-t bg-surface2/40 p-3" data-testid={`checkpoint-thread-${cp.id}`}>
      {list.map((c) => <CommentItem key={c.id} c={c} t={t} reload={reload} />)}
      {!list.length && <p className="mb-2 text-xs text-sub">Belum ada laporan untuk checkpoint ini.</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={issue ? "Ceritakan kendalanya…" : "Tulis progres atau diskusi…"} className="min-h-[60px] w-full rounded-xl border bg-surface p-2.5 text-sm outline-none" data-testid={`checkpoint-comment-input-${cp.id}`} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <button onClick={() => setIssue(!issue)} className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${issue ? "border-rose-400 bg-rose-500 text-white" : "text-sub"}`} data-testid={`checkpoint-issue-toggle-${cp.id}`}><Flag size={12} />Laporkan kendala</button>
        <button onClick={send} disabled={!text.trim()} className="btn-accent h-8 px-4 text-xs font-semibold disabled:opacity-40" data-testid={`checkpoint-comment-submit-${cp.id}`}>Kirim</button>
      </div>
    </div>
  );
}

export default function Checkpoints({ t, ro, patch, reload, members }) {
  const { userMap } = useApp();
  const cps = t.checkpoints || [];
  const [title, setTitle] = useState("");
  const [pic, setPic] = useState(null);
  const [open, setOpen] = useState(null);
  const save = (list) => patch({ checkpoints: list });
  const edit = (id, ch) => save(cps.map((c) => (c.id === id ? { ...c, ...ch } : c)));
  const add = () => { if (!title.trim()) return; save([...cps, { title: title.trim(), assignee_id: pic, done: false }]); setTitle(""); setPic(null); };
  const done = cps.filter((c) => c.done).length;
  return (
    <section data-testid="task-checkpoints">
      <div className="mb-2 flex items-end justify-between gap-3"><h4 className="text-sm font-bold">Checkpoint</h4><span className="text-sm font-bold" data-testid="task-progress-label">{t.progress ?? 0}% <span className="text-xs font-medium text-sub">· {done}/{cps.length} selesai</span></span></div>
      <ProgressBar value={t.progress} />
      <div className="mt-3 space-y-2">
        {cps.map((c, i) => {
          const cm = t.comments.filter((x) => x.checkpoint_id === c.id);
          const issues = cm.filter((x) => x.kind === "issue" && !x.resolved).length;
          return (
            <div key={c.id} className={`overflow-hidden rounded-2xl border ${issues ? "border-rose-300" : ""}`} data-testid={`checkpoint-${c.id}`}>
              <div className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
                <span className="w-5 text-center text-xs font-bold text-sub">{i + 1}</span>
                <input type="checkbox" checked={c.done} disabled={ro} onChange={() => edit(c.id, { done: !c.done })} className="h-4 w-4 accent-emerald-500" aria-label="Selesai" data-testid={`checkpoint-done-${c.id}`} />
                <input defaultValue={c.title} key={c.title} disabled={ro} onBlur={(e) => e.target.value.trim() && e.target.value !== c.title && edit(c.id, { title: e.target.value })} className={`min-w-0 flex-1 bg-transparent text-sm font-medium outline-none ${c.done ? "text-sub line-through" : ""}`} data-testid={`checkpoint-title-${c.id}`} />
                <div className="w-full sm:w-40">{ro ? <span className="text-xs text-sub">{userMap[c.assignee_id]?.name || "Tanpa PIC"}</span> : <UserSelect value={c.assignee_id} ids={members} onChange={(v) => edit(c.id, { assignee_id: v })} placeholder="Pilih PIC" testid={`checkpoint-pic-${c.id}`} />}</div>
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${open === c.id ? "bg-ink text-[var(--c-surface)]" : "text-sub"}`} data-testid={`checkpoint-discuss-${c.id}`}><MessageSquare size={12} />{cm.length}{issues > 0 && <span className="flex items-center gap-0.5 text-rose-500"><AlertTriangle size={12} />{issues}</span>}</button>
                {!ro && <button onClick={() => window.confirm("Hapus checkpoint ini?") && save(cps.filter((x) => x.id !== c.id))} className="text-sub hover:text-rose-500" aria-label="Hapus checkpoint" data-testid={`checkpoint-remove-${c.id}`}><X size={15} /></button>}
              </div>
              {c.done && c.done_at && <p className="-mt-1 px-10 pb-2 text-[11px] text-emerald-600">Selesai {rel(c.done_at)}{c.done_by && ` oleh ${userMap[c.done_by]?.name || ""}`}</p>}
              {open === c.id && <Thread t={t} cp={c} reload={reload} />}
            </div>
          );
        })}
      </div>
      {!ro && <div className="mt-2 flex flex-wrap gap-2 sm:flex-nowrap">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Tambah checkpoint, mis. Riset, Draft, Review…" className="h-10 min-w-0 flex-1 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="checkpoint-new-title" />
        <div className="w-full sm:w-40"><UserSelect value={pic} ids={members} onChange={setPic} placeholder="PIC" testid="checkpoint-new-pic" /></div>
        <button onClick={add} disabled={!title.trim()} className="btn-accent flex h-10 items-center gap-1 px-4 text-sm font-semibold disabled:opacity-40" data-testid="checkpoint-add-btn"><Plus size={14} />Tambah</button>
      </div>}
    </section>
  );
}
