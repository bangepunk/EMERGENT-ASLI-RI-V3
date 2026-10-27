import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hash, Lock, Plus, Users, Building2, FolderKanban, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fileUrl } from "../lib/api";
import { PageHeader, AccentButton, Empty, Spinner } from "../components/common";
import { GroupDialog } from "./chat/GroupDialog";

const ICON = { public: Hash, private: Lock, department: Building2, project: FolderKanban };
const TINT = { public: "bg-soft-blue", private: "bg-soft-purple", department: "bg-soft-green", project: "bg-soft-yellow" };

export default function Groups() {
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();
  const load = () => api.get("/groups/browse").then((r) => setGroups(r.data));
  useEffect(() => { load(); }, []);
  const join = async (g) => { try { await api.post(`/groups/${g.id}/join`); navigate(`/messages/${g.id}`); } catch (e) { toast.error(errMsg(e)); } };
  const list = (groups || []).filter((g) => filter === "all" || (filter === "mine" ? g.is_member : g.group_type === filter));
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10" data-testid="groups-page">
      <PageHeader icon={Hash} title="Groups & Channels" subtitle="Public, private, department and project groups in your workspace." actions={<AccentButton onClick={() => setOpen(true)} data-testid="create-group-btn"><Plus size={16} />New group</AccentButton>} />
      <div className="mb-5 flex gap-2 overflow-x-auto no-scrollbar">
        {["all", "mine", "public", "private", "department", "project"].map((f) => <button key={f} onClick={() => setFilter(f)} className={`h-9 whitespace-nowrap rounded-full px-4 text-sm font-medium capitalize ${filter === f ? "bg-ink text-[var(--c-surface)]" : "border bg-surface text-sub"}`} data-testid={`group-filter-${f}`}>{f === "mine" ? "My groups" : f}</button>)}
      </div>
      {!groups ? <Spinner /> : !list.length ? <Empty icon={Hash} title="No groups here" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => { const I = ICON[g.group_type] || Hash; return (
            <div key={g.id} className="card flex flex-col p-5 transition-transform hover:-translate-y-0.5" data-testid={`group-card-${g.id}`}>
              <div className="flex items-start gap-3">
                {g.image ? <img src={fileUrl(g.image)} alt="" className="h-12 w-12 rounded-2xl object-cover" /> : <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TINT[g.group_type]}`}><I size={20} /></span>}
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{g.name}</p><p className="text-xs capitalize text-sub">{g.group_type}{g.archived ? " · archived" : ""}</p></div>
              </div>
              <p className="mt-3 line-clamp-2 flex-1 text-sm text-sub">{g.description || "No description"}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-sub">
                <span className="flex items-center gap-3"><span className="flex items-center gap-1"><Users size={13} />{g.member_count}</span>{g.location && <span className="flex items-center gap-1"><MapPin size={12} />{g.location}</span>}</span>
                {g.is_member ? <button onClick={() => navigate(`/messages/${g.id}`)} className="rounded-full bg-surface2 px-3 py-1.5 font-semibold text-ink" data-testid={`open-group-${g.id}`}>Open</button>
                  : <button onClick={() => join(g)} className="btn-accent px-3 py-1.5 font-semibold" data-testid={`join-group-${g.id}`}>Join</button>}
              </div>
            </div>); })}
        </div>
      )}
      <GroupDialog open={open} onOpenChange={setOpen} onSaved={(g) => navigate(`/messages/${g.id}`)} />
    </div>
  );
}
