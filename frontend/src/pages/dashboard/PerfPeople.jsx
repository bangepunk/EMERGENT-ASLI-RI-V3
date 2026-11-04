import { Avatar } from "../../components/common";
import { useApp } from "../../context/AppContext";

export const LOAD = { santai: ["😎", "Santai"], normal: ["🙂", "Normal"], padat: ["😰", "Padat"], overload: ["🥵", "Overload"] };
export const STATE = { on_time: ["Tepat waktu", "bg-emerald-100 text-emerald-700"], done: ["Selesai", "bg-emerald-100 text-emerald-700"], late: ["Terlambat", "bg-amber-100 text-amber-700"], overdue: ["Overdue", "bg-rose-100 text-rose-700"], pending: ["Pending", "bg-sky-100 text-sky-700"] };
const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const dayLabel = (iso) => { const [, mm, dd] = iso.split("-"); return `${Number(dd)} ${SHORT[Number(mm) - 1]}`; };

export function Tip({ text, children, className = "" }) {
  return (
    <span className={`group/tip relative ${className}`}>
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-pre rounded-lg bg-[#20283B] px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-white shadow-lg group-hover/tip:block">{text}</span>
    </span>
  );
}

export function Bar({ value, tone = "bg-brand", h = "h-2" }) {
  return <span className={`block w-full overflow-hidden rounded-full bg-surface2 ${h}`}><span className={`block h-full rounded-full transition-[width] duration-700 ${tone}`} style={{ width: `${Math.min(100, value || 0)}%` }} /></span>;
}

export function KpiBadge({ e, kpi, min, testid }) {
  const none = e.on_time_rate == null || e.due < min;
  const ok = !none && e.on_time_rate >= kpi;
  const cls = none ? "bg-surface2 text-sub" : ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
  return (
    <Tip text={`${e.on_time} tepat waktu · ${e.late} terlambat\n${e.due} tugas sudah jatuh tempo · target ${kpi}%`}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${cls}`} data-testid={testid}>{none ? "Belum cukup data" : `${e.on_time_rate}% on-time`}</span>
    </Tip>
  );
}

export function EmployeeCards({ data, who, setWho }) {
  const { userMap } = useApp();
  if (!data.employees.length) return <p className="text-sm text-sub" data-testid="perf-no-employees">Belum ada tugas yang ditugaskan di bulan ini.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="perf-employee-cards">
      {data.employees.map((e) => {
        const [emo, lbl] = LOAD[e.load];
        return (
          <button key={e.user_id} onClick={() => setWho(who === e.user_id ? "" : e.user_id)} className={`rounded-2xl border bg-surface p-3.5 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md ${who === e.user_id ? "ring-2 ring-[var(--c-accent)]" : ""}`} data-testid={`perf-card-${e.user_id}`}>
            <div className="flex items-center gap-2.5">
              <Avatar user={userMap[e.user_id]} size={36} showStatus={false} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{userMap[e.user_id]?.name || "—"}</p><p className="text-xs text-sub">{e.total} tugas · {e.done} selesai · {e.total - e.done} belum</p></div>
              <Tip text={`${e.day_deadlines} deadline pada ${dayLabel(data.day)}`}><span className="flex flex-col items-center" data-testid={`perf-load-${e.user_id}`}><span className="text-2xl leading-none">{emo}</span><span className="text-[10px] font-semibold text-sub">{lbl}</span></span></Tip>
            </div>
            <div className="mt-3 flex items-center gap-2"><Tip className="flex-1" text={`${e.done} dari ${e.total} tugas selesai`}><Bar value={e.completion_pct} tone={e.completion_pct === 100 ? "bg-emerald-500" : "bg-sky-500"} /></Tip><span className="w-9 text-right text-xs font-bold">{e.completion_pct}%</span></div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><KpiBadge e={e} kpi={data.kpi_target} min={data.min_data} testid={`perf-kpi-${e.user_id}`} />{e.overdue > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white" data-testid={`perf-overdue-${e.user_id}`}>{e.overdue} overdue</span>}</div>
          </button>
        );
      })}
    </div>
  );
}

export function TaskLines({ tasks, showUser, testid }) {
  const { userMap } = useApp();
  if (!tasks.length) return <p className="text-sm text-sub">Tidak ada tugas.</p>;
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto scroll-thin" data-testid={testid}>
      {tasks.map((t) => { const [l, c] = STATE[t.state]; return (
        <li key={t.id}><a href={`/tasks?task=${t.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface2">
          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
          {showUser && <span className="hidden w-16 truncate text-right text-xs text-sub sm:block">{userMap[t.assignee_id]?.name?.split(" ")[0]}</span>}
          {t.day && !showUser && <span className="text-xs text-sub">{dayLabel(t.day)}</span>}
          {t.progress != null && <span className="text-xs font-semibold text-sub">{t.progress}%</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{l}</span>
        </a></li>); })}
    </ul>
  );
}

export function Distribution({ data }) {
  const { userMap } = useApp();
  const es = data.employees;
  if (!es.length) return null;
  const max = Math.max(...es.map((e) => e.total));
  const avg = es.reduce((s, e) => s + e.total, 0) / es.length;
  return (
    <div data-testid="perf-distribution">
      <div className="mb-2 flex items-baseline justify-between"><h4 className="text-sm font-bold">Distribusi beban kerja</h4><span className="text-xs text-sub">rata-rata {avg.toFixed(1)} tugas/orang</span></div>
      <div className="space-y-2">{es.map((e) => (
        <div key={e.user_id} className="flex items-center gap-2">
          <span className="w-20 truncate text-xs font-medium">{userMap[e.user_id]?.name?.split(" ")[0]}</span>
          <Tip className="flex-1" text={`${e.total} tugas: ${e.done} selesai, ${e.total - e.done - e.overdue} berjalan, ${e.overdue} overdue`}>
            <span className="flex h-3 overflow-hidden rounded-full bg-surface2" style={{ width: `${Math.max(8, (e.total / max) * 100)}%` }}>
              <span className="bg-emerald-500" style={{ width: `${(e.done / e.total) * 100}%` }} /><span className="bg-amber-400" style={{ width: `${((e.total - e.done - e.overdue) / e.total) * 100}%` }} /><span className="bg-rose-500" style={{ width: `${(e.overdue / e.total) * 100}%` }} />
            </span>
          </Tip>
          <span className="w-6 text-right text-xs font-bold">{e.total}</span>
          {e.total > avg * 1.5 && es.length > 1 && <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700" data-testid={`perf-imbalance-${e.user_id}`}>tinggi</span>}
        </div>))}</div>
      <div className="mt-2 flex gap-3 text-[11px] text-sub"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Selesai</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />Berjalan</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" />Overdue</span></div>
    </div>
  );
}

export function Trend({ data }) {
  const kpi = data.kpi_target;
  return (
    <div data-testid="perf-trend">
      <div className="mb-2 flex items-baseline justify-between"><h4 className="text-sm font-bold">Tren on-time rate</h4><span className="text-xs text-sub">garis = target {kpi}%</span></div>
      <div className="relative flex h-32 items-end gap-2 border-b pb-0.5">
        <span className="absolute inset-x-0 border-t border-dashed border-rose-400" style={{ bottom: `${kpi}%` }} />
        {data.trend.map((t) => { const [yy, mm] = t.month.split("-"); const v = t.on_time_rate; return (
          <Tip key={t.month} className="flex h-full flex-1 flex-col justify-end" text={v == null ? `${SHORT[mm - 1]} ${yy}: belum ada data` : `${SHORT[mm - 1]} ${yy}: ${v}%\n${t.on_time}/${t.due} tepat waktu`}>
            <span className={`block w-full rounded-t-lg ${v == null ? "bg-surface2" : v >= kpi ? "bg-emerald-500" : "bg-rose-400"}`} style={{ height: `${v == null ? 4 : Math.max(4, v)}%` }} data-testid={`perf-trend-${t.month}`} />
          </Tip>); })}
      </div>
      <div className="mt-1 flex gap-2">{data.trend.map((t) => <span key={t.month} className="flex-1 text-center text-[10px] text-sub">{SHORT[Number(t.month.split("-")[1]) - 1]}</span>)}</div>
    </div>
  );
}
