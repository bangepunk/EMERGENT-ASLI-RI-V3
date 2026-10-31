import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, fileUrl, uploadFile } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

export function MemberPicker({ open, onOpenChange, exclude = [], onPick, title = "Add members" }) {
  const { users } = useApp();
  const [sel, setSel] = useState([]);
  const [q, setQ] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 rounded-xl border bg-surface2 px-3 text-sm outline-none" />
        <div className="max-h-72 overflow-y-auto">
          {users.filter((u) => !exclude.includes(u.user_id) && u.name.toLowerCase().includes(q.toLowerCase())).map((u) => (
            <label key={u.user_id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface2"><input type="checkbox" checked={sel.includes(u.user_id)} onChange={() => setSel(sel.includes(u.user_id) ? sel.filter((x) => x !== u.user_id) : [...sel, u.user_id])} className="h-4 w-4 accent-[var(--c-accent)]" data-testid={`pick-member-${u.user_id}`} /><Avatar user={u} size={28} showStatus={false} /><span className="text-sm">{u.name}</span></label>
          ))}
        </div>
        <button onClick={() => { onPick(sel); setSel([]); onOpenChange(false); }} disabled={!sel.length} className="btn-accent h-11 font-semibold disabled:opacity-50" data-testid="confirm-members-btn">Add {sel.length || ""}</button>
      </DialogContent>
    </Dialog>
  );
}

export function GroupDialog({ open, onOpenChange, group, onSaved }) {
  const { users, me } = useApp();
  const [f, setF] = useState({ name: "", description: "", group_type: "public", location: "", image: "", member_ids: [] });
  useEffect(() => { if (open) setF(group ? { ...group } : { name: "", description: "", group_type: "public", location: "", image: "", member_ids: [] }); }, [open, group]);
  const save = async () => {
    try {
      const body = { name: f.name, description: f.description, group_type: f.group_type, location: f.location, image: f.image };
      const { data } = group ? await api.patch(`/groups/${group.id}`, body) : await api.post("/groups", { ...body, member_ids: f.member_ids });
      toast.success(group ? "Group updated" : "Group created");
      onOpenChange(false);
      onSaved?.(data);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const img = async (e) => { try { const up = await uploadFile(e.target.files[0]); setF({ ...f, image: up.id }); } catch (er) { toast.error(errMsg(er)); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{group ? "Edit group" : "Create group"}</DialogTitle></DialogHeader>
        {me.role === "super_admin" ? <div className="flex items-center gap-3">
          {f.image ? <img src={fileUrl(f.image)} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <span className="h-14 w-14 rounded-2xl bg-soft-purple" />}
          <label className="cursor-pointer text-sm font-semibold text-brand">Upload foto grup<input type="file" accept="image/*" hidden onChange={img} data-testid="group-image-input" /></label>
          {f.image && <button type="button" onClick={() => setF({ ...f, image: "" })} className="text-xs text-sub" data-testid="group-image-remove">Hapus</button>}
        </div> : f.image ? <img src={fileUrl(f.image)} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : null}
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Group name" className="h-11 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="group-name-input" />
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" className="min-h-[72px] rounded-xl border bg-surface2 p-3 text-sm outline-none" data-testid="group-description-input" />
        <div className="grid grid-cols-2 gap-2">
          {["public", "private", "department", "project"].map((t) => <button key={t} onClick={() => setF({ ...f, group_type: t })} className={`h-10 rounded-xl border text-sm font-medium capitalize ${f.group_type === t ? "border-[var(--c-accent)] bg-soft-red" : ""}`} data-testid={`group-type-${t}`}>{t}</button>)}
        </div>
        <input value={f.location || ""} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location (optional)" className="h-10 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="group-location-input" />
        {!group && (
          <div className="max-h-40 overflow-y-auto rounded-xl border p-1">
            {users.filter((u) => u.user_id !== me.user_id).map((u) => (
              <label key={u.user_id} className="flex items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-surface2"><input type="checkbox" checked={f.member_ids.includes(u.user_id)} onChange={() => setF({ ...f, member_ids: f.member_ids.includes(u.user_id) ? f.member_ids.filter((x) => x !== u.user_id) : [...f.member_ids, u.user_id] })} className="accent-[var(--c-accent)]" data-testid={`group-member-${u.user_id}`} />{u.name}</label>
            ))}
          </div>
        )}
        <button onClick={save} className="btn-accent h-11 font-semibold" data-testid="group-save-btn">{group ? "Save changes" : "Create group"}</button>
      </DialogContent>
    </Dialog>
  );
}
