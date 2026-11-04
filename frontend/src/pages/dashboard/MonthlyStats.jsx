import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TrendingUp, LineChart as LineIcon, BarChart3, Users, Filter, MessageSquare, ArrowRight } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useApp } from "../../context/AppContext";
import { api } from "../../lib/api";
import { Avatar } from "../../components/common";

const WD = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const WD_FULL = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const GREEN = "#4CB782";
const RED = "#E5484D";
const STATUS = { optimal: ["😄", "Optimal", "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10"], stabil: ["😐", "Stabil", "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-500/10"], pressure: ["😰", "Under Pressure", "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10"] };
const seg = (on) => `h-9 rounded-xl px-3.5 text-sm font-semibold transition-colors ${on ? "bg-surface text-ink shadow-sm" : "text-sub hover:text-ink"}`;

function StatCard({ label, value, note, tone, testid }) {
  const t = { green: "border-emerald-100 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200", red: "border-rose-100 bg-rose-50/70 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200", gray: "border bg-surface2/60 text-ink" }[tone];
  return <div className={`rounded-2xl border p-5 ${t}`} data-testid={testid}><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-sm opacity-80">{note}</p></div>;
}

function TeamChart({ data, type }) {
  const rows = data.series.map((s, i) => { const d = new Date(`${s.start}T00:00:00`); return { name: data.range === "4w" ? `${d.getDate()} ${MON[d.getMonth()]}` : WD_FULL[i], Selesai: s.done, Overdue: s.overdue }; });
  const common = { data: rows, margin: { top: 10, right: 12, left: -18, bottom: 0 } };
  const axes = [<CartesianGrid key="g" strokeDasharray="3 6" vertical={false} stroke="var(--c-border, #E5E7EB)" />, <XAxis key="x" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--c-sub, #7A8194)" }} />, <YAxis key="y" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--c-sub, #7A8194)" }} />, <Tooltip key="t" cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />];
  return (
    <div className="h-64 sm:h-72" data-testid="team-chart">
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" ? <LineChart {...common}>{axes}<Line type="monotone" dataKey="Selesai" stroke={GREEN} strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="Overdue" stroke={RED} strokeWidth={3} dot={{ r: 3 }} /></LineChart>
          : <BarChart {...common}>{axes}<Bar dataKey="Selesai" fill={GREEN} radius={[6, 6, 0, 0]} maxBarSize={28} /><Bar dataKey="Overdue" fill={RED} radius={[6, 6, 0, 0]} maxBarSize={28} /></BarChart>}
      </ResponsiveContainer>
    </div>
  );
}

const Dot = ({ c, label }) => <span className="flex items-center gap-2 text-sm text-sub"><i className="h-3 w-3 rounded-full" style={{ background: c }} />{label}</span>;

function TeamPerformance({ data, anchor, setAnchor, range, setRange }) {
  const [type, setType] = useState("line");
  const s = data.summary;
  return (
    <section className="card min-w-0 p-5 sm:p-6 md:col-span-2 xl:col-span-3 animate-rise" data-testid="widget-stats">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h3 className="flex items-center gap-2.5 text-xl font-bold"><TrendingUp size={20} className="text-emerald-500" />Performa & Beban Kerja Tim</h3><p className="mt-1 text-sm text-sub">Monitoring penyelesaian tugas dan ketepatan waktu operasional.</p></div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="grid w-full grid-cols-7 gap-1 rounded-2xl bg-surface2 p-1.5 sm:w-auto" data-testid="team-day-picker">
            {data.week.map((d, i) => { const on = d === anchor; return (
              <button key={d} onClick={() => setAnchor(d)} className={`flex min-w-0 flex-col items-center rounded-xl px-1 py-1.5 transition-colors sm:px-3 ${on ? "bg-[#2563EB] text-white shadow" : "text-sub hover:text-ink"}`} data-testid={`team-day-${d}`}>
                <span className="text-[11px] font-medium">{WD[i]}</span><span className={`text-base font-bold ${on ? "" : "text-ink"} ${d === data.today && !on ? "underline decoration-2 underline-offset-4" : ""}`}>{Number(d.slice(8))}</span>
              </button>); })}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-2xl bg-surface2 p-1"><button onClick={() => setRange("7d")} className={seg(range === "7d")} data-testid="team-range-7d">7 Hari</button><button onClick={() => setRange("4w")} className={seg(range === "4w")} data-testid="team-range-4w">4 Minggu</button></div>
            <div className="flex rounded-2xl bg-surface2 p-1"><button onClick={() => setType("line")} className={`${seg(type === "line")} px-2.5`} aria-label="Grafik garis" data-testid="team-chart-line"><LineIcon size={16} /></button><button onClick={() => setType("bar")} className={`${seg(type === "bar")} px-2.5`} aria-label="Grafik batang" data-testid="team-chart-bar"><BarChart3 size={16} /></button></div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard tone="green" label="Tugas Selesai" value={s.done} note={s.done ? `${s.done} tugas diselesaikan` : "Belum ada tugas selesai"} testid="team-stat-done" />
        <StatCard tone="red" label="Lewat Tenggat" value={s.overdue} note={s.overdue ? `${s.overdue} tugas melewati deadline` : "Tidak ada keterlambatan"} testid="team-stat-overdue" />
        <StatCard tone="gray" label="Ketepatan Waktu" value={`${s.on_time_rate ?? 0}%`} note={s.due ? `${s.on_time} dari ${s.due} tugas tepat waktu` : "Belum ada data tugas"} testid="team-stat-ontime" />
      </div>
      <div className="mt-6 flex justify-end gap-5"><Dot c={GREEN} label="Tasks Selesai" /><Dot c={RED} label="Tasks Overdue" /></div>
      <TeamChart data={data} type={type} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4"><div className="flex gap-5"><Dot c={GREEN} label="Output Selesai" /><Dot c={RED} label="Overdue" /></div><span className="text-sm text-sub">Diperbarui otomatis dari papan tugas</span></div>
    </section>
  );
}

function PersonCard({ p }) {
  const { userMap } = useApp();
  const navigate = useNavigate();
  const usr = userMap[p.user_id];
  const [emo, lbl, cls] = STATUS[p.status];
  const dm = async () => { const { data } = await api.post("/conversations/dm", { user_id: p.user_id }); navigate(`/messages/${data.id}`); };
  return (
    <div className="flex flex-col rounded-3xl border bg-surface p-5 transition-shadow hover:shadow-md" data-testid={`person-card-${p.user_id}`}>
      <div className="flex items-start gap-3">
        <Avatar user={usr} size={52} />
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{usr?.name}</p><p className="truncate text-sm text-sub">{usr?.job_title || "—"}</p><p className="truncate text-xs text-sub opacity-80">{usr?.department || "Tanpa divisi"}</p></div>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`} title={`${p.day_deadlines} deadline pada hari terpilih`} data-testid={`person-status-${p.user_id}`}>{emo} {lbl}</span>
      </div>
      <div className="mt-4 flex justify-between text-sm"><span className="font-medium text-sub">Beban Tugas Aktif</span><span className="font-semibold" data-testid={`person-load-${p.user_id}`}>{p.active} tugas ({p.share}%)</span></div>
      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full bg-[#2563EB] transition-[width] duration-700" style={{ width: `${p.share}%` }} /></span>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-sub">Tugas sedang berjalan:</p>
      <div className="mt-2 flex-1 space-y-1">{p.tasks.length ? p.tasks.map((t) => <Link key={t.id} to={`/tasks?task=${t.id}`} className="block truncate text-sm hover:text-brand">• {t.title}</Link>) : <p className="text-sm italic text-sub">Tidak ada tugas aktif saat ini.</p>}{p.more > 0 && <p className="text-xs text-sub">+{p.more} tugas lainnya</p>}</div>
      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <button onClick={dm} className="flex items-center gap-1.5 text-sm font-semibold" data-testid={`person-message-${p.user_id}`}><MessageSquare size={15} />Kirim Pesan</button>
        <Link to={`/tasks?assignee=${p.user_id}&kanban=1`} className="flex items-center gap-1 text-sm font-semibold text-[#2563EB]" data-testid={`person-kanban-${p.user_id}`}>Lihat di Kanban<ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}

function Personnel({ data }) {
  const { userMap } = useApp();
  const [div, setDiv] = useState("");
  const [all, setAll] = useState(false);
  const depts = [...new Set(data.people.map((p) => userMap[p.user_id]?.department).filter(Boolean))].sort();
  const people = data.people.filter((p) => userMap[p.user_id] && (!div || userMap[p.user_id].department === div));
  const count = (k) => people.filter((p) => p.status === k).length;
  return (
    <section className="card min-w-0 p-5 sm:p-6 md:col-span-2 xl:col-span-3 animate-rise" data-testid="widget-personnel">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div><h3 className="flex items-center gap-2.5 text-xl font-bold"><Users size={20} className="text-[#2563EB]" />Kapasitas & Beban Kerja Personel</h3><p className="mt-1 text-sm text-sub">Monitoring distribusi tugas aktif dan indikator tekanan kerja tim secara proporsional.</p></div>
        <div className="flex flex-wrap gap-2">{Object.entries(STATUS).map(([k, [e, l, c]]) => <span key={k} className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold ${c}`} data-testid={`personnel-count-${k}`}>{e} {count(k)} {l}</span>)}</div>
      </div>
      {depts.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="personnel-division-filter">
        <span className="flex items-center gap-1.5 text-sm text-sub"><Filter size={14} />Divisi:</span>
        {[["", "Semua Divisi"], ...depts.map((d) => [d, d])].map(([k, l]) => <button key={k || "all"} onClick={() => setDiv(k)} className={`h-10 rounded-2xl px-4 text-sm font-semibold transition-colors ${div === k ? "bg-ink text-[var(--c-surface)]" : "bg-surface2 text-ink hover:bg-surface2/70"}`} data-testid={`personnel-div-${k ? k.replace(/\s/g, "-") : "all"}`}>{l}</button>)}
      </div>}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(all ? people : people.slice(0, 6)).map((p) => <PersonCard key={p.user_id} p={p} />)}</div>
      {people.length > 6 && <button onClick={() => setAll(!all)} className="mt-4 w-full rounded-2xl border py-2.5 text-sm font-semibold text-sub hover:text-ink" data-testid="personnel-toggle-all">{all ? "Tampilkan lebih sedikit" : `Lihat semua personel (${people.length})`}</button>}
      {!people.length && <p className="mt-5 text-sm text-sub">Belum ada personel di divisi ini.</p>}
    </section>
  );
}

export default function MonthlyStats() {
  const [anchor, setAnchor] = useState(null);
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get("/stats/team", { params: { range, ...(anchor ? { anchor } : {}) } }).then((r) => setData(r.data)).catch(() => setData(false)), [anchor, range]);
  useEffect(() => { load(); }, [load]);
  if (data === false) return <section className="card p-5 md:col-span-2 xl:col-span-3 text-sm text-sub">Statistik tidak bisa dimuat.</section>;
  if (!data) return <section className="card h-72 animate-pulse md:col-span-2 xl:col-span-3" />;
  return (
    <>
      <TeamPerformance data={data} anchor={data.anchor} setAnchor={setAnchor} range={range} setRange={setRange} />
      <Personnel data={data} />
    </>
  );
}
