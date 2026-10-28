import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { Avatar, rel } from "./common";

export function NotificationList({ onNavigate }) {
  const { setUnread, userMap, subscribe } = useApp();
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const navigate = useNavigate();
  const load = () => api.get("/notifications").then((r) => { setData(r.data); setUnread(r.data.unread); });
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => subscribe((e) => e.type === "notification" && load()), [subscribe]); // eslint-disable-line
  const open = async (n) => { await api.post(`/notifications/${n.id}/read`); load(); if (n.link) { navigate(n.link); onNavigate?.(); } };
  const cats = ["all", ...new Set((data?.items || []).map((n) => n.category))];
  const items = (data?.items || []).filter((n) => cat === "all" || n.category === cat);
  return (
    <div className="flex h-full flex-col" data-testid="notification-list">
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <div><p className="font-bold">Notifikasi</p><p className="text-xs text-sub">{data ? `${data.unread} belum dibaca` : ""}</p></div>
        <div className="flex items-center gap-1">
          {"Notification" in window && Notification.permission === "default" && <button onClick={() => Notification.requestPermission()} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" data-testid="enable-push-btn">Aktifkan alert</button>}
          <button onClick={() => api.post("/notifications/read-all").then(load)} className="btn-ghost flex h-9 items-center gap-1 px-2.5 text-xs font-semibold" data-testid="mark-all-read-btn"><CheckCheck size={14} />Tandai semua</button>
          {onNavigate && <button onClick={onNavigate} className="btn-ghost flex h-9 w-9 items-center justify-center" aria-label="Tutup" data-testid="close-notifications-btn"><X size={16} /></button>}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 no-scrollbar">{cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`h-7 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold capitalize ${cat === c ? "bg-ink text-[var(--c-surface)]" : "bg-surface2 text-sub"}`} data-testid={`notif-cat-${c}`}>{c}</button>)}</div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {data && !items.length && <div className="p-10 text-center text-sm text-sub"><Bell className="mx-auto mb-2" size={22} />Semua sudah terbaca</div>}
        {items.map((n) => (
          <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-surface2 ${n.read ? "" : "bg-soft-red"}`} data-testid={`notification-${n.id}`}>
            {n.actor_id && userMap[n.actor_id] ? <Avatar user={userMap[n.actor_id]} size={32} showStatus={false} /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2"><Bell size={14} /></span>}
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{n.title}</span>{n.body && <span className="block truncate text-xs text-sub">{n.body}</span>}<span className="mt-0.5 block text-[10px] text-sub">{rel(n.created_at)}</span></span>
            {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NotificationRail({ open, setOpen }) {
  const { unread } = useApp();
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 md:flex" data-testid="notification-rail">
      {open && <div className="fixed right-[60px] top-0 z-40 h-screen w-[360px] border-l bg-surface shadow-2xl animate-rise"><NotificationList onNavigate={() => setOpen(false)} /></div>}
      <div className="flex w-[60px] flex-col items-center border-l bg-sidebar pt-4">
        <button onClick={() => setOpen(!open)} className={`relative flex h-11 w-11 items-center justify-center rounded-2xl ${open ? "tint-accent" : "hover:bg-surface2 text-sub"}`} aria-label="Notifikasi" data-testid="notification-rail-btn">
          <Bell size={20} className={unread > 0 && !open ? "animate-[float_1.2s_ease-in-out_infinite] text-brand" : ""} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white" data-testid="unread-count">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </div>
    </aside>
  );
}
