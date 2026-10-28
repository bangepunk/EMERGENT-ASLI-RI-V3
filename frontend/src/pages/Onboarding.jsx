import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, errMsg } from "../lib/api";
import { Logo } from "../components/common";

const inp = "mt-1 h-11 w-full rounded-xl border bg-surface2 px-3 text-sm outline-none focus:border-[var(--c-accent)]";
const Field = ({ label, req, children }) => <label className="block text-xs font-semibold text-sub">{label}{req && <span className="text-rose-500"> *</span>}{children}</label>;

export default function Onboarding() {
  const { me, ws, setSession, labels } = useApp();
  const [f, setF] = useState({ name: me.name || "", nickname: "", department: "", company: "", job_title: "", phone: "", join_date: "" });
  const [divisions, setDivisions] = useState(ws?.divisions || []);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/workspace").then((r) => setDivisions(r.data.divisions || [])); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = ["name", "nickname", "department", "company", "job_title"].every((k) => f[k].trim());
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const { data } = await api.post("/me/onboarding", f); setSession((s) => ({ ...s, user: data })); toast.success(`Selamat datang, ${data.nickname}!`); } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface2 px-4 py-10" data-testid="onboarding-page">
      <form onSubmit={submit} className="card w-full max-w-xl p-6 sm:p-8">
        <div className="flex items-center gap-3"><Logo ws={ws} size={40} /><div><h1 className="text-2xl font-bold">Lengkapi profil kamu</h1><p className="text-sm text-sub">Sekali saja, supaya rekan kerja mudah menemukanmu di Directory.</p></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap" req><input value={f.name} onChange={set("name")} className={inp} data-testid="onb-name-input" /></Field>
          <Field label="Nama panggilan" req><input value={f.nickname} onChange={set("nickname")} placeholder="mis. Kiki" className={inp} data-testid="onb-nickname-input" /></Field>
          <Field label="Divisi" req><select value={f.department} onChange={set("department")} className={inp} data-testid="onb-division-select"><option value="">Pilih divisi</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
          <Field label="Company" req><input list="onb-companies" value={f.company} onChange={set("company")} placeholder="Pilih atau ketik" className={inp} data-testid="onb-company-input" /><datalist id="onb-companies">{[...new Set(labels.filter((l) => !l.archived).map((l) => l.name))].map((n) => <option key={n} value={n} />)}</datalist></Field>
          <Field label="Jabatan" req><input value={f.job_title} onChange={set("job_title")} placeholder="mis. Graphic Designer" className={inp} data-testid="onb-jobtitle-input" /></Field>
          <Field label="Nomor HP"><input type="tel" value={f.phone} onChange={set("phone")} placeholder="08xx" className={inp} data-testid="onb-phone-input" /></Field>
          <Field label="Tanggal mulai kerja"><input type="date" value={f.join_date} onChange={set("join_date")} className={inp} data-testid="onb-joindate-input" /></Field>
        </div>
        {!divisions.length && <p className="mt-4 text-xs text-rose-500" data-testid="onb-no-divisions">Daftar divisi belum diatur admin. Hubungi admin workspace.</p>}
        <button type="submit" disabled={!ok || busy} className="btn-accent mt-6 h-11 w-full text-sm font-semibold disabled:opacity-50" data-testid="onb-submit-btn">{busy ? "Menyimpan…" : "Simpan & masuk"}</button>
      </form>
    </div>
  );
}
