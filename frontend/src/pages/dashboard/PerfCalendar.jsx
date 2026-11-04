import { useApp } from "../../context/AppContext";
import { Avatar } from "../../components/common";
import { Tip, TaskLines, LOAD, dayLabel, Bar } from "./PerfPeople";

const WD = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const TONE = { none: "bg-surface2 text-sub", done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200", partial: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", overdue: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" };
const DOT = { none: "bg-transparent", done: "bg-emerald-500", partial: "bg-amber-400", overdue: "bg-rose-500" };

function DayDetail({ data }) {
  const { userMap } = useApp();
  const d = data.days.find((x) => x.date === data.day);
  const per = {};
  data.day_tasks.forEach((t) => { per[t.assignee_id] = (per[t.assignee_id] || 0) + 1; });
  const load = (n) => (n <= 1 ? "santai" : n <= 3 ? "normal" : n === 4 ? "padat" : "overload");
  return (
    <div className="rounded-2xl border bg-surface p-4" data-testid="perf-day-detail">
      <div className="flex items-baseline justify-between"><h4 className="font-bold" data-testid="perf-day-title">{dayLabel(data.day)}{data.day === data.today && <span className="ml-1.5 text-xs font-medium text-brand">hari ini</span>}</h4>{d?.progress != null && <span className="text-xs font-semibold text-sub">checkpoint {d.progress}%</span>}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[["Deadline", d?.total || 0, ""], ["Selesai", d?.done || 0, "text-emerald-600"], ["Pending", d?.pending || 0, d?.overdue ? "text-rose-600" : "text-amber-600"]].map(([l, v, c]) => <div key={l} className="rounded-xl bg-surface2 py-2"><p className={`text-lg font-bold ${c}`}>{v}</p><p className="text-[11px] text-sub">{l}</p></div>)}
      </div>
      {d?.progress != null && <div className="mt-3"><Bar value={d.progress} tone={d.status === "done" ? "bg-emerald-500" : "bg-sky-500"} /></div>}
      {Object.keys(per).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" data-testid="perf-day-load">{Object.entries(per).sort((a, b) => b[1] - a[1]).map(([uid, n]) => (
        <Tip key={uid} text={`${n} deadline · ${LOAD[load(n)][1]}`}><span className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-semibold ${n >= 4 ? "border-rose-300 bg-rose-50 dark:bg-rose-500/10" : ""}`}><Avatar user={userMap[uid]} size={20} showStatus={false} />{userMap[uid]?.name?.split(" ")[0]} {n} {LOAD[load(n)][0]}</span></Tip>))}</div>}
      <div className="mt-3 border-t pt-2">{data.day_tasks.length ? <TaskLines tasks={data.day_tasks} showUser testid="perf-day-tasks" /> : <p className="py-3 text-center text-sm text-sub">Tidak ada deadline di tanggal ini.</p>}</div>
    </div>
  );
}

export default function PerfCalendar({ data, setDay }) {
  const lead = (new Date(`${data.days[0].date}T00:00:00`).getDay() + 6) % 7;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div data-testid="perf-calendar">
        <div className="mb-1 grid grid-cols-7 gap-1">{WD.map((w) => <span key={w} className="text-center text-[11px] font-semibold text-sub">{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
          {data.days.map((d) => (
            <Tip key={d.date} text={d.total ? `${dayLabel(d.date)} · ${d.total} deadline\n${d.done} selesai · ${d.pending} pending${d.overdue ? ` (${d.overdue} overdue)` : ""}\nprogres checkpoint ${d.progress}%` : `${dayLabel(d.date)} · tidak ada deadline`}>
              <button onClick={() => setDay(d.date)} className={`flex h-12 w-full flex-col items-center justify-center rounded-xl text-xs font-semibold transition-transform hover:scale-105 sm:h-14 ${TONE[d.status]} ${data.day === d.date ? "ring-2 ring-[var(--c-accent)] ring-offset-1" : ""} ${d.date === data.today ? "underline decoration-2 underline-offset-2" : ""}`} data-testid={`perf-day-${d.date}`}>
                <span>{Number(d.date.slice(8))}</span>
                {d.total > 0 ? <span className="mt-0.5 flex items-center gap-0.5 text-[10px]"><i className={`h-1.5 w-1.5 rounded-full ${DOT[d.status]}`} />{d.done}/{d.total}</span> : <span className="h-3" />}
              </button>
            </Tip>))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-sub">{[["done", "Semua selesai"], ["partial", "Sebagian / berjalan"], ["overdue", "Overdue"], ["none", "Tidak ada deadline"]].map(([k, l]) => <span key={k} className="flex items-center gap-1"><i className={`h-2.5 w-2.5 rounded ${k === "none" ? "bg-surface2" : DOT[k]}`} />{l}</span>)}</div>
      </div>
      <DayDetail data={data} />
    </div>
  );
}
