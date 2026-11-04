import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Reply, Smile, Pencil, Trash2, Pin, CheckSquare, FileText, Phone, PhoneMissed, MoreHorizontal, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fileUrl } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar, StatusBadge, PriorityBadge, fmtTime } from "../../components/common";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import PollCard from "./PollCard";
import { StickerTile } from "./Composer";

function TaskPreview({ m }) {
  const { userMap, me, isManager } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const t = m.task;
  const r = t.review;
  const can = isManager || [t.reviewer_id, t.requestor_id].includes(me.user_id);
  const decide = async (decision) => {
    const note = decision === "revise" ? window.prompt("Catatan revisi (opsional):", "") : "";
    if (note === null) return;
    setBusy(true);
    try { await api.post(`/tasks/${t.id}/review`, { message_id: m.id, decision, note }); toast.success(decision === "approve" ? "Task disetujui & dipindah ke Done" : "Revisi dikirim ke assignee"); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="w-64 rounded-2xl border bg-surface p-3 text-left text-ink shadow-sm" data-testid={`message-task-card-${t.id}`}>
      <button onClick={() => navigate(`/tasks?task=${t.id}`)} className="block w-full text-left">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sub"><CheckSquare size={12} className="text-brand" />Preview task {t.number_str || `T-${t.number}`}</p>
        <p className="mt-1 font-semibold">{t.title}</p>
        <div className="mt-2 flex gap-1.5"><StatusBadge status={t.status} /><PriorityBadge value={t.priority} /></div>
      </button>
      {r?.state === "pending" && (can ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => decide("approve")} className="h-9 rounded-xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50" data-testid={`task-preview-approve-${m.id}`}>Approve</button>
          <button disabled={busy} onClick={() => decide("revise")} className="h-9 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50" data-testid={`task-preview-revise-${m.id}`}>Revisi</button>
        </div>) : <p className="mt-3 text-xs text-sub">Menunggu review</p>)}
      {r && r.state !== "pending" && <p className={`mt-3 rounded-xl px-2.5 py-1.5 text-xs font-semibold ${r.state === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} data-testid={`task-preview-result-${m.id}`}>{r.state === "approved" ? "Disetujui" : "Diminta revisi"} oleh {userMap[r.by]?.name?.split(" ")[0] || "\u2014"}{r.note ? `: ${r.note}` : ""}</p>}
    </div>
  );
}

const QUICK = ["👍", "❤️", "😂", "🎉", "🙏", "👀"];

function renderText(text, userMap) {
  const parts = text.split(/(https?:\/\/[^\s]+|@[A-Z][\w]*(?: [A-Z][\w]*)?)/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="underline break-all">{p}</a>;
    if (p.startsWith("@") && Object.values(userMap).some((u) => `@${u.name}` === p || p.startsWith(`@${u.name.split(" ")[0]}`))) return <span key={i} className="rounded bg-soft-blue px-1 font-semibold">{p}</span>;
    return p;
  });
}

export default function MessageItem({ m, mine, grouped, conv, onReply, onCreateTask, readBy }) {
  const { userMap, me } = useApp();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(m.text);
  const navigate = useNavigate();
  const sender = userMap[m.sender_id];
  const act = (fn) => async () => { try { await fn(); } catch (e) { toast.error(errMsg(e)); } };
  const react = (emoji) => act(() => api.post(`/messages/${m.id}/react`, { emoji }))();
  const save = act(async () => { await api.patch(`/messages/${m.id}`, { text: val }); setEditing(false); });

  if (m.type === "call") {
    return (
      <div className="my-2 flex justify-center" data-testid={`message-${m.id}`}>
        <span className="flex items-center gap-2 rounded-full bg-surface2 px-3 py-1.5 text-xs text-sub">
          {m.call?.missed ? <PhoneMissed size={13} className="text-rose-500" /> : <Phone size={13} />}
          {m.call?.missed ? `Missed ${m.call.media} call` : `${m.text} · ${Math.floor((m.call?.duration || 0) / 60)}m ${(m.call?.duration || 0) % 60}s`} · {fmtTime(m.created_at)}
        </span>
      </div>
    );
  }
  const bubble = mine ? "bg-brand text-white rounded-br-md" : "bg-surface border rounded-bl-md";
  const images = (m.attachments || []).filter((a) => a.content_type?.startsWith("image/"));
  const docs = (m.attachments || []).filter((a) => !a.content_type?.startsWith("image/"));
  const plain = m.type === "sticker" || m.type === "poll" || m.type === "task";
  return (
    <div className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-4"}`} data-testid={`message-${m.id}`}>
      <div className="w-8 shrink-0">{!grouped && !mine && <Avatar user={sender} size={32} />}</div>
      <div className={`flex min-w-0 max-w-[82%] sm:max-w-[70%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!grouped && <p className="mb-1 px-1 text-[11px] text-sub"><b className="font-semibold text-ink">{mine ? "You" : sender?.name}</b> · {fmtTime(m.created_at)}{m.pinned && <Pin size={10} className="ml-1 inline text-brand" />}</p>}
        {m.reply_to && <div className={`mb-1 max-w-full truncate rounded-xl border-l-4 border-[var(--c-accent)] bg-surface2 px-2.5 py-1 text-xs text-sub`}>{userMap[m.reply_to.sender_id]?.name}: {m.reply_to.text}</div>}
        <div className="flex items-center gap-1">
          <div className={`min-w-0 ${mine ? "order-2" : ""}`}>
            {m.deleted ? <div className="rounded-2xl border border-dashed px-3 py-2 text-sm italic text-sub">Message deleted</div> : (<>
              {m.type === "sticker" && m.sticker && <StickerTile s={m.sticker} size={120} />}
              {m.type === "poll" && <PollCard pollId={m.poll_id} />}
              {m.type === "task" && m.task && <TaskPreview m={m} />}
              {(m.text && m.type !== "poll") && (editing ? (
                <div className="flex flex-col gap-1"><textarea value={val} onChange={(e) => setVal(e.target.value)} className="w-72 max-w-full rounded-xl border bg-surface p-2 text-sm text-ink" data-testid="edit-message-input" />
                  <div className="flex gap-2 text-xs"><button onClick={save} className="font-semibold text-brand" data-testid="save-edit-btn">Save</button><button onClick={() => setEditing(false)} className="text-sub">Cancel</button></div></div>
              ) : <div className={`${plain ? "mt-1 text-sm" : `rounded-2xl px-3.5 py-2 text-[14.5px] leading-relaxed ${bubble}`} whitespace-pre-wrap break-words`}>{renderText(m.text, userMap)}{m.edited && <span className="ml-1 text-[10px] opacity-70">(edited)</span>}</div>)}
              {images.length > 0 && <div className="mt-1 grid grid-cols-2 gap-1">{images.map((a) => <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer"><img src={fileUrl(a.id)} alt={a.name} loading="lazy" className="h-36 w-36 sm:h-44 sm:w-44 rounded-xl object-cover" /></a>)}</div>}
              {docs.map((a) => <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-sm text-ink" data-testid={`message-file-${a.id}`}><FileText size={16} className="text-brand" /><span className="max-w-[200px] truncate">{a.name}</span><span className="text-[10px] text-sub">{Math.ceil(a.size / 1024)} KB</span></a>)}
            </>)}
          </div>
          {!m.deleted && !editing && (
            <div className={`flex items-center opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 ${mine ? "order-1" : ""}`}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button className="flex h-8 w-8 items-center justify-center rounded-full text-sub hover:bg-surface2" aria-label="Message actions" data-testid={`message-actions-${m.id}`}><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"} className="bg-surface">
                  <div className="flex gap-0.5 p-1">{QUICK.map((e) => <DropdownMenuItem key={e} onClick={() => react(e)} className="h-8 w-8 justify-center rounded-lg p-0 text-lg" data-testid={`react-${e}`}>{e}</DropdownMenuItem>)}</div>
                  <DropdownMenuItem onClick={() => onReply(m)} data-testid="action-reply"><Reply size={14} className="mr-2" />Reply</DropdownMenuItem>
                  <DropdownMenuItem onClick={act(() => api.post(`/messages/${m.id}/pin`))} data-testid="action-pin"><Pin size={14} className="mr-2" />{m.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCreateTask(m)} data-testid="action-create-task"><CheckSquare size={14} className="mr-2" />Create task</DropdownMenuItem>
                  {mine && m.type === "text" && <DropdownMenuItem onClick={() => setEditing(true)} data-testid="action-edit"><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>}
                  {(mine || conv.admin_ids?.includes(me.user_id)) && <DropdownMenuItem onClick={act(() => api.delete(`/messages/${m.id}`))} className="text-rose-600" data-testid="action-delete"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={() => react("👍")} className="hidden h-8 w-8 items-center justify-center rounded-full text-sub hover:bg-surface2 md:flex" aria-label="React"><Smile size={15} /></button>
            </div>
          )}
        </div>
        {Object.keys(m.reactions || {}).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">{Object.entries(m.reactions).map(([e, us]) => <button key={e} onClick={() => react(e)} title={us.map((u) => userMap[u]?.name).join(", ")} className={`rounded-full border px-2 py-0.5 text-xs ${us.includes(me.user_id) ? "border-[var(--c-accent)] bg-soft-red" : "bg-surface"}`} data-testid={`reaction-${e}`}>{e} {us.length}</button>)}</div>
        )}
        {mine && readBy !== undefined && <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-sub" data-testid="read-receipt">{readBy > 0 ? <><CheckCheck size={12} className="text-blue-500" />Read{conv.type === "group" ? ` by ${readBy}` : ""}</> : <><Check size={12} />Delivered</>}</span>}
      </div>
    </div>
  );
}
