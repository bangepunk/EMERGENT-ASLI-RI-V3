import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Phone, Video, Mail, MapPin, Briefcase, Users2, Pencil, Calendar, Clock, IdCard, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { useCall } from "../components/CallLayer";
import { api, errMsg, fileUrl, uploadFile } from "../lib/api";
import { Avatar, Spinner, StatusBadge, PriorityBadge, Labels, dueInfo, AccentButton, GhostButton } from "../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";

const MODES = ["Office", "Remote", "Hybrid", "On-site", "Custom"];

function Field({ label, children }) {
  return <label className="block text-xs font-semibold text-sub">{label}<div className="mt-1 text-sm font-normal text-ink">{children}</div></label>;
}
const inp = "h-10 w-full rounded-xl border bg-surface2 px-3 text-sm outline-none";

function CustomInput({ f, value, onChange }) {
  if (f.type === "long_text") return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} className={`${inp} h-20 py-2`} />;
  if (f.type === "boolean") return <Switch checked={!!value} onCheckedChange={onChange} />;
  if (f.type === "dropdown") return <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>;
  if (f.type === "multi_select") return <div className="flex flex-wrap gap-1">{f.options.map((o) => { const on = (value || []).includes(o); return <button type="button" key={o} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...(value || []), o])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "bg-soft-red border-[var(--c-accent)]" : ""}`}>{o}</button>; })}</div>;
  const type = { email: "email", phone: "tel", date: "date", url: "url" }[f.type] || "text";
  return <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className={inp} />;
}

function EditProfile({ open, onOpenChange, p, onSaved }) {
  const { ws, isAdmin, users } = useApp();
  const [f, setF] = useState(p);
  useEffect(() => { if (open) setF({ ...p, skillsText: (p.skills || []).join(", ") }); }, [open, p]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const save = async () => {
    const keys = ["name", "picture", "phone", "bio", "work_mode", "city", "office", "custom_location", "location_status", "share_location", "timezone", "custom", ...(isAdmin ? ["employee_id", "job_title", "department", "division", "team", "employment_status", "join_date", "manager_id"] : [])];
    const body = Object.fromEntries(keys.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
    body.skills = f.skillsText.split(",").map((s) => s.trim()).filter(Boolean);
    try { const { data } = await api.patch(`/users/${p.user_id}`, body); toast.success("Profile saved"); onSaved(data); onOpenChange(false); } catch (e) { toast.error(errMsg(e)); }
  };
  const photo = async (e) => { try { const up = await uploadFile(e.target.files[0]); setF({ ...f, picture: fileUrl(up.id) }); } catch (er) { toast.error(errMsg(er)); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3"><Avatar user={f} size={56} showStatus={false} /><label className="cursor-pointer text-sm font-semibold text-brand">Change photo<input type="file" accept="image/*" hidden onChange={photo} data-testid="profile-photo-input" /></label></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input value={f.name || ""} onChange={set("name")} className={inp} data-testid="profile-name-input" /></Field>
          <Field label="Phone"><input value={f.phone || ""} onChange={set("phone")} className={inp} data-testid="profile-phone-input" /></Field>
          {isAdmin && <>
            <Field label="Job title"><input value={f.job_title || ""} onChange={set("job_title")} className={inp} data-testid="profile-title-input" /></Field>
            <Field label="Employee ID"><input value={f.employee_id || ""} onChange={set("employee_id")} className={inp} /></Field>
            <Field label="Department"><input value={f.department || ""} onChange={set("department")} className={inp} /></Field>
            <Field label="Team"><input value={f.team || ""} onChange={set("team")} className={inp} /></Field>
            <Field label="Employment status"><select value={f.employment_status || ""} onChange={set("employment_status")} className={inp}>{["Full-time", "Part-time", "Contract", "Intern", "On leave"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Join date"><input type="date" value={f.join_date || ""} onChange={set("join_date")} className={inp} /></Field>
            <Field label="Reporting manager"><select value={f.manager_id || ""} onChange={set("manager_id")} className={inp}><option value="">None</option>{users.filter((u) => u.user_id !== p.user_id).map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}</select></Field>
          </>}
          <Field label="Work mode"><select value={f.work_mode || ""} onChange={set("work_mode")} className={inp} data-testid="profile-workmode-select">{MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="City"><input value={f.city || ""} onChange={set("city")} className={inp} data-testid="profile-city-input" /></Field>
          <Field label="Office name"><input value={f.office || ""} onChange={set("office")} className={inp} /></Field>
          {f.work_mode === "Custom" && <Field label="Custom location"><input value={f.custom_location || ""} onChange={set("custom_location")} className={inp} /></Field>}
          <Field label="Location status"><input value={f.location_status || ""} onChange={set("location_status")} placeholder="e.g. At client site today" className={inp} /></Field>
          <Field label="Time zone"><input value={f.timezone || ""} onChange={set("timezone")} className={inp} /></Field>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-surface2 p-3 text-sm">Share my work location with colleagues<Switch checked={f.share_location !== false} onCheckedChange={set("share_location")} data-testid="profile-share-location" /></label>
        <Field label="Skills (comma separated)"><input value={f.skillsText || ""} onChange={set("skillsText")} className={inp} data-testid="profile-skills-input" /></Field>
        <Field label="Biography"><textarea value={f.bio || ""} onChange={set("bio")} className={`${inp} h-20 py-2`} data-testid="profile-bio-input" /></Field>
        {(ws.profile_fields || []).length > 0 && <div className="grid gap-3 sm:grid-cols-2">{ws.profile_fields.map((cf) => <Field key={cf.key} label={`${cf.name}${cf.visibility !== "everyone" ? ` (visible to ${cf.visibility})` : ""}`}><CustomInput f={cf} value={f.custom?.[cf.key]} onChange={(v) => setF({ ...f, custom: { ...(f.custom || {}), [cf.key]: v } })} /></Field>)}</div>}
        <AccentButton onClick={save} data-testid="profile-save-btn">Save profile</AccentButton>
      </DialogContent>
    </Dialog>
  );
}

export default function Profile() {
  const { uid } = useParams();
  const { me, userMap, ws, statuses, online, reloadUsers } = useApp();
  const { startCall } = useCall();
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setP(null); api.get(`/users/${uid}`).then((r) => setP(r.data)).catch(() => navigate("/people")); }, [uid]); // eslint-disable-line
  if (!p) return <Spinner />;
  const dmId = async () => (await api.post("/conversations/dm", { user_id: uid })).data.id;
  const done = statuses.filter((s) => s.is_done).map((s) => s.key);
  const mgr = userMap[p.manager_id];
  const info = [[Mail, "Email", p.email], [Phone, "Phone", p.phone], [IdCard, "Employee ID", p.employee_id], [Briefcase, "Employment", p.employment_status], [Calendar, "Joined", p.join_date], [Clock, "Time zone", p.timezone],
    [MapPin, "Location", [p.office, p.city, p.work_mode === "Custom" ? p.custom_location : p.work_mode].filter(Boolean).join(" · ")], [Users2, "Division / Team", [p.division, p.team].filter(Boolean).join(" / ")]].filter((x) => x[2]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="profile-page">
      <div className="card overflow-hidden">
        <div className="h-28 bg-[linear-gradient(120deg,var(--s-red),var(--s-purple),var(--s-blue))] sm:h-36" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="rounded-full border-4 border-[var(--c-surface)] w-fit"><Avatar user={p} size={96} /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="profile-name">{p.name}</h1>
              <p className="text-sub" data-testid="profile-job-title">{p.job_title || "No title yet"}{p.department && ` · ${p.department}`}</p>
              <p className="mt-1 text-xs"><span className={online.has(p.user_id) ? "text-emerald-600 font-semibold" : "text-sub"}>{online.has(p.user_id) ? "● Online" : "○ Offline"}</span>{p.location_status && <span className="text-sub"> · {p.location_status}</span>}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {uid !== me.user_id && <>
                <AccentButton onClick={async () => navigate(`/messages/${await dmId()}`)} data-testid="profile-message-btn"><MessageCircle size={16} />Message</AccentButton>
                <GhostButton onClick={async () => startCall(await dmId(), "audio")} aria-label="Voice call" data-testid="profile-call-btn"><Phone size={16} /></GhostButton>
                <GhostButton onClick={async () => startCall(await dmId(), "video")} aria-label="Video call" data-testid="profile-video-btn"><Video size={16} /></GhostButton>
              </>}
              {p.can_edit && <GhostButton onClick={() => setEdit(true)} data-testid="profile-edit-btn"><Pencil size={15} />Edit</GhostButton>}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <section className="card p-5"><h3 className="mb-3 text-sm font-bold">About</h3><p className="text-sm text-sub">{p.bio || "No biography yet."}</p>
            {p.skills?.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s} className="rounded-full bg-soft-purple px-2.5 py-1 text-xs font-medium">{s}</span>)}</div>}</section>
          <section className="card space-y-3 p-5" data-testid="profile-contact-info">
            {info.map(([I, l, v]) => <div key={l} className="flex items-center gap-3 text-sm"><I size={15} className="text-sub" /><span className="w-28 text-sub">{l}</span><span className="min-w-0 flex-1 truncate font-medium">{v}</span></div>)}
            {mgr && <button onClick={() => navigate(`/people/${mgr.user_id}`)} className="flex w-full items-center gap-3 rounded-xl bg-surface2 p-2 text-left text-sm"><Avatar user={mgr} size={28} showStatus={false} /><span><span className="block text-[11px] text-sub">Reports to</span><span className="font-semibold">{mgr.name}</span></span></button>}
            {(ws.profile_fields || []).filter((f) => p.custom?.[f.key] !== undefined && p.custom[f.key] !== "").map((f) => <div key={f.key} className="flex items-center gap-3 text-sm"><Link2 size={15} className="text-sub" /><span className="w-28 text-sub">{f.name}</span><span className="min-w-0 flex-1 truncate font-medium">{Array.isArray(p.custom[f.key]) ? p.custom[f.key].join(", ") : String(p.custom[f.key])}</span></div>)}
          </section>
        </div>
        <section className="card p-5 lg:col-span-2" data-testid="profile-tasks"><h3 className="mb-3 text-sm font-bold">Assigned tasks</h3>
          {p.tasks.length ? <div className="divide-y">{p.tasks.map((t) => { const d = dueInfo(t.deadline, done.includes(t.status)); return (
            <button key={t.id} onClick={() => navigate(`/tasks?task=${t.id}`)} className="flex w-full flex-wrap items-center gap-2 py-2.5 text-left"><span className="w-10 text-xs text-sub">T-{t.number}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span><Labels ids={t.label_ids} small max={1} /><StatusBadge status={t.status} /><PriorityBadge value={t.priority} />{d && <span className={`text-xs ${d.cls}`}>{d.text}</span>}</button>); })}</div> : <p className="text-sm text-sub">No assigned tasks.</p>}
        </section>
      </div>
      <EditProfile open={edit} onOpenChange={setEdit} p={p} onSaved={(d) => { setP(d); reloadUsers(); }} />
    </div>
  );
}
