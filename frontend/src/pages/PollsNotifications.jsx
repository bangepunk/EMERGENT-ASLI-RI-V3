import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Plus, Bell, CheckCheck } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { PageHeader, Spinner, Empty, AccentButton, GhostButton, rel, Avatar } from "../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import PollCard from "./chat/PollCard";
import CreatePollDialog from "./chat/CreatePollDialog";

export function Polls() {
  const [polls, setPolls] = useState(null);
  const [convs, setConvs] = useState([]);
  const [pickConv, setPickConv] = useState(false);
  const [cid, setCid] = useState(null);
  const [tab, setTab] = useState("open");
  const { userMap, me } = useApp();
  const load = () => api.get("/polls").then((r) => setPolls(r.data));
  useEffect(() => { load(); api.get("/conversations").then((r) => setConvs(r.data)); }, []);
  const name = (c) => c.name || userMap[c.member_ids.find((x) => x !== me.user_id)]?.name;
  const list = (polls || []).filter((p) => p.status === tab);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="polls-page">
      <PageHeader icon={BarChart3} title="Polls" subtitle="Polls from your conversations and groups." actions={<AccentButton onClick={() => setPickConv(true)} data-testid="new-poll-btn"><Plus size={16} />New poll</AccentButton>} />
      <div className="mb-5 flex gap-2">{["open", "closed"].map((t) => <button key={t} onClick={() => setTab(t)} className={`h-9 rounded-full px-4 text-sm font-medium capitalize ${tab === t ? "bg-ink text-[var(--c-surface)]" : "border bg-surface text-sub"}`} data-testid={`polls-tab-${t}`}>{t}</button>)}</div>
      {!polls ? <Spinner /> : !list.length ? <Empty icon={BarChart3} title={`No ${tab} polls`} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((p) => <div key={p.id}><p className="mb-1.5 px-1 text-xs text-sub">in {name(convs.find((c) => c.id === p.conversation_id) || { member_ids: [] }) || "conversation"} · {rel(p.created_at)}</p><PollCard pollId={p.id} poll={p} compact /></div>)}</div>
      )}
      <Dialog open={pickConv} onOpenChange={setPickConv}><DialogContent className="bg-surface rounded-3xl max-w-md"><DialogHeader><DialogTitle>Post poll in…</DialogTitle></DialogHeader>
        <div className="max-h-80 overflow-y-auto">{convs.map((c) => <button key={c.id} onClick={() => { setCid(c.id); setPickConv(false); }} className="block w-full rounded-xl p-2.5 text-left text-sm hover:bg-surface2" data-testid={`poll-conv-${c.id}`}>{c.type === "group" ? "# " : ""}{name(c)}</button>)}</div></DialogContent></Dialog>
      <CreatePollDialog open={!!cid} onOpenChange={(v) => !v && setCid(null)} conversationId={cid} onCreated={load} />
    </div>
  );
}

export function Notifications() {
  const { setUnread, userMap } = useApp();
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const navigate = useNavigate();
  const load = () => api.get("/notifications").then((r) => { setData(r.data); setUnread(r.data.unread); });
  useEffect(() => { load(); }, []); // eslint-disable-line
  const open = async (n) => { await api.post(`/notifications/${n.id}/read`); load(); if (n.link) navigate(n.link); };
  const readAll = async () => { await api.post("/notifications/read-all"); load(); };
  const cats = ["all", ...new Set((data?.items || []).map((n) => n.category))];
  const items = (data?.items || []).filter((n) => cat === "all" || n.category === cat);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10" data-testid="notifications-page">
      <PageHeader icon={Bell} title="Notifications" subtitle={data ? `${data.unread} unread` : ""} actions={<>
        {"Notification" in window && Notification.permission !== "granted" && <GhostButton onClick={() => Notification.requestPermission()} data-testid="enable-push-btn">Enable browser alerts</GhostButton>}
        <GhostButton onClick={readAll} data-testid="mark-all-read-btn"><CheckCheck size={15} />Mark all read</GhostButton></>} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">{cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`h-8 whitespace-nowrap rounded-full px-3 text-xs font-semibold capitalize ${cat === c ? "bg-ink text-[var(--c-surface)]" : "border bg-surface text-sub"}`} data-testid={`notif-cat-${c}`}>{c}</button>)}</div>
      {!data ? <Spinner /> : !items.length ? <Empty icon={Bell} title="You're all caught up" /> : (
        <div className="card divide-y overflow-hidden">
          {items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 p-4 text-left hover:bg-surface2 ${n.read ? "" : "bg-soft-red"}`} data-testid={`notification-${n.id}`}>
              {n.actor_id && userMap[n.actor_id] ? <Avatar user={userMap[n.actor_id]} size={36} showStatus={false} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2"><Bell size={15} /></span>}
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="block truncate text-sm text-sub">{n.body}</span>}<span className="mt-0.5 block text-[11px] text-sub">{rel(n.created_at)} · {n.category}</span></span>
              {!n.read && <span className="mt-2 h-2 w-2 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
