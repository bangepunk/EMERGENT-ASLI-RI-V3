import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, MessageCircle, MapPin } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { Avatar, PageHeader, Empty } from "../components/common";

export default function Directory() {
  const { users, online } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);
  const navigate = useNavigate();
  const divisions = useMemo(() => [...new Set(users.map((u) => u.department || "Lainnya"))].sort(), [users]);
  const list = users.filter((u) => (!sel.length || sel.includes(u.department || "Lainnya")) && `${u.name} ${u.job_title}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (d) => setSel(sel.includes(d) ? sel.filter((x) => x !== d) : [...sel, d]);
  const dm = async (uid) => { const { data } = await api.post("/conversations/dm", { user_id: uid }); navigate(`/messages/${data.id}`); };
  const chip = (on) => `h-10 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-brand text-white" : "border bg-surface text-sub hover:text-ink"}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="directory-page">
      <PageHeader icon={Users} title="Employee Directory" subtitle={`${list.length} dari ${users.length} orang`} />
      <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="division-tabs">
        <button onClick={() => setSel([])} className={chip(!sel.length)} data-testid="division-tab-all">Semua</button>
        {divisions.map((d) => <button key={d} onClick={() => toggle(d)} className={chip(sel.includes(d))} data-testid={`division-tab-${d.replace(/\s/g, "-")}`}>{d} <span className="opacity-70">{users.filter((u) => (u.department || "Lainnya") === d).length}</span></button>)}
        <div className="ml-auto flex h-10 w-full items-center gap-2 rounded-full border bg-surface px-4 sm:w-64"><Search size={15} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama…" className="flex-1 bg-transparent text-sm outline-none" data-testid="directory-search-input" /></div>
      </div>
      {!list.length ? <Empty icon={Users} title="Tidak ada karyawan" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((u) => (
            <div key={u.user_id} className="card flex flex-col p-5" data-testid={`employee-card-${u.user_id}`}>
              <button onClick={() => navigate(`/people/${u.user_id}`)} className="flex items-center gap-3 text-left"><Avatar user={u} size={52} /><div className="min-w-0"><p className="truncate font-bold">{u.name}{u.nickname && <span className="font-medium text-sub"> ({u.nickname})</span>}</p><p className="truncate text-sm text-sub">{u.job_title || "—"}</p></div></button>
              <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                {u.department && <span className="rounded-full bg-soft-blue px-2.5 py-1 font-medium">{u.department}</span>}
                {u.company && <span className="rounded-full bg-soft-purple px-2.5 py-1 font-medium" data-testid={`employee-company-${u.user_id}`}>{u.company}</span>}
                {(u.office || u.city) && <span className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-sub"><MapPin size={11} />{u.office || u.city}{u.work_mode ? ` · ${u.work_mode}` : ""}</span>}
                <span className={`rounded-full px-2.5 py-1 font-medium ${online.has(u.user_id) ? "bg-soft-green text-emerald-700 dark:text-emerald-300" : "bg-surface2 text-sub"}`}>{online.has(u.user_id) ? "Online" : "Offline"}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => dm(u.user_id)} className="btn-ghost flex h-10 items-center justify-center gap-1.5 border text-sm font-semibold" data-testid={`message-employee-${u.user_id}`}><MessageCircle size={14} />Message</button>
                <button onClick={() => navigate(`/people/${u.user_id}`)} className="btn-accent h-10 text-sm font-semibold" data-testid={`view-profile-${u.user_id}`}>Profile</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
