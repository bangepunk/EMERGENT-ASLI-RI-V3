import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Avatar } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const COLORS = ["#F87171", "#FB923C", "#FACC15", "#4ADE80", "#60A5FA", "#A78BFA", "#F472B6", "#2DD4BF"];

export default function BoardDialog({ board, onClose, onSaved }) {
  const { users, me, isAdmin } = useApp();
  const [f, setF] = useState({ name: board?.name || "", description: board?.description || "", color: board?.color || COLORS[4], member_ids: board?.member_ids || [me.user_id] });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const depts = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  const toggle = (id) => setF({ ...f, member_ids: f.member_ids.includes(id) ? f.member_ids.filter((x) => x !== id) : [...f.member_ids, id] });
  const addDept = (d) => setF({ ...f, member_ids: [...new Set([...f.member_ids, ...users.filter((u) => u.department === d).map((u) => u.user_id)])] });
  const list = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    setBusy(true);
    try { const { data } = board?.id ? await api.patch(`/boards/${board.id}`, f) : await api.post("/boards", f); toast.success("Board disimpan"); onSaved(data); onClose(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const del = async () => {
    if (!window.confirm(`Hapus board ${board.name}?`)) return;
    try { await api.delete(`/boards/${board.id}`); toast.success("Board dihapus"); onSaved(null); onClose(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-3xl bg-surface" data-testid="board-dialog">
        <DialogHeader><DialogTitle>{board?.id ? "Atur board" : "Board baru"}</DialogTitle></DialogHeader>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nama board, mis. Board IT" className="h-11 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="board-name-input" />
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Deskripsi (opsional)" className="h-10 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="board-description-input" />
        <div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} className={`h-7 w-7 rounded-full ${f.color === c ? "ring-2 ring-offset-2 ring-[var(--c-accent)]" : ""}`} style={{ background: c }} aria-label={`Warna ${c}`} data-testid={`board-color-${c.slice(1)}`} />)}</div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Anggota ({f.member_ids.length})</p>
          {depts.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5"><span className="text-xs text-sub">Tambah satu divisi:</span>{depts.map((d) => <button key={d} onClick={() => addDept(d)} className="rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-surface2" data-testid={`board-add-dept-${d.replace(/\s/g, "-")}`}>+ {d}</button>)}</div>}
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-surface2 px-3"><Search size={14} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari karyawan" className="flex-1 bg-transparent text-sm outline-none" data-testid="board-member-search" /></div>
          <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">{list.map((u) => (
            <label key={u.user_id} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 hover:bg-surface2" data-testid={`board-member-${u.user_id}`}>
              <input type="checkbox" checked={f.member_ids.includes(u.user_id)} onChange={() => toggle(u.user_id)} className="h-4 w-4 accent-[var(--c-accent)]" />
              <Avatar user={u} size={26} showStatus={false} /><span className="flex-1 text-sm">{u.name}</span><span className="text-xs text-sub">{u.department}</span>
            </label>))}</div>
        </div>
        <div className="flex gap-2">
          {board?.id && isAdmin && <button onClick={del} className="btn-ghost flex h-11 items-center gap-1.5 border px-4 text-sm font-semibold text-rose-500" data-testid="board-delete-btn"><Trash2 size={14} />Hapus</button>}
          <button onClick={save} disabled={busy || !f.name.trim()} className="btn-accent h-11 flex-1 font-semibold disabled:opacity-50" data-testid="board-save-btn">Simpan board</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
