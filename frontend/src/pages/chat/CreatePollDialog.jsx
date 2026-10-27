import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";

export default function CreatePollDialog({ open, onOpenChange, conversationId, onCreated }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [flags, setFlags] = useState({ multiple: false, anonymous: false, allow_change: true });
  const [exp, setExp] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/conversations/${conversationId}/polls`, { question: q, options: opts, ...flags, expires_at: exp ? new Date(exp).toISOString() : null });
      toast.success("Poll created");
      setQ(""); setOpts(["", ""]); setExp("");
      onOpenChange(false);
      onCreated?.();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface rounded-3xl max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create poll</DialogTitle></DialogHeader>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" className="h-11 rounded-xl border bg-surface2 px-3 text-sm outline-none" data-testid="poll-question-input" />
        <div className="space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className="h-10 flex-1 rounded-xl border bg-surface px-3 text-sm outline-none" data-testid={`poll-option-input-${i}`} />
              {opts.length > 2 && <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="text-sub" aria-label="Remove option"><X size={16} /></button>}
            </div>
          ))}
          {opts.length < 12 && <button onClick={() => setOpts([...opts, ""])} className="flex items-center gap-1 text-sm font-semibold text-brand" data-testid="poll-add-option-btn"><Plus size={14} />Add option</button>}
        </div>
        {[["multiple", "Allow multiple answers"], ["anonymous", "Anonymous voting"], ["allow_change", "Allow changing votes"]].map(([k, l]) => (
          <label key={k} className="flex items-center justify-between text-sm">{l}<Switch checked={flags[k]} onCheckedChange={(v) => setFlags({ ...flags, [k]: v })} data-testid={`poll-flag-${k}`} /></label>
        ))}
        <label className="text-sm">Expires (optional)<input type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-surface px-3 text-sm" data-testid="poll-expiry-input" /></label>
        <button onClick={submit} disabled={busy} className="btn-accent h-11 font-semibold disabled:opacity-50" data-testid="poll-submit-btn">Create poll</button>
      </DialogContent>
    </Dialog>
  );
}
