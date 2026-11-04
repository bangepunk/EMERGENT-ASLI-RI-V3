import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { api, errMsg } from "../../lib/api";
import { Bar, EmployeeCards, Distribution, Trend, TaskLines, dayLabel } from "./PerfPeople";
import PerfCalendar from "./PerfCalendar";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const sel = "h-9 rounded-full border bg-surface px-3 text-sm";

function Stat({ label, value, sub, tone = "", testid }) {
  return <div className="rounded-2xl bg-surface2 px-3.5 py-3" data-testid={testid}><p className="text-[11px] font-semibold uppercase tracking-wide text-sub">{label}</p><p className={`mt-0.5 text-2xl font-bold ${tone}`}>{value}</p>{sub && <div className="mt-1 text-[11px] text-sub">{sub}</div>}</div>;
}

function KpiEditor({ value, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const save = async () => { try { await api.patch("/workspace", { kpi_target: Number(v) }); toast.success("Target KPI disimpan"); setEdit(false); onSaved(); } catch (e) { toast.error(errMsg(e)); } };
  if (!edit) return <button onClick={() => { setV(value); setEdit(true); }} className="flex h-9 items-center gap-1.5 rounded-full border bg-surface px-3 text-sm" data-testid="kpi-edit-btn">Target KPI <b>{value}%</b><Pencil size={12} className="text-sub" /></button>;
  return <span className="flex h-9 items-center gap-1 rounded-full border bg-surface pl-3 pr-1 text-sm">KPI<input type="number" min={1} max={100} value={v} onChange={(e) => setV(e.target.value)} className="w-14 bg-transparent text-right font-bold outline-none" data-testid="kpi-input" />%<button onClick={save} className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white" aria-label="Simpan" data-testid="kpi-save-btn"><Check size={13} /></button><button onClick={() => setEdit(false)} className="flex h-7 w-7 items-center justify-center text-sub" aria-label="Batal"><X size={13} /></button></span>;
}

export default function MonthlyStats() {
  const { me, isManager, isAdmin, users, userMap } = useApp();
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [who, setWho] = useState("");
  const [day, setDay] = useState(null);
  const [data, setData] = useState(null);
  const month = `${y}-${String(m).padStart(2, "0")}`;
  const load = useCallback(() => api.get("/stats/performance", { params: { month, ...(who ? { user_id: who } : {}), ...(day ? { day } : {}) } }).then((r) => setData(r.data)).catch(() => setData(false)), [month, who, day]);
  useEffect(() => { load(); }, [load]);
  const pickMonth = (yy, mm) => { setY(yy); setM(mm); setDay(null); };
  if (data === false) return <p className="text-sm text-sub">Statistik tidak bisa dimuat.</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-surface2" />;
  const s = data.summary;
  const teamOk = s.on_time_rate != null && s.due >= data.min_data ? s.on_time_rate >= data.kpi_target : null;
  const person = who || (!isManager ? me.user_id : "");
  return (
    <div className="space-y-5" data-testid="monthly-stats">
      <div className="flex flex-wrap items-center gap-2">
        <select value={m} onChange={(e) => pickMonth(y, Number(e.target.value))} className={sel} data-testid="perf-month-select">{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
        <select value={y} onChange={(e) => pickMonth(Number(e.target.value), m)} className={sel} data-testid="perf-year-select">{[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        {isManager && <select value={who} onChange={(e) => setWho(e.target.value)} className={sel} data-testid="perf-employee-select"><option value="">Semua karyawan</option>{users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select>}
        <span className="ml-auto">{isAdmin ? <KpiEditor value={data.kpi_target} onSaved={load} /> : <span className="text-sm text-sub">Target KPI <b className="text-ink">{data.kpi_target}%</b></span>}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total tugas" value={s.total} testid="perf-total" />
        <Stat label="Selesai" value={s.done} tone="text-emerald-600" testid="perf-done" />
        <Stat label="Berjalan" value={s.in_progress} tone="text-sky-600" testid="perf-in-progress" />
        <Stat label="Belum dikerjakan" value={s.not_started} testid="perf-not-started" />
        <Stat label="Overdue" value={s.overdue} tone={s.overdue ? "text-rose-600" : ""} sub={s.overdue ? <span className="flex items-center gap-1 font-semibold text-rose-600"><AlertTriangle size={11} />lewat deadline</span> : "aman"} testid="perf-overdue" />
        <Stat label="Penyelesaian" value={`${s.completion_pct}%`} sub={<Bar value={s.completion_pct} h="h-1.5" tone="bg-emerald-500" />} testid="perf-completion" />
        <Stat label={who ? "On-time rate" : "On-time tim"} value={s.on_time_rate == null ? "—" : `${s.on_time_rate}%`} tone={teamOk == null ? "text-sub" : teamOk ? "text-emerald-600" : "text-rose-600"} sub={teamOk == null ? "belum cukup data" : `${s.on_time}/${s.due} tepat waktu · ${teamOk ? "memenuhi" : "di bawah"} KPI`} testid="perf-team-ontime" />
      </div>
      {data.warnings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm dark:bg-rose-500/10" data-testid="perf-workload-warning">
          <AlertTriangle size={16} className="text-rose-500" /><b>Workload warning:</b>
          {data.warnings.slice(0, 4).map((w) => <button key={w.date + w.user_id} onClick={() => setDay(w.date)} className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold hover:underline">{userMap[w.user_id]?.name?.split(" ")[0]} · {w.count} deadline {dayLabel(w.date)} {w.count >= 5 ? "🥵" : "😰"}</button>)}
        </div>
      )}
      <PerfCalendar data={data} setDay={setDay} />
      <div>
        <h4 className="mb-2 text-sm font-bold">Performa karyawan <span className="font-normal text-sub">· status beban per {dayLabel(data.day)}</span></h4>
        <EmployeeCards data={data} who={who} setWho={isManager ? setWho : () => {}} />
      </div>
      {person && data.user_tasks.length > 0 && <div className="rounded-2xl border bg-surface p-4" data-testid="perf-user-tasks"><h4 className="mb-2 text-sm font-bold">Tugas {userMap[person]?.name} bulan ini</h4><TaskLines tasks={data.user_tasks} testid="perf-user-task-list" /></div>}
      <div className="grid gap-5 lg:grid-cols-2"><Distribution data={data} /><Trend data={data} /></div>
    </div>
  );
}
