import { useEffect, useState } from "react";
import { BarChart3, Lock, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { AvatarStack } from "../../components/common";

export default function PollCard({ pollId, poll: initial, compact }) {
  const { subscribe } = useApp();
  const [p, setP] = useState(initial || null);
  const [sel, setSel] = useState([]);
  const load = () => api.get(`/polls/${pollId}`).then((r) => { setP(r.data); setSel(r.data.my_vote); }).catch(() => {});
  useEffect(() => { if (!initial) load(); else setSel(initial.my_vote); }, [pollId]); // eslint-disable-line
  useEffect(() => subscribe((e) => e.type === "poll:update" && e.data.poll_id === pollId && load()), [subscribe, pollId]); // eslint-disable-line
  if (!p) return <div className="h-40 w-72 animate-pulse rounded-2xl bg-surface2" />;
  const open = p.status === "open";
  const voted = p.my_vote.length > 0;
  const canVote = open && (!voted || p.allow_change);
  const pick = (id) => setSel(p.multiple ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id]);
  const submit = async () => {
    try { const { data } = await api.post(`/polls/${p.id}/vote`, { option_ids: sel }); setP(data); toast.success("Vote saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className={`w-full ${compact ? "" : "max-w-sm"} rounded-2xl border bg-surface p-4`} data-testid={`poll-card-${p.id}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-sub"><BarChart3 size={14} className="text-brand" />Poll · {p.multiple ? "Multiple choice" : "Single choice"}{p.anonymous && <span className="flex items-center gap-1"><Lock size={11} />Anonymous</span>}</div>
      <p className="mt-2 font-semibold">{p.question}</p>
      <div className="mt-3 space-y-2">
        {p.options.map((o) => {
          const n = p.counts[o.id] || 0;
          const pct = p.total_votes ? Math.round((n * 100) / p.total_votes) : 0;
          const on = sel.includes(o.id);
          return (
            <button key={o.id} disabled={!canVote} onClick={() => pick(o.id)} data-testid={`poll-option-${o.id}`}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${on ? "border-[var(--c-accent)]" : ""} disabled:cursor-default`}>
              <span className="absolute inset-y-0 left-0 bg-soft-red transition-all" style={{ width: `${voted || !open ? pct : 0}%` }} />
              <span className="relative flex items-center gap-2">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${p.multiple ? "rounded" : "rounded-full"} ${on ? "border-[var(--c-accent)] bg-brand" : ""}`} />
                <span className="flex-1">{o.text}</span>
                {(voted || !open) && <span className="text-xs font-semibold">{pct}%</span>}
              </span>
              {!p.anonymous && (voted || !open) && p.voters[o.id]?.length > 0 && <span className="relative mt-1.5 block"><AvatarStack ids={p.voters[o.id]} size={18} /></span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-sub">
        <span data-testid="poll-total-votes">{p.total_votes} votes · <span className={open ? "text-emerald-600" : ""}>{open ? "Open" : "Closed"}</span>{open && p.expires_at && <span className="ml-1 inline-flex items-center gap-1"><Clock size={11} />{formatDistanceToNowStrict(new Date(p.expires_at))} left</span>}</span>
        {canVote && <button onClick={submit} disabled={!sel.length} className="btn-accent h-8 px-3 text-xs font-semibold disabled:opacity-40" data-testid="poll-vote-btn">{voted ? "Change vote" : "Vote"}</button>}
      </div>
    </div>
  );
}
