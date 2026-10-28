import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, addMonths, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { api } from "../../lib/api";
import { Avatar } from "../../components/common";
import { ItemChip } from "../tasks/fields";

const NONE = "Tanpa item";

export default function MonthlyStats() {
  const { me, isManager, users, userMap, statuses } = useApp();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [who, setWho] = useState(isManager ? "" : me.user_id);
  const [item, setItem] = useState(null);
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api.get("/stats/monthly", { params: { month, ...(who ? { user_id: who } : {}) } }).then((r) => setData(r.data)).catch(() => setData({ tasks: [] })); }, [month, who]);
  const doneKeys = statuses.filter((s) => s.is_done).map((s) => s.key);
  const tasks = useMemo(() => data?.tasks || [], [data]);
  const counts = useMemo(() => Object.entries(tasks.reduce((a, t) => ({ ...a, [t.item_type || NONE]: (a[t.item_type || NONE] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]), [tasks]);
  const people = useMemo(() => Object.entries(tasks.reduce((a, t) => ({ ...a, [t.assignee_id]: [...(a[t.assignee_id] || []), t] }), {})).sort((a, b) => b[1].length - a[1].length), [tasks]);
  const shown = item ? tasks.filter((t) => (t.item_type || NONE) === item) : tasks;
  const done = tasks.filter((t) => doneKeys.includes(t.status)).length;
  const shift = (d) => { setItem(null); setMonth(format(addMonths(parseISO(`${month}-01`), d), "yyyy-MM")); };
  return (
    <div data-testid="monthly-stats">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border bg-surface">
          <button onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center text-sub" aria-label="Bulan sebelumnya" data-testid="stats-prev-month"><ChevronLeft size={15} /></button>
          <span className="min-w-[120px] text-center text-sm font-semibold capitalize" data-testid="stats-month-label">{format(parseISO(`${month}-01`), "MMMM yyyy", { locale: idLocale })}</span>
          <button onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center text-sub" aria-label="Bulan berikutnya" data-testid="stats-next-month"><ChevronRight size={15} /></button>
        </div>
        {isManager && <select value={who} onChange={(e) => { setWho(e.target.value); setItem(null); }} className="h-8 rounded-full border bg-surface px-3 text-sm" data-testid="stats-employee-select"><option value="">Semua karyawan</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>}
        <span className="ml-auto text-sm text-sub" data-testid="stats-summary"><b className="text-ink">{tasks.length}</b> item · <b className="text-emerald-600">{done}</b> selesai</span>
      </div>
      {!data ? <div className="h-24 animate-pulse rounded-2xl bg-surface2" /> : !tasks.length ? <p className="text-sm text-sub" data-testid="stats-empty">Belum ada item yang dikerjakan di bulan ini.</p> : <>
        <div className="mb-4 flex flex-wrap gap-2">{counts.map(([n, c]) => (
          <button key={n} onClick={() => setItem(item === n ? null : n)} className={`flex items-center gap-1.5 rounded-full border px-1.5 py-1 transition-opacity ${item && item !== n ? "opacity-40" : ""}`} data-testid={`stats-item-${n.replace(/\s/g, "-")}`}>
            {n === NONE ? <span className="px-1.5 text-xs text-sub">{NONE}</span> : <ItemChip name={n} small />}<span className="pr-1 text-sm font-bold">{c}</span>
          </button>))}</div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {!who && <div className="space-y-1" data-testid="stats-by-employee">{people.map(([uid, ts]) => (
            <button key={uid} onClick={() => setWho(uid)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface2" data-testid={`stats-employee-${uid}`}>
              <Avatar user={userMap[uid]} size={26} showStatus={false} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{userMap[uid]?.name || "—"}</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full bg-brand" style={{ width: `${(ts.length / people[0][1].length) * 100}%` }} /></span><span className="w-6 text-right text-sm font-bold">{ts.length}</span>
            </button>))}</div>}
          <ul className={`max-h-72 space-y-0.5 overflow-y-auto scroll-thin ${who ? "lg:col-span-2" : ""}`} data-testid="stats-task-list">{shown.map((t) => (
            <li key={t.id}><Link to={`/tasks?task=${t.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface2">
              {doneKeys.includes(t.status) ? <CheckCircle2 size={14} className="shrink-0 text-emerald-500" /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2" />}
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>{t.item_type && <ItemChip name={t.item_type} small />}
              {!who && <span className="hidden w-20 truncate text-right text-xs text-sub sm:block">{userMap[t.assignee_id]?.name?.split(" ")[0]}</span>}
            </Link></li>))}</ul>
        </div>
      </>}
    </div>
  );
}
