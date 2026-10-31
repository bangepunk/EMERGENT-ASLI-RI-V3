import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, Search, PanelRight, BellOff, Bell, X, Pin, FileText, CheckSquare, UserPlus, LogOut, Archive, Trash2, Shield, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fileUrl } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { useCall } from "../../components/CallLayer";
import { Avatar, Spinner, fmtDate, GroupIcon } from "../../components/common";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import MessageItem from "./MessageItem";
import Composer from "./Composer";
import CreatePollDialog from "./CreatePollDialog";
import TaskCreate from "../tasks/TaskCreate";
import { GroupDialog, MemberPicker } from "./GroupDialog";

function Panel({ conv, reload, onClose }) {
  const { me, userMap, prefs, savePrefs, isAdmin, online } = useApp();
  const [tab, setTab] = useState("members");
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const navigate = useNavigate();
  const amAdmin = isAdmin || conv.admin_ids?.includes(me.user_id);
  const muted = (prefs.muted_conversations || []).includes(conv.id);
  const run = (fn, msg) => async () => { try { await fn(); msg && toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const toggleMute = async () => { await api.post(`/conversations/${conv.id}/mute`, { muted: !muted }); savePrefs({ muted_conversations: muted ? (prefs.muted_conversations || []).filter((x) => x !== conv.id) : [...(prefs.muted_conversations || []), conv.id] }); };
  return (
    <div className="flex h-full flex-col" data-testid="chat-context-panel">
      <div className="flex items-center justify-between border-b p-4"><p className="font-bold">Details</p><button onClick={onClose} aria-label="Close panel" className="text-sub"><X size={18} /></button></div>
      <div className="p-4">
        {conv.type === "group" && <p className="text-sm text-sub">{conv.description}</p>}
        {conv.location && <p className="mt-2 flex items-center gap-1 text-xs text-sub"><MapPin size={12} />{conv.location}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={toggleMute} className="btn-ghost flex h-9 items-center gap-1.5 border px-3 text-xs font-semibold" data-testid="mute-conversation-btn">{muted ? <Bell size={14} /> : <BellOff size={14} />}{muted ? "Unmute" : "Mute"}</button>
          {conv.type === "group" && amAdmin && <button onClick={() => setEdit(true)} className="btn-ghost h-9 border px-3 text-xs font-semibold" data-testid="edit-group-btn">Edit group</button>}
          {conv.type === "group" && !conv.is_default && <button onClick={run(async () => { await api.post(`/groups/${conv.id}/leave`); navigate("/messages"); }, "Left group")} className="btn-ghost flex h-9 items-center gap-1 border px-3 text-xs font-semibold" data-testid="leave-group-btn"><LogOut size={13} />Leave</button>}
        </div>
      </div>
      <div className="flex gap-1 border-b px-4 text-xs font-semibold">
        {["members", "pinned", "files", "tasks"].map((t) => <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-2 py-2 capitalize ${tab === t ? "border-[var(--c-accent)] text-ink" : "border-transparent text-sub"}`} data-testid={`panel-tab-${t}`}>{t}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-3 scroll-thin">
        {tab === "members" && (<>
          {conv.type === "group" && amAdmin && <button onClick={() => setAdd(true)} className="mb-2 flex w-full items-center gap-2 rounded-xl p-2 text-sm font-semibold text-brand hover:bg-surface2" data-testid="add-members-btn"><UserPlus size={16} />Add members</button>}
          {conv.member_ids.map((id) => { const u = userMap[id]; if (!u) return null; const adm = conv.admin_ids?.includes(id); return (
            <div key={id} className="group flex items-center gap-2.5 rounded-xl p-2 hover:bg-surface2">
              <button onClick={() => navigate(`/people/${id}`)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left"><Avatar user={u} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{u.name}{adm && <Shield size={11} className="ml-1 inline text-brand" />}</span><span className="block text-[11px] text-sub">{online.has(id) ? "Online" : u.job_title}</span></span></button>
              {conv.type === "group" && amAdmin && id !== me.user_id && (
                <span className="hidden gap-1 group-hover:flex">
                  <button onClick={run(() => api.post(`/groups/${conv.id}/members`, { admin_id: id, make_admin: !adm }))} className="text-[10px] font-semibold text-sub" data-testid={`toggle-admin-${id}`}>{adm ? "Unadmin" : "Admin"}</button>
                  <button onClick={run(() => api.post(`/groups/${conv.id}/members`, { remove: [id] }), "Removed")} className="text-[10px] font-semibold text-rose-500" data-testid={`remove-member-${id}`}>Remove</button>
                </span>
              )}
            </div>); })}
        </>)}
        {tab === "pinned" && (conv.pinned?.length ? conv.pinned.map((m) => <div key={m.id} className="mb-2 rounded-xl bg-surface2 p-2.5 text-sm"><p className="text-[11px] text-sub"><Pin size={10} className="inline" /> {userMap[m.sender_id]?.name} · {fmtDate(m.created_at, "d MMM")}</p><p className="mt-0.5 line-clamp-3">{m.text || "Attachment"}</p></div>) : <p className="p-2 text-sm text-sub">No pinned messages.</p>)}
        {tab === "files" && (conv.files?.length ? <div className="grid grid-cols-3 gap-2">{conv.files.map((f) => f.content_type?.startsWith("image/") ? <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer"><img src={fileUrl(f.id)} alt={f.name} className="aspect-square w-full rounded-xl object-cover" /></a> : <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="col-span-3 flex items-center gap-2 rounded-xl bg-surface2 p-2 text-xs"><FileText size={14} />{f.name}</a>)}</div> : <p className="p-2 text-sm text-sub">No shared files yet.</p>)}
        {tab === "tasks" && (conv.tasks?.length ? conv.tasks.map((t) => <button key={t.id} onClick={() => navigate(`/tasks?task=${t.id}`)} className="mb-1 flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm hover:bg-surface2"><CheckSquare size={14} className="text-brand" /><span className="text-xs text-sub">T-{t.number}</span>{t.title}</button>) : <p className="p-2 text-sm text-sub">Tasks created from this conversation appear here.</p>)}
      </div>
      {conv.type === "group" && amAdmin && !conv.is_default && (
        <div className="flex gap-2 border-t p-3">
          <button onClick={run(() => api.patch(`/groups/${conv.id}`, { archived: !conv.archived }), conv.archived ? "Unarchived" : "Archived")} className="btn-ghost flex h-9 flex-1 items-center justify-center gap-1 border text-xs font-semibold" data-testid="archive-group-btn"><Archive size={13} />{conv.archived ? "Unarchive" : "Archive"}</button>
          <button onClick={run(async () => { if (!window.confirm("Delete this group? Members will lose access.")) return; await api.delete(`/groups/${conv.id}`); navigate("/messages"); }, "Group deleted")} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-full border border-rose-200 text-xs font-semibold text-rose-600" data-testid="delete-group-btn"><Trash2 size={13} />Delete</button>
        </div>
      )}
      <GroupDialog open={edit} onOpenChange={setEdit} group={conv} onSaved={reload} />
      <MemberPicker open={add} onOpenChange={setAdd} exclude={conv.member_ids} onPick={(ids) => run(() => api.post(`/groups/${conv.id}/members`, { add: ids }), "Members added")()} />
    </div>
  );
}

export default function ChatView({ cid, onChange }) {
  const { me, userMap, subscribe, online } = useApp();
  const { startCall } = useCall();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [more, setMore] = useState(true);
  const [reply, setReply] = useState(null);
  const [typing, setTyping] = useState({});
  const [panel, setPanel] = useState(window.innerWidth >= 1280);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [poll, setPoll] = useState(false);
  const [taskFrom, setTaskFrom] = useState(null);
  const [search, setSearch] = useState(null);
  const [results, setResults] = useState([]);
  const bottom = useRef(null);
  const scroller = useRef(null);
  const navigate = useNavigate();

  const loadConv = () => api.get(`/conversations/${cid}`).then((r) => setConv(r.data)).catch(() => { toast.error("Conversation not available"); navigate("/messages"); });
  const markRead = () => api.post(`/conversations/${cid}/read`).then(onChange).catch(() => {});
  useEffect(() => {
    loadConv();
    api.get(`/conversations/${cid}/messages`).then((r) => { setMsgs(r.data); setMore(r.data.length >= 50); setTimeout(() => bottom.current?.scrollIntoView(), 50); markRead(); }).catch(() => {});
  }, [cid]); // eslint-disable-line

  useEffect(() => subscribe((e) => {
    const d = e.data;
    if (e.type === "message:new" && d.conversation_id === cid) {
      setMsgs((x) => (x.some((y) => y.id === d.id) ? x : [...x, d]));
      setTyping((t) => ({ ...t, [d.sender_id]: 0 }));
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 30);
      if (d.sender_id !== me.user_id) markRead();
    }
    if (e.type === "message:update" && d.conversation_id === cid) { setMsgs((x) => x.map((y) => (y.id === d.id ? d : y))); if (e.data.pinned !== undefined) loadConv(); }
    if (e.type === "read" && d.conversation_id === cid) setConv((c) => c && ({ ...c, reads: { ...(c.reads || {}), [d.user_id]: d.at } }));
    if (e.type === "typing" && d.conversation_id === cid) setTyping((t) => ({ ...t, [d.user_id]: Date.now() }));
  }), [subscribe, cid]); // eslint-disable-line

  useEffect(() => { const t = setInterval(() => setTyping((x) => ({ ...x })), 2000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!search) { setResults([]); return undefined; }
    const t = setTimeout(() => api.get(`/conversations/${cid}/messages`, { params: { q: search } }).then((r) => setResults(r.data)), 250);
    return () => clearTimeout(t);
  }, [search, cid]);

  const older = async () => {
    const h = scroller.current.scrollHeight;
    const { data } = await api.get(`/conversations/${cid}/messages`, { params: { before: msgs[0]?.created_at } });
    setMore(data.length >= 50);
    setMsgs((x) => [...data, ...x]);
    requestAnimationFrame(() => { scroller.current.scrollTop = scroller.current.scrollHeight - h; });
  };
  if (!conv) return <div className="flex-1"><Spinner /></div>;
  const other = conv.type === "dm" ? userMap[conv.member_ids.find((x) => x !== me.user_id) || me.user_id] : null;
  const title = other?.name || conv.name;
  const typers = Object.entries(typing).filter(([, t]) => Date.now() - t < 4000).map(([id]) => userMap[id]?.name?.split(" ")[0]).filter(Boolean);
  const readers = (ts) => Object.entries(conv.reads || {}).filter(([id, at]) => id !== me.user_id && at >= ts).length;
  const lastMine = [...msgs].reverse().find((m) => m.sender_id === me.user_id)?.id;
  const join = async () => { await api.post(`/groups/${cid}/join`); loadConv(); onChange(); };
  const openPanel = () => (window.innerWidth >= 1280 ? setPanel(!panel) : setMobilePanel(true));

  return (
    <div className="flex min-w-0 flex-1" data-testid="chat-view">
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-surface px-2 sm:px-4 pt-safe">
          <button onClick={() => navigate("/messages")} className="btn-ghost flex h-11 w-11 items-center justify-center lg:hidden" aria-label="Back" data-testid="chat-back-btn"><ArrowLeft size={20} /></button>
          <button onClick={openPanel} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {other ? <Avatar user={other} size={38} /> : <GroupIcon c={conv} size={40} />}
            <span className="min-w-0"><span className="block truncate font-bold" data-testid="chat-title">{title}</span>
              <span className="block truncate text-xs text-sub">{typers.length ? <span className="text-brand" data-testid="typing-indicator">{typers.join(", ")} typing…</span> : other ? (online.has(other.user_id) ? "Online" : other.job_title) : `${conv.member_ids.length} members${conv.archived ? " · Archived" : ""}`}</span></span>
          </button>
          {conv.is_member !== false && <>
            <button onClick={() => startCall(cid, "audio")} className="btn-ghost flex h-11 w-11 items-center justify-center text-sub" aria-label="Voice call" data-testid="start-voice-call-btn"><Phone size={18} /></button>
            <button onClick={() => startCall(cid, "video")} className="btn-ghost flex h-11 w-11 items-center justify-center text-sub" aria-label="Video call" data-testid="start-video-call-btn"><Video size={19} /></button>
          </>}
          <button onClick={() => setSearch(search === null ? "" : null)} className="btn-ghost hidden h-11 w-11 items-center justify-center text-sub sm:flex" aria-label="Search in conversation" data-testid="chat-search-toggle"><Search size={18} /></button>
          <button onClick={openPanel} className="btn-ghost flex h-11 w-11 items-center justify-center text-sub" aria-label="Details" data-testid="chat-details-toggle"><PanelRight size={18} /></button>
        </header>
        {conv.active_call && <div className="flex items-center justify-between bg-soft-green px-4 py-2 text-sm"><span>A call is in progress</span><button onClick={() => startCall(cid, conv.active_call.media)} className="font-semibold text-emerald-700" data-testid="join-active-call-btn">Join</button></div>}
        {search !== null && (
          <div className="border-b bg-surface p-3">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this conversation…" className="h-10 w-full rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="chat-search-input" />
            {results.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto">{results.map((m) => <div key={m.id} className="rounded-lg p-2 text-sm hover:bg-surface2"><b>{userMap[m.sender_id]?.name}</b> <span className="text-xs text-sub">{fmtDate(m.created_at, "d MMM HH:mm")}</span><p className="truncate">{m.text}</p></div>)}</div>}
          </div>
        )}
        <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 scroll-thin" data-testid="message-list">
          {more && msgs.length > 0 && <div className="text-center"><button onClick={older} className="rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-sub" data-testid="load-older-btn">Load older messages</button></div>}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id && prev.type !== "call" && new Date(m.created_at) - new Date(prev.created_at) < 300000;
            return <MessageItem key={m.id} m={m} mine={m.sender_id === me.user_id} grouped={grouped} conv={conv} onReply={setReply} onCreateTask={setTaskFrom} readBy={m.id === lastMine ? readers(m.created_at) : undefined} />;
          })}
          {!msgs.length && <p className="py-20 text-center text-sm text-sub">Say hello to {title}.</p>}
          <div ref={bottom} />
        </div>
        {conv.is_member === false ? (
          <div className="border-t bg-surface p-4 text-center"><button onClick={join} className="btn-accent h-11 px-6 font-semibold" data-testid="join-group-btn">Join {conv.name}</button></div>
        ) : <Composer conv={conv} reply={reply} onCancelReply={() => setReply(null)} onPoll={() => setPoll(true)} onSent={(m) => setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]))} />}
      </div>
      {panel && <aside className="hidden w-[320px] shrink-0 border-l bg-surface xl:block"><Panel conv={conv} reload={() => { loadConv(); onChange(); }} onClose={() => setPanel(false)} /></aside>}
      <Sheet open={mobilePanel} onOpenChange={setMobilePanel}><SheetContent className="w-full bg-surface p-0 sm:max-w-sm"><SheetHeader className="sr-only"><SheetTitle>Details</SheetTitle></SheetHeader><Panel conv={conv} reload={() => { loadConv(); onChange(); }} onClose={() => setMobilePanel(false)} /></SheetContent></Sheet>
      <CreatePollDialog open={poll} onOpenChange={setPoll} conversationId={cid} />
      <TaskCreate open={!!taskFrom} onOpenChange={(v) => !v && setTaskFrom(null)} preset={taskFrom ? { title: (taskFrom.text || "Task from message").slice(0, 120), description: `<p>${(taskFrom.text || "").replace(/</g, "&lt;")}</p><p><i>From conversation: ${title}</i></p>`, conversation_id: cid, message_id: taskFrom.id } : null} onCreated={(t) => { setTaskFrom(null); api.post(`/tasks/${t.id}/share`, { conversation_id: cid }).catch(() => {}); loadConv(); }} />
    </div>
  );
}
