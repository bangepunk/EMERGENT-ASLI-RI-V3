import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Search, Hash, Lock, MessageCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { Avatar, Empty, fmtTime } from "../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import ChatView from "./chat/ChatView";

function NewDM({ open, onOpenChange }) {
  const { users, me } = useApp();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const start = async (uid) => { const { data } = await api.post("/conversations/dm", { user_id: uid }); onOpenChange(false); navigate(`/messages/${data.id}`); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-md">
        <DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a colleague…" className="h-11 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="new-dm-search" />
        <div className="max-h-80 overflow-y-auto">
          {users.filter((u) => u.user_id !== me.user_id && u.name.toLowerCase().includes(q.toLowerCase())).map((u) => (
            <button key={u.user_id} onClick={() => start(u.user_id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface2" data-testid={`new-dm-user-${u.user_id}`}>
              <Avatar user={u} size={34} /><span><span className="block text-sm font-semibold">{u.name}</span><span className="block text-xs text-sub">{u.job_title}</span></span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Messages() {
  const { cid } = useParams();
  const { me, userMap, subscribe } = useApp();
  const [convs, setConvs] = useState([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [dm, setDm] = useState(false);
  const navigate = useNavigate();
  const load = () => api.get("/conversations").then((r) => setConvs(r.data));
  useEffect(() => { load(); }, [cid]); // eslint-disable-line
  useEffect(() => subscribe((e) => { if (e.type === "message:new" || e.type === "read") load(); }), [subscribe]); // eslint-disable-line
  const named = useMemo(() => convs.map((c) => {
    const other = c.type === "dm" ? userMap[c.member_ids.find((x) => x !== me.user_id) || me.user_id] : null;
    return { ...c, other, title: other?.name || c.name || "Conversation" };
  }), [convs, userMap, me]);
  const list = named.filter((c) => (tab === "all" || (tab === "dm" ? c.type === "dm" : c.type === "group")) && c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={`flex ${cid ? "h-[100dvh]" : "h-[calc(100dvh-7.5rem)]"} md:h-screen`} data-testid="messages-page">
      <aside className={`${cid ? "hidden lg:flex" : "flex"} w-full lg:w-[320px] shrink-0 flex-col border-r bg-surface`}>
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between"><h1 className="text-2xl font-bold tracking-tight">Messages</h1>
            <button onClick={() => setDm(true)} className="btn-accent flex h-10 w-10 items-center justify-center" aria-label="New message" data-testid="new-message-btn"><Plus size={18} /></button></div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border bg-surface2 px-3"><Search size={15} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter conversations" className="h-10 flex-1 bg-transparent text-sm outline-none" data-testid="conversation-filter-input" /></div>
          <div className="mt-3 flex gap-1 rounded-xl bg-surface2 p-1 text-xs font-semibold">
            {[["all", "All"], ["dm", "Direct"], ["group", "Groups"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-1.5 ${tab === k ? "bg-surface shadow-sm" : "text-sub"}`} data-testid={`conv-tab-${k}`}>{l}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 scroll-thin">
          {list.map((c) => (
            <button key={c.id} onClick={() => navigate(`/messages/${c.id}`)} data-testid={`conversation-item-${c.id}`}
              className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${cid === c.id ? "bg-soft-red" : "hover:bg-surface2"}`}>
              {c.other ? <Avatar user={c.other} size={42} /> : <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl bg-soft-purple text-ink">{c.group_type === "private" ? <Lock size={16} /> : <Hash size={16} />}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{c.title}</span><span className="shrink-0 text-[10px] text-sub">{fmtTime(c.last_message_at)}</span></span>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-xs text-sub">{c.last_message_preview || "No messages yet"}</span>{c.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white" data-testid="conversation-unread">{c.unread}</span>}</span>
              </span>
            </button>
          ))}
          {!list.length && <Empty icon={MessageCircle} title="No conversations" text="Start a direct message or join a group." />}
        </div>
      </aside>
      <section className={`${cid ? "flex" : "hidden lg:flex"} min-w-0 flex-1`}>
        {cid ? <ChatView key={cid} cid={cid} onChange={load} /> : <div className="flex flex-1 items-center justify-center"><Empty icon={MessageCircle} title="Pick a conversation" text="Your messages stay private to the people in each conversation." /></div>}
      </section>
      <NewDM open={dm} onOpenChange={setDm} />
    </div>
  );
}
