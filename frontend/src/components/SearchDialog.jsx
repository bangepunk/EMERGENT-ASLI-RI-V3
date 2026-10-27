import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Hash, CheckSquare, FolderKanban, BarChart3, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { api } from "../lib/api";
import { Avatar, StatusBadge } from "./common";

function Section({ title, children }) {
  return <div className="mb-3"><p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sub">{title}</p>{children}</div>;
}
function Row({ onClick, children, testid }) {
  return <button onClick={onClick} data-testid={testid} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface2">{children}</button>;
}

export default function SearchDialog({ open, onOpenChange }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!q.trim()) { setRes(null); return undefined; }
    const t = setTimeout(() => api.get("/search", { params: { q } }).then((r) => setRes(r.data)).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [q]);
  const go = (path) => { onOpenChange(false); setQ(""); navigate(path); };
  const empty = res && Object.values(res).every((a) => !a.length);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden bg-surface p-0 rounded-3xl">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4"><Search size={18} className="text-sub" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, messages, groups, tasks, projects, polls…" className="h-14 flex-1 bg-transparent text-[15px] outline-none" data-testid="global-search-input" />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2 scroll-thin" data-testid="global-search-results">
          {!res && <p className="p-6 text-center text-sm text-sub">Type to search across your workspace.</p>}
          {empty && <p className="p-6 text-center text-sm text-sub">No results for “{q}”.</p>}
          {res?.employees?.length > 0 && <Section title="Employees">{res.employees.map((e) => <Row key={e.user_id} testid={`search-employee-${e.user_id}`} onClick={() => go(`/people/${e.user_id}`)}><Avatar user={e} size={28} showStatus={false} /><span className="flex-1">{e.name}</span><span className="text-xs text-sub">{e.job_title}</span></Row>)}</Section>}
          {res?.tasks?.length > 0 && <Section title="Tasks">{res.tasks.map((t) => <Row key={t.id} testid={`search-task-${t.id}`} onClick={() => go(`/tasks?task=${t.id}`)}><CheckSquare size={16} className="text-sub" /><span className="text-xs text-sub">{t.number_str}</span><span className="flex-1 truncate">{t.title}</span><StatusBadge status={t.status} /></Row>)}</Section>}
          {res?.groups?.length > 0 && <Section title="Groups">{res.groups.map((g) => <Row key={g.id} onClick={() => go(`/messages/${g.id}`)}><Hash size={16} className="text-sub" /><span className="flex-1">{g.name}</span></Row>)}</Section>}
          {res?.messages?.length > 0 && <Section title="Messages">{res.messages.map((m) => <Row key={m.id} onClick={() => go(`/messages/${m.conversation_id}`)}><MessageCircle size={16} className="text-sub" /><span className="flex-1 truncate">{m.text}</span></Row>)}</Section>}
          {res?.projects?.length > 0 && <Section title="Projects">{res.projects.map((p) => <Row key={p.id} onClick={() => go(`/projects/${p.id}`)}><FolderKanban size={16} className="text-sub" /><span className="flex-1">{p.name}</span></Row>)}</Section>}
          {res?.polls?.length > 0 && <Section title="Polls">{res.polls.map((p) => <Row key={p.id} onClick={() => go(`/messages/${p.conversation_id}`)}><BarChart3 size={16} className="text-sub" /><span className="flex-1 truncate">{p.question}</span></Row>)}</Section>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
