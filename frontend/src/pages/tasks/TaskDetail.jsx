import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Share2, Paperclip, CheckCircle2, RotateCcw, Send, MessageSquare, History, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { Avatar, Spinner, fmtDate, rel, dueInfo } from "../../components/common";
import RichEditor, { RichView } from "../../components/RichEditor";
import { inp, UserSelect, PrioritySelect, LabelPicker, ItemPicker, ColorPicker, AttachmentList, useUploader, ListEditor } from "./fields";
import { toDeadline } from "./TaskCreate";
import Checkpoints, { CommentItem } from "./Checkpoints";

function Row({ label, children }) {
  return <div className="grid items-center gap-1 sm:grid-cols-[120px_1fr] sm:gap-3"><span className="text-xs font-semibold text-sub">{label}</span><div className="min-w-0">{children}</div></div>;
}

function Comments({ t, reload }) {
  const { users } = useApp();
  const [text, setText] = useState("");
  const send = async () => {
    const full = users.filter((u) => text.includes(`@${u.name}`));
    const ids = (full.length ? full : users.filter((u) => new RegExp(`@${u.name.split(" ")[0]}(?![\\w])`).test(text) && users.filter((x) => x.name.split(" ")[0] === u.name.split(" ")[0]).length === 1)).map((u) => u.user_id);
    try { await api.post(`/tasks/${t.id}/comments`, { text, mention_ids: ids }); setText(""); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid="task-comments">
      {t.comments.map((c) => <CommentItem key={c.id} c={c} t={t} reload={reload} showCheckpoint />)}
      <div className="flex gap-2"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment… use @Name to mention" className="min-h-[44px] flex-1 rounded-xl border bg-surface2 p-2.5 text-sm outline-none" data-testid="task-comment-input" />
        <button onClick={send} disabled={!text.trim()} className="btn-accent flex h-11 w-11 items-center justify-center disabled:opacity-40" aria-label="Send comment" data-testid="task-comment-submit"><Send size={16} /></button></div>
    </div>
  );
}

export default function TaskDetail({ id, onClose, onChanged }) {
  const { me, statuses, userMap, isManager } = useApp();
  const [t, setT] = useState(null);
  const [projects, setProjects] = useState([]);
  const [boards, setBoards] = useState([]);
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [tab, setTab] = useState("comments");
  const [groups, setGroups] = useState(null);
  const navigate = useNavigate();
  const load = () => api.get(`/tasks/${id}`).then((r) => setT(r.data)).catch(() => { toast.error("Task not found"); onClose(); });
  useEffect(() => { if (id) { setT(null); setEditDesc(false); load(); api.get("/projects").then((r) => setProjects(r.data)); api.get("/boards").then((r) => setBoards(r.data)); } }, [id]); // eslint-disable-line
  const patch = async (body, msg) => {
    try { const { data } = await api.patch(`/tasks/${id}`, body); setT(data); onChanged?.(); if (msg) toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const setAtt = (fn) => patch({ attachments: fn(t.attachments) });
  const { pick, input } = useUploader(setAtt);
  const share = async (cid) => { try { await api.post(`/tasks/${id}/share`, { conversation_id: cid }); toast.success("Preview dikirim ke grup, status jadi In Review"); setGroups(null); load(); } catch (e) { toast.error(errMsg(e)); } };
  const done = statuses.find((s) => s.key === t?.status)?.is_done;
  const ro = t && !t.can_edit;
  const d = t && dueInfo(t.deadline, done);
  const reviewer = t && (t.reviewer_id || t.requestor_id) === me.user_id;
  const members = t?.board?.member_ids || [];
  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-2xl" data-testid="task-detail-panel">
        <SheetHeader className="sr-only"><SheetTitle>Task details</SheetTitle></SheetHeader>
        {!t ? <Spinner /> : (
          <div className="pb-10">
            <div className="h-2" style={{ background: t.card_color || "transparent" }} />
            <div className="space-y-5 p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold text-sub" data-testid="task-detail-id">{t.number_str}{t.archived && " · Archived"}{done && t.completed_at && <span className="text-emerald-600"> · Completed {fmtDate(t.completed_at, "d MMM yyyy HH:mm")} by {userMap[t.completed_by]?.name}</span>}</p>
                <input defaultValue={t.title} key={t.updated_at} disabled={ro} onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch({ title: e.target.value })} className="mt-1 w-full bg-transparent text-2xl font-bold outline-none" data-testid="task-detail-title" />
              </div>
              {t.status === "in_review" && reviewer && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-soft-yellow p-3" data-testid="review-actions">
                  <span className="flex-1 text-sm font-semibold">This task is waiting for your review.</span>
                  <button onClick={() => patch({ status: "in_progress" }, "Sent back for revision")} className="flex h-9 items-center gap-1 rounded-full border bg-surface px-3 text-xs font-semibold" data-testid="request-revision-btn"><RotateCcw size={13} />Request revision</button>
                  <button onClick={() => patch({ status: statuses.find((s) => s.is_done)?.key }, "Approved")} className="flex h-9 items-center gap-1 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white" data-testid="approve-task-btn"><CheckCircle2 size={13} />Approve</button>
                </div>
              )}
              <div className="space-y-3">
                <Row label="Board"><select value={t.board_id || ""} disabled={ro} onChange={(e) => patch({ board_id: e.target.value }, "Task dipindah ke board lain")} className={inp} data-testid="task-detail-board">{!boards.some((b) => b.id === t.board_id) && t.board && <option value={t.board.id}>{t.board.name}</option>}{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Row>
                <Row label="Status"><select value={t.status} disabled={ro} onChange={(e) => patch({ status: e.target.value })} className={inp} data-testid="task-detail-status">{statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></Row>
                <Row label="Requestor"><span className="flex items-center gap-2 text-sm"><Avatar user={userMap[t.requestor_id]} size={24} showStatus={false} />{userMap[t.requestor_id]?.name}</span></Row>
                <Row label="Assignee"><UserSelect value={t.assignee_id} ids={members} onChange={(v) => patch({ assignee_id: v })} testid="task-detail-assignee" /></Row>
                <Row label="Reviewer"><UserSelect value={t.reviewer_id} ids={members} onChange={(v) => patch({ reviewer_id: v })} placeholder="Requestor reviews" /></Row>
                <Row label="Priority"><PrioritySelect value={t.priority} onChange={(v) => patch({ priority: v })} testid="task-detail-priority" /></Row>
                <Row label="Deadline"><div className="flex items-center gap-2"><input type="datetime-local" disabled={ro} defaultValue={t.deadline ? fmtDate(t.deadline, "yyyy-MM-dd'T'HH:mm") : ""} key={t.deadline} onBlur={(e) => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; if (v !== t.deadline) patch({ deadline: v }); }} className={inp} data-testid="task-detail-deadline" />{d && <span className={`whitespace-nowrap text-xs ${d.cls}`}>{d.state === "overdue" ? "Overdue" : d.state === "today" ? "Due today" : ""}</span>}</div></Row>
                <Row label="Start date"><input type="date" disabled={ro} defaultValue={t.start_date || ""} key={`s${t.start_date}`} onBlur={(e) => e.target.value !== (t.start_date || "") && patch({ start_date: e.target.value || null })} className={inp} /></Row>
                <Row label="IP / Brand"><LabelPicker value={t.label_ids} onChange={(v) => patch({ label_ids: v })} testid="task-detail-labels" /></Row>
                <Row label="Item"><ItemPicker value={t.item_type} onChange={(v) => patch({ item_type: v })} testid="task-detail-item" /></Row>
                <Row label="Link file/folder"><input disabled={ro} defaultValue={t.link_url || ""} key={`l${t.link_url}`} onBlur={(e) => e.target.value.trim() !== (t.link_url || "") && patch({ link_url: e.target.value.trim() })} placeholder="https://…" className={inp} data-testid="task-detail-link" /></Row>
                <Row label="Submit date"><input type="date" disabled={ro} defaultValue={t.submit_date || ""} key={`sd${t.submit_date}`} onChange={(e) => e.target.value !== (t.submit_date || "") && patch({ submit_date: e.target.value || null })} className={inp} data-testid="task-detail-submit-date" /></Row>
                <Row label="Project"><select value={t.project_id || ""} disabled={ro} onChange={(e) => patch({ project_id: e.target.value || null })} className={inp}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Row>
                <Row label="Department"><input defaultValue={t.department || ""} disabled={ro} onBlur={(e) => e.target.value !== (t.department || "") && patch({ department: e.target.value })} className={inp} /></Row>
                <Row label="Card color"><ColorPicker value={t.card_color} onChange={(v) => patch({ card_color: v })} style={t.card_style} onStyle={(v) => patch({ card_style: v })} /></Row>
                {t.estimate && <Row label="Estimate"><span className="text-sm">{t.estimate}</span></Row>}
              </div>
              <Checkpoints t={t} ro={ro} patch={patch} reload={load} members={members} />
              <section>
                <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold">Brief</h4>{!ro && <button onClick={() => { if (editDesc) patch({ description: desc }, "Description saved"); else setDesc(t.description || ""); setEditDesc(!editDesc); }} className="flex items-center gap-1 text-xs font-semibold text-brand" data-testid="task-edit-description-btn"><Pencil size={12} />{editDesc ? "Save" : "Edit"}</button>}</div>
                {editDesc ? <RichEditor value={desc} onChange={setDesc} testid="task-detail-editor" /> : <RichView html={t.description} className="rounded-2xl bg-surface2 p-4" />}
              </section>
              {t.links?.length > 0 && <section><h4 className="mb-2 text-sm font-bold">Reference links</h4>{t.links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-0.5 text-sm text-brand"><Link2 size={13} /><span className="truncate">{l}</span></a>)}</section>}
              <section><div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-bold">Attachments ({t.attachments.length})</h4>{!ro && <button onClick={pick} className="flex items-center gap-1 text-xs font-semibold text-brand" data-testid="task-detail-add-attachment"><Paperclip size={12} />Add</button>}{input}</div><AttachmentList items={t.attachments} onRemove={ro ? null : (a) => setAtt((x) => x.filter((y) => y.id !== a.id))} /></section>
              <div className="grid gap-5 sm:grid-cols-2">
                <section><h4 className="mb-1 text-sm font-bold">Checklist</h4><ListEditor items={t.checklist} onChange={(v) => patch({ checklist: v })} placeholder="Add item" testid="task-detail-checklist" /></section>
                <section><h4 className="mb-1 text-sm font-bold">Subtasks ({t.subtasks.filter((s) => s.done).length}/{t.subtasks.length})</h4><ListEditor items={t.subtasks} field="title" onChange={(v) => patch({ subtasks: v })} placeholder="Add subtask" testid="task-detail-subtasks" /></section>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => (groups ? setGroups(null) : api.get("/conversations").then((r) => setGroups(r.data.filter((c) => c.type === "group"))))} className="btn-ghost flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold" data-testid="task-share-btn"><Share2 size={14} />Preview to group</button>
                {t.conversation_id && <button onClick={() => navigate(`/messages/${t.conversation_id}`)} className="btn-ghost flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold" data-testid="task-open-conversation"><MessageSquare size={14} />Open conversation</button>}
                {(isManager || t.requestor_id === me.user_id) && <button onClick={() => patch({ archived: !t.archived }, t.archived ? "Restored" : "Archived")} className="btn-ghost flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold" data-testid="task-archive-btn"><Archive size={14} />{t.archived ? "Unarchive" : "Archive"}</button>}
              </div>
              {groups && <div className="rounded-2xl border p-2">{groups.map((g) => <button key={g.id} onClick={() => share(g.id)} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-surface2" data-testid={`share-to-${g.id}`}># {g.name}</button>)}</div>}
              <section>
                <div className="mb-3 flex gap-1 border-b text-sm font-semibold">{[["comments", MessageSquare, `Comments (${t.comments.length})`], ["activity", History, "Activity"]].map(([k, I, l]) => <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 ${tab === k ? "border-[var(--c-accent)]" : "border-transparent text-sub"}`} data-testid={`task-tab-${k}`}><I size={14} />{l}</button>)}</div>
                {tab === "comments" ? <Comments t={t} reload={load} /> : (
                  <ul className="space-y-3" data-testid="task-activity">{t.activity.map((a) => <li key={a.id} className="flex gap-2.5 text-sm"><Avatar user={userMap[a.actor_id]} size={24} showStatus={false} /><span><b>{userMap[a.actor_id]?.name}</b> <span className="text-sub">{a.action}</span>{a.changes?.from !== undefined && a.changes?.to !== undefined && typeof a.changes.to !== "object" && a.changes.to !== null && <span className="text-sub"> → <b className="text-ink">{userMap[a.changes.to]?.name || statuses.find((s) => s.key === a.changes.to)?.name || String(a.changes.to).slice(0, 40)}</b></span>}<span className="block text-[11px] text-sub">{fmtDate(a.created_at, "d MMM yyyy, HH:mm")}</span></span></li>)}</ul>
                )}
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
