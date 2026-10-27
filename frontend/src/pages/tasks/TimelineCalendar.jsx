import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Avatar } from "../../components/common";

const colorOf = (t, labelMap) => t.card_color || labelMap[t.label_ids?.[0]]?.color || "var(--c-accent2)";

export function Timeline({ tasks, onOpen }) {
  const { labelMap, userMap } = useApp();
  const [start, setStart] = useState(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7));
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const W = 36;
  const rows = tasks.filter((t) => t.deadline || t.start_date);
  return (
    <div className="card overflow-hidden" data-testid="task-timeline">
      <div className="flex items-center justify-between border-b p-3"><p className="text-sm font-semibold">{format(start, "d MMM")} – {format(days[34], "d MMM yyyy")}</p>
        <div className="flex gap-1"><button onClick={() => setStart(addDays(start, -14))} className="btn-ghost flex h-9 w-9 items-center justify-center" aria-label="Previous" data-testid="timeline-prev"><ChevronLeft size={16} /></button><button onClick={() => setStart(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7))} className="btn-ghost h-9 px-3 text-xs font-semibold">Today</button><button onClick={() => setStart(addDays(start, 14))} className="btn-ghost flex h-9 w-9 items-center justify-center" aria-label="Next" data-testid="timeline-next"><ChevronRight size={16} /></button></div></div>
      <div className="overflow-x-auto scroll-thin">
        <div style={{ width: 220 + W * 35 }}>
          <div className="flex border-b text-[10px] text-sub"><div className="w-[220px] shrink-0 p-2 font-semibold">Task</div>{days.map((d) => <div key={d} style={{ width: W }} className={`shrink-0 py-2 text-center ${isToday(d) ? "font-bold text-brand" : ""}`}>{format(d, "d")}<br />{format(d, "EEEEE")}</div>)}</div>
          {rows.map((t) => {
            const s = new Date(t.start_date || t.deadline);
            const e = new Date(t.deadline || t.start_date);
            const off = differenceInCalendarDays(s, start);
            const len = Math.max(1, differenceInCalendarDays(e, s) + 1);
            return (
              <div key={t.id} className="flex items-center border-b last:border-0 hover:bg-surface2">
                <button onClick={() => onOpen(t.id)} className="flex w-[220px] shrink-0 items-center gap-2 truncate p-2 text-left text-sm"><Avatar user={userMap[t.assignee_id]} size={20} showStatus={false} /><span className="truncate">{t.title}</span></button>
                <div className="relative h-10" style={{ width: W * 35 }}>
                  {off + len > 0 && off < 35 && <button onClick={() => onOpen(t.id)} className="absolute top-2 h-6 rounded-full px-2 text-left text-[10px] font-semibold text-white truncate" style={{ left: Math.max(0, off) * W + 2, width: Math.min(len, 35 - Math.max(0, off)) * W - 4, background: colorOf(t, labelMap) }} data-testid={`timeline-bar-${t.id}`}>{t.number_str}</button>}
                </div>
              </div>
            );
          })}
          {!rows.length && <p className="p-6 text-sm text-sub">Tasks with dates appear on the timeline.</p>}
        </div>
      </div>
    </div>
  );
}

export function Calendar({ tasks, onOpen }) {
  const { labelMap } = useApp();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const days = useMemo(() => { const s = startOfWeek(month, { weekStartsOn: 1 }); const e = endOfWeek(endOfMonth(month), { weekStartsOn: 1 }); return Array.from({ length: differenceInCalendarDays(e, s) + 1 }, (_, i) => addDays(s, i)); }, [month]);
  const byDay = useMemo(() => { const m = {}; tasks.forEach((t) => { if (t.deadline) (m[format(new Date(t.deadline), "yyyy-MM-dd")] ||= []).push(t); }); return m; }, [tasks]);
  return (
    <div className="card overflow-hidden" data-testid="task-calendar">
      <div className="flex items-center justify-between border-b p-3"><p className="font-semibold">{format(month, "MMMM yyyy")}</p>
        <div className="flex gap-1"><button onClick={() => setMonth(startOfMonth(addDays(month, -1)))} className="btn-ghost flex h-9 w-9 items-center justify-center" aria-label="Previous month" data-testid="calendar-prev"><ChevronLeft size={16} /></button><button onClick={() => setMonth(startOfMonth(new Date()))} className="btn-ghost h-9 px-3 text-xs font-semibold">Today</button><button onClick={() => setMonth(startOfMonth(addDays(endOfMonth(month), 1)))} className="btn-ghost flex h-9 w-9 items-center justify-center" aria-label="Next month" data-testid="calendar-next"><ChevronRight size={16} /></button></div></div>
      <div className="grid grid-cols-7 border-b text-center text-[11px] font-semibold text-sub">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d) => { const list = byDay[format(d, "yyyy-MM-dd")] || []; return (
          <div key={d} className={`min-h-[72px] border-b border-r p-1 sm:min-h-[104px] ${isSameMonth(d, month) ? "" : "bg-surface2 opacity-60"}`}>
            <p className={`mb-1 text-[11px] font-semibold ${isToday(d) ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white" : "text-sub"}`}>{format(d, "d")}</p>
            {list.slice(0, 3).map((t) => <button key={t.id} onClick={() => onOpen(t.id)} className="mb-0.5 block w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${colorOf(t, labelMap)} 18%, transparent)`, color: "var(--c-text)" }} data-testid={`calendar-task-${t.id}`}>{t.title}</button>)}
            {list.length > 3 && <p className="text-[10px] text-sub">+{list.length - 3} more</p>}
          </div>); })}
      </div>
    </div>
  );
}
