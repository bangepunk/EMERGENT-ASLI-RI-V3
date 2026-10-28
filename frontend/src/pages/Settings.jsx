import { useState } from "react";
import { Settings as Cog, Sun, Moon, Monitor } from "lucide-react";
import { useApp } from "../context/AppContext";
import { PageHeader } from "../components/common";
import { Switch } from "../components/ui/switch";
import ThemeEditor from "./settings/ThemeEditor";
import BackgroundEditor from "./settings/BackgroundEditor";
import { Card, AdminOverview, PeopleAccess, WorkspaceBranding, DivisionsAdmin, LabelsAdmin, StatusesAdmin, ProfileFieldsAdmin, StickersAdmin } from "./settings/AdminPanels";

const CATS = [["messages", "Direct & group messages"], ["mentions", "Mentions"], ["calls", "Calls & missed calls"], ["tasks", "Task assignments, reviews & completion"], ["deadlines", "Upcoming & overdue deadlines"], ["polls", "New polls"], ["groups", "Group invitations"], ["org", "Organization changes"]];

function Appearance() {
  const { prefs, savePrefs, isAdmin } = useApp();
  const [scope, setScope] = useState("personal");
  return (
    <div className="space-y-5">
      <Card title="Mode" testid="theme-mode-card">
        <div className="grid grid-cols-3 gap-2">{[["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]].map(([k, l, I]) => <button key={k} onClick={() => savePrefs({ theme_mode: k })} className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold ${(prefs.theme_mode || "light") === k ? "border-[var(--c-accent)] bg-soft-red" : ""}`} data-testid={`theme-mode-${k}`}><I size={20} />{l}</button>)}</div>
      </Card>
      <Card title="Theme editor" testid="theme-editor-card">
        {isAdmin && <div className="mb-4 flex rounded-full border p-1 text-sm font-semibold w-fit">{[["personal", "Personal theme"], ["workspace", "Workspace theme"]].map(([k, l]) => <button key={k} onClick={() => setScope(k)} className={`rounded-full px-4 py-1.5 ${scope === k ? "bg-ink text-[var(--c-surface)]" : "text-sub"}`} data-testid={`theme-scope-${k}`}>{l}</button>)}</div>}
        <ThemeEditor key={scope} scope={scope} />
      </Card>
    </div>
  );
}

function NotificationPrefs() {
  const { prefs, savePrefs } = useApp();
  const n = prefs.notifications || {};
  return (
    <Card title="Notification preferences" testid="notification-prefs">
      <div className="divide-y">{CATS.map(([k, l]) => <label key={k} className="flex items-center justify-between py-3 text-sm">{l}<Switch checked={n[k] !== false} onCheckedChange={(v) => savePrefs({ notifications: { ...n, [k]: v } })} data-testid={`notif-pref-${k}`} /></label>)}</div>
      <p className="mt-3 text-xs text-sub">Mute individual groups from the conversation details panel.</p>
    </Card>
  );
}

export default function Settings() {
  const { isAdmin, isManager } = useApp();
  const tabs = [["appearance", "Appearance"], ["background", "Dashboard background"], ["notifications", "Notifications"], ...(isManager ? [["labels", "Labels"], ["statuses", "Task statuses"]] : []), ...(isAdmin ? [["admin", "Admin dashboard"], ["access", "People & access"], ["workspace", "Workspace"], ["fields", "Profile fields"], ["stickers", "Stickers"]] : [])];
  const [tab, setTab] = useState("appearance");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="settings-page">
      <PageHeader icon={Cog} title="Settings" subtitle="Personalize CIRCLE and manage your workspace." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar lg:w-56 lg:shrink-0 lg:flex-col">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`h-10 whitespace-nowrap rounded-xl px-3 text-left text-sm font-medium ${tab === k ? "bg-surface shadow-sm text-ink border" : "text-sub hover:bg-surface2"}`} data-testid={`settings-tab-${k}`}>{l}</button>)}</nav>
        <div className="min-w-0 flex-1">
          {tab === "appearance" && <Appearance />}
          {tab === "background" && <Card title="Dashboard background" testid="background-card"><BackgroundEditor /></Card>}
          {tab === "notifications" && <NotificationPrefs />}
          {tab === "labels" && <LabelsAdmin />}
          {tab === "statuses" && <StatusesAdmin />}
          {tab === "admin" && <AdminOverview />}
          {tab === "access" && <PeopleAccess />}
          {tab === "workspace" && <div className="space-y-5"><WorkspaceBranding /><DivisionsAdmin /></div>}
          {tab === "fields" && <ProfileFieldsAdmin />}
          {tab === "stickers" && <StickersAdmin />}
        </div>
      </div>
    </div>
  );
}
