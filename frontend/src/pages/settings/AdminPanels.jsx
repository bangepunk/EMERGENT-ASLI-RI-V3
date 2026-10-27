import { useEffect, useState } from "react";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { api, errMsg, uploadFile } from "../../lib/api";
import { Avatar, LabelChip, ROLE_NAMES, rel, Logo } from "../../components/common";
import { Switch } from "../../components/ui/switch";

const inp = "h-10 rounded-xl border bg-surface2 px-3 text-sm outline-none";
const run = async (fn, msg) => { try { await fn(); if (msg) toast.success(msg); return true; } catch (e) { toast.error(errMsg(e)); return false; } };
export const Card = ({ title, children, testid }) => <section className="card p-5" data-testid={testid}><h3 className="mb-4 font-bold">{title}</h3>{children}</section>;

export function AdminOverview() {
  const [s, setS] = useState(null);
  const [logs, setLogs] = useState([]);
  const { userMap } = useApp();
  useEffect(() => { api.get("/admin/stats").then((r) => setS(r.data)); api.get("/admin/audit").then((r) => setLogs(r.data)); }, []);
  const stats = s ? [["Total employees", s.total_employees], ["Active", s.active_employees], ["Pending approval", s.pending_employees], ["Departments", s.departments], ["Groups", s.groups], ["Active projects", s.active_projects], ["Open tasks", s.open_tasks], ["Overdue tasks", s.overdue_tasks]] : [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-stats">{stats.map(([l, v], i) => <div key={l} className={`rounded-3xl p-4 ${["bg-soft-red", "bg-soft-blue", "bg-soft-yellow", "bg-soft-purple", "bg-soft-green"][i % 5]}`}><p className="text-xs font-semibold text-sub">{l}</p><p className="mt-2 text-3xl font-bold">{v}</p></div>)}</div>
      <Card title="Recent workspace activity (audit log)" testid="audit-log"><ul className="max-h-96 space-y-2 overflow-y-auto">{logs.map((l) => <li key={l.id} className="flex items-center gap-2 text-sm"><Avatar user={userMap[l.actor_id] || { name: l.actor_name }} size={22} showStatus={false} /><b>{l.actor_name}</b><span className="text-sub">{l.action}</span><span className="ml-auto text-[11px] text-sub">{rel(l.created_at)}</span></li>)}{!logs.length && <li className="text-sm text-sub">No admin actions yet.</li>}</ul></Card>
    </div>
  );
}

export function PeopleAccess() {
  const { me, ws, reloadWs, reloadUsers } = useApp();
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inv, setInv] = useState({ email: "", role: "employee" });
  const [domains, setDomains] = useState((ws.allowed_domains || []).join(", "));
  const load = () => { api.get("/admin/users").then((r) => setUsers(r.data)); api.get("/admin/invitations").then((r) => setInvites(r.data)); };
  useEffect(() => { load(); }, []);
  const upd = (uid, body) => run(() => api.patch(`/admin/users/${uid}`, body), "Updated").then(() => { load(); reloadUsers(); });
  return (
    <div className="space-y-5">
      <Card title="Sign-in access" testid="access-settings">
        <label className="block text-xs font-semibold text-sub">Company email domains<input value={domains} onChange={(e) => setDomains(e.target.value)} className={`${inp} mt-1 w-full`} data-testid="allowed-domains-input" /></label>
        <label className="mt-3 flex items-center justify-between text-sm">Company-domain accounts join automatically<Switch checked={ws.auto_join_domain !== false} onCheckedChange={(v) => run(() => api.patch("/workspace", { auto_join_domain: v })).then(reloadWs)} data-testid="auto-join-switch" /></label>
        <label className="mt-3 flex items-center justify-between text-sm">Other accounts go to an approval queue (otherwise rejected)<Switch checked={ws.require_approval !== false} onCheckedChange={(v) => run(() => api.patch("/workspace", { require_approval: v })).then(reloadWs)} data-testid="require-approval-switch" /></label>
        <button onClick={() => run(() => api.patch("/workspace", { allowed_domains: domains.split(",") }), "Saved").then(reloadWs)} className="btn-accent mt-3 h-10 px-4 text-sm font-semibold" data-testid="save-domains-btn">Save domains</button>
      </Card>
      <Card title="Invite employee" testid="invite-card">
        <div className="flex flex-wrap gap-2"><input value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="name@company.com" className={`${inp} min-w-[200px] flex-1`} data-testid="invite-email-input" />
          <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} className={inp} data-testid="invite-role-select">{Object.entries(ROLE_NAMES).filter(([k]) => me.role === "super_admin" || !["super_admin", "workspace_admin"].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button onClick={() => run(() => api.post("/admin/invitations", inv), "Invitation saved — they can now sign in with Google").then((ok) => { if (ok) { setInv({ email: "", role: "employee" }); load(); } })} className="btn-accent h-10 px-4 text-sm font-semibold" data-testid="invite-submit-btn">Invite</button></div>
        <ul className="mt-3 space-y-1">{invites.map((i) => <li key={i.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.email}</span><span className="text-xs text-sub">{ROLE_NAMES[i.role]} · {i.used ? "joined" : "pending"}</span><button onClick={() => run(() => api.delete(`/admin/invitations/${i.id}`)).then(load)} className="text-sub" aria-label="Delete invitation"><Trash2 size={14} /></button></li>)}</ul>
      </Card>
      <Card title={`Employees & roles (${users.length})`} testid="users-admin">
        <div className="divide-y">{users.map((u) => (
          <div key={u.user_id} className="flex flex-wrap items-center gap-2 py-2.5" data-testid={`admin-user-${u.user_id}`}>
            <Avatar user={u} size={32} showStatus={false} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{u.name}</span><span className="block truncate text-xs text-sub">{u.email}</span></span>
            <select value={u.role} onChange={(e) => upd(u.user_id, { role: e.target.value })} className="h-9 rounded-lg border bg-surface2 px-2 text-xs" data-testid={`role-select-${u.user_id}`}>{Object.entries(ROLE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={u.status} onChange={(e) => upd(u.user_id, { status: e.target.value })} disabled={u.user_id === me.user_id} className={`h-9 rounded-lg border px-2 text-xs ${u.status === "pending" ? "bg-soft-yellow" : u.status === "inactive" ? "bg-soft-red" : "bg-surface2"}`} data-testid={`status-select-${u.user_id}`}><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Deactivated</option></select>
          </div>))}</div>
      </Card>
    </div>
  );
}

export function WorkspaceBranding() {
  const { ws, reloadWs } = useApp();
  const [f, setF] = useState({ brand_name: ws.brand_name, name: ws.name, tagline: ws.tagline, description: ws.description, org_levels: (ws.org_levels || []).join(", ") });
  const logo = async (e) => { const up = await uploadFile(e.target.files[0]).catch((er) => toast.error(errMsg(er))); if (up) run(() => api.patch("/workspace", { logo_file_id: up.id }), "Logo updated").then(reloadWs); };
  return (
    <Card title="Workspace identity" testid="workspace-branding">
      <div className="mb-4 flex items-center gap-3"><Logo ws={ws} size={48} /><label className="cursor-pointer text-sm font-semibold text-brand">Upload logo<input type="file" accept="image/*" hidden onChange={logo} data-testid="logo-upload-input" /></label>{ws.logo_file_id && <button onClick={() => run(() => api.patch("/workspace", { logo_file_id: null })).then(reloadWs)} className="text-xs text-sub">Remove</button>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[["brand_name", "App name"], ["name", "Workspace name"], ["tagline", "Tagline"], ["description", "Description"], ["org_levels", "Organization levels (comma separated)"]].map(([k, l]) => <label key={k} className="text-xs font-semibold text-sub">{l}<input value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`${inp} mt-1 w-full`} data-testid={`ws-${k}-input`} /></label>)}
      </div>
      <button onClick={() => run(() => api.patch("/workspace", { ...f, org_levels: f.org_levels.split(",").map((x) => x.trim()).filter(Boolean) }), "Workspace saved").then(reloadWs)} className="btn-accent mt-4 h-10 px-5 text-sm font-semibold" data-testid="ws-save-btn">Save</button>
    </Card>
  );
}

export function LabelsAdmin() {
  const { labels, reloadLabels, isManager } = useApp();
  const [n, setN] = useState({ name: "", color: "#2F7DE1", description: "" });
  return (
    <Card title="IP / Brand labels" testid="labels-admin">
      <div className="mb-4 flex flex-wrap gap-2"><input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} placeholder="Label name" className={`${inp} flex-1`} data-testid="label-name-input" /><input type="color" value={n.color} onChange={(e) => setN({ ...n, color: e.target.value })} className="h-10 w-12" aria-label="Color" /><input value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} placeholder="Description" className={`${inp} flex-1`} />
        <button onClick={() => run(() => api.post("/labels", n), "Label created").then((ok) => { if (ok) { setN({ name: "", color: "#2F7DE1", description: "" }); reloadLabels(); } })} className="btn-accent h-10 px-4 text-sm font-semibold" data-testid="label-create-btn"><Plus size={14} /></button></div>
      <div className="divide-y">{labels.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`label-row-${l.id}`}>
          <input type="color" value={l.color} disabled={!isManager} onChange={(e) => run(() => api.patch(`/labels/${l.id}`, { color: e.target.value })).then(reloadLabels)} className="h-8 w-8" aria-label="Label color" data-testid={`label-color-${l.id}`} />
          <input defaultValue={l.name} disabled={!isManager} onBlur={(e) => e.target.value !== l.name && run(() => api.patch(`/labels/${l.id}`, { name: e.target.value }), "Renamed").then(reloadLabels)} className="h-9 w-40 rounded-lg border bg-surface2 px-2 text-sm" data-testid={`label-name-${l.id}`} />
          <LabelChip label={l} small /><span className="flex-1 truncate text-xs text-sub">{l.description}</span>
          {isManager && <><button onClick={() => run(() => api.patch(`/labels/${l.id}`, { archived: !l.archived }), l.archived ? "Restored" : "Archived").then(reloadLabels)} className="text-xs font-semibold text-sub" data-testid={`label-archive-${l.id}`}>{l.archived ? "Restore" : "Archive"}</button>
            <button onClick={() => run(() => api.delete(`/labels/${l.id}`), "Deleted").then(reloadLabels)} className="text-rose-500" aria-label="Delete label" data-testid={`label-delete-${l.id}`}><Trash2 size={14} /></button></>}
        </div>))}</div>
    </Card>
  );
}

export function StatusesAdmin() {
  const { ws, reloadWs } = useApp();
  const [list, setList] = useState(ws.task_statuses);
  const mv = (i, d) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setList(l); };
  return (
    <Card title="Task statuses" testid="statuses-admin">
      <div className="space-y-2">{list.map((s, i) => (
        <div key={s.key} className="flex flex-wrap items-center gap-2"><input type="color" value={s.color} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-9 w-9" aria-label="Status color" />
          <input value={s.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${inp} flex-1`} data-testid={`status-name-${s.key}`} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={s.is_done} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, is_done: e.target.checked } : x)))} className="accent-[var(--c-accent)]" />Done</label>
          <button disabled={!i} onClick={() => mv(i, -1)} className="text-sub disabled:opacity-30" aria-label="Up"><ArrowUp size={14} /></button><button disabled={i === list.length - 1} onClick={() => mv(i, 1)} className="text-sub disabled:opacity-30" aria-label="Down"><ArrowDown size={14} /></button>
          <button onClick={() => setList(list.filter((_, j) => j !== i))} className="text-rose-500" aria-label="Remove status"><Trash2 size={14} /></button></div>))}</div>
      <div className="mt-3 flex gap-2"><button onClick={() => setList([...list, { key: `st_${Date.now().toString(36)}`, name: "New status", color: "#EEE6FF", is_done: false }])} className="btn-ghost h-10 border px-4 text-sm font-semibold" data-testid="add-status-btn">Add status</button>
        <button onClick={() => run(() => api.put("/settings/task-config", { task_statuses: list }), "Statuses saved").then(reloadWs)} className="btn-accent h-10 px-4 text-sm font-semibold" data-testid="save-statuses-btn">Save</button></div>
    </Card>
  );
}

const TYPES = ["short_text", "long_text", "email", "phone", "date", "dropdown", "multi_select", "url", "boolean", "location"];
export function ProfileFieldsAdmin() {
  const { ws, reloadWs } = useApp();
  const [fields, setFields] = useState(ws.profile_fields || []);
  const [vis, setVis] = useState(ws.field_visibility || {});
  const upd = (i, p) => setFields(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const mv = (i, d) => { const l = [...fields]; [l[i], l[i + d]] = [l[i + d], l[i]]; setFields(l); };
  const V = ({ value, onChange, testid }) => <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border bg-surface2 px-2 text-xs" data-testid={testid}><option value="everyone">Everyone</option><option value="managers">Managers</option><option value="admins">Admins only</option></select>;
  return (
    <Card title="Employee profile fields" testid="profile-fields-admin">
      <p className="mb-2 text-xs font-semibold text-sub">Standard field visibility</p>
      <div className="mb-5 grid gap-2 sm:grid-cols-2">{["email", "phone", "employee_id", "employment_status", "join_date"].map((k) => <div key={k} className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-sm">{k.replace("_", " ")}<V value={vis[k] || "everyone"} onChange={(v) => setVis({ ...vis, [k]: v })} testid={`vis-${k}`} /></div>)}</div>
      <p className="mb-2 text-xs font-semibold text-sub">Custom fields</p>
      <div className="space-y-2">{fields.map((f, i) => (
        <div key={f.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
          <input value={f.name} onChange={(e) => upd(i, { name: e.target.value })} className="h-9 flex-1 rounded-lg border bg-surface2 px-2 text-sm" data-testid={`cf-name-${i}`} />
          <select value={f.type} onChange={(e) => upd(i, { type: e.target.value })} className="h-9 rounded-lg border bg-surface2 px-2 text-xs">{TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
          {["dropdown", "multi_select"].includes(f.type) && <input defaultValue={(f.options || []).join(", ")} onBlur={(e) => upd(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Options, comma separated" className="h-9 rounded-lg border bg-surface2 px-2 text-xs" />}
          <V value={f.visibility} onChange={(v) => upd(i, { visibility: v })} />
          <button disabled={!i} onClick={() => mv(i, -1)} className="text-sub disabled:opacity-30" aria-label="Up"><ArrowUp size={14} /></button>
          <button onClick={() => setFields(fields.filter((_, j) => j !== i))} className="text-rose-500" aria-label="Remove field"><Trash2 size={14} /></button>
        </div>))}</div>
      <div className="mt-3 flex gap-2"><button onClick={() => setFields([...fields, { name: "New field", type: "short_text", visibility: "everyone", options: [] }])} className="btn-ghost h-10 border px-4 text-sm font-semibold" data-testid="add-profile-field-btn">Add field</button>
        <button onClick={() => run(() => api.put("/settings/profile-fields", { fields, field_visibility: vis }), "Fields saved").then(reloadWs)} className="btn-accent h-10 px-4 text-sm font-semibold" data-testid="save-profile-fields-btn">Save</button></div>
    </Card>
  );
}

export function StickersAdmin() {
  const [name, setName] = useState("");
  const [data, setData] = useState(null);
  const load = () => api.get("/stickers").then((r) => setData(r.data));
  useEffect(() => { load(); }, []);
  return (
    <Card title="Sticker packs" testid="stickers-admin">
      <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New pack name" className={`${inp} flex-1`} data-testid="pack-name-input" /><button onClick={() => run(() => api.post("/sticker-packs", { name }), "Pack created").then(() => { setName(""); load(); })} className="btn-accent h-10 px-4 text-sm font-semibold" data-testid="pack-create-btn">Create</button></div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{(data?.packs || []).map((p) => <li key={p.id} className="rounded-xl bg-surface2 px-3 py-2 text-sm"><b>{p.name}</b> <span className="text-xs text-sub">· {data.stickers.filter((s) => s.pack_id === p.id).length} stickers{p.workspace_id === "global" ? " · built-in" : ""}</span></li>)}</ul>
      <p className="mt-3 text-xs text-sub">Anyone can upload custom stickers from the sticker picker in chat.</p>
    </Card>
  );
}
