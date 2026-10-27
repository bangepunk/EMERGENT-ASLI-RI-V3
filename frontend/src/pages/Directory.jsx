import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, LayoutGrid, List, MessageCircle, MapPin } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import { Avatar, PageHeader, Empty } from "../components/common";

function Select({ value, onChange, options, label, testid }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testid} className="h-10 rounded-full border bg-surface px-3 text-sm">
      <option value="">{label}</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function Directory() {
  const { users, online } = useApp();
  const [q, setQ] = useState("");
  const [f, setF] = useState({ department: "", division: "", team: "", city: "", skill: "", employment_status: "", work_mode: "" });
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("az");
  const navigate = useNavigate();
  const opts = (k) => [...new Set(users.map((u) => u[k]).filter(Boolean))].sort();
  const skills = [...new Set(users.flatMap((u) => u.skills || []))].sort();
  const list = useMemo(() => users.filter((u) => {
    const s = q.toLowerCase();
    if (s && !`${u.name} ${u.job_title}`.toLowerCase().includes(s)) return false;
    if (f.skill && !(u.skills || []).includes(f.skill)) return false;
    return ["department", "division", "team", "city", "employment_status", "work_mode"].every((k) => !f[k] || u[k] === f[k]);
  }).sort((a, b) => (sort === "az" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))), [users, q, f, sort]);
  const dm = async (uid) => { const { data } = await api.post("/conversations/dm", { user_id: uid }); navigate(`/messages/${data.id}`); };
  const loc = (u) => [u.office || u.city, u.work_mode].filter(Boolean).join(" · ");
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="directory-page">
      <PageHeader icon={Users} title="Employee Directory" subtitle={`${users.length} people in your workspace`} actions={
        <div className="flex rounded-full border bg-surface p-1">{[["grid", LayoutGrid], ["list", List]].map(([k, I]) => <button key={k} onClick={() => setView(k)} className={`flex h-8 w-9 items-center justify-center rounded-full ${view === k ? "bg-ink text-[var(--c-surface)]" : "text-sub"}`} aria-label={`${k} view`} data-testid={`directory-view-${k}`}><I size={15} /></button>)}</div>} />
      <div className="mb-6 flex flex-wrap gap-2">
        <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-full border bg-surface px-4"><Search size={15} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or job title" className="flex-1 bg-transparent text-sm outline-none" data-testid="directory-search-input" /></div>
        <Select value={f.department} onChange={(v) => setF({ ...f, department: v })} options={opts("department")} label="Department" testid="filter-department" />
        <Select value={f.division} onChange={(v) => setF({ ...f, division: v })} options={opts("division")} label="Division" testid="filter-division" />
        <Select value={f.team} onChange={(v) => setF({ ...f, team: v })} options={opts("team")} label="Team" testid="filter-team" />
        <Select value={f.city} onChange={(v) => setF({ ...f, city: v })} options={opts("city")} label="Location" testid="filter-location" />
        <Select value={f.work_mode} onChange={(v) => setF({ ...f, work_mode: v })} options={opts("work_mode")} label="Work mode" testid="filter-work-mode" />
        <Select value={f.skill} onChange={(v) => setF({ ...f, skill: v })} options={skills} label="Skill" testid="filter-skill" />
        <Select value={f.employment_status} onChange={(v) => setF({ ...f, employment_status: v })} options={opts("employment_status")} label="Status" testid="filter-employment-status" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-full border bg-surface px-3 text-sm" data-testid="directory-sort"><option value="az">A → Z</option><option value="za">Z → A</option></select>
      </div>
      {!list.length ? <Empty icon={Users} title="No one matches" text="Try different filters." /> : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((u) => (
            <div key={u.user_id} className="card flex flex-col p-5 transition-transform hover:-translate-y-0.5" data-testid={`employee-card-${u.user_id}`}>
              <div className="flex items-center gap-3"><Avatar user={u} size={52} /><div className="min-w-0"><p className="truncate font-bold">{u.name}</p><p className="truncate text-sm text-sub">{u.job_title || "—"}</p></div></div>
              <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                {u.department && <span className="rounded-full bg-soft-blue px-2.5 py-1 font-medium">{u.department}</span>}
                {loc(u) && <span className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-sub"><MapPin size={11} />{loc(u)}</span>}
                <span className={`rounded-full px-2.5 py-1 font-medium ${online.has(u.user_id) ? "bg-soft-green text-emerald-700 dark:text-emerald-300" : "bg-surface2 text-sub"}`}>{online.has(u.user_id) ? "Online" : "Offline"}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => dm(u.user_id)} className="btn-ghost flex h-10 items-center justify-center gap-1.5 border text-sm font-semibold" data-testid={`message-employee-${u.user_id}`}><MessageCircle size={14} />Message</button>
                <button onClick={() => navigate(`/people/${u.user_id}`)} className="btn-accent h-10 text-sm font-semibold" data-testid={`view-profile-${u.user_id}`}>Profile</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card divide-y overflow-hidden">
          {list.map((u) => (
            <div key={u.user_id} className="flex items-center gap-3 px-4 py-3" data-testid={`employee-row-${u.user_id}`}>
              <Avatar user={u} size={38} />
              <button onClick={() => navigate(`/people/${u.user_id}`)} className="min-w-0 flex-1 text-left"><p className="truncate font-semibold">{u.name}</p><p className="truncate text-xs text-sub">{u.job_title} · {u.department}</p></button>
              <span className="hidden text-sm text-sub md:block w-48 truncate">{loc(u)}</span>
              <button onClick={() => dm(u.user_id)} className="btn-ghost flex h-10 w-10 items-center justify-center" aria-label="Message"><MessageCircle size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
