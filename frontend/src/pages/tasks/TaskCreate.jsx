import { useEffect, useState } from "react";
import { Paperclip, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import RichEditor from "../../components/RichEditor";
import { inp, UserSelect, PrioritySelect, LabelPicker, ItemPicker, ColorPicker, AttachmentList, useUploader, ListEditor } from "./fields";

const blank = (me, d = {}) => ({ title: "", description: "", assignee_id: null, priority: "medium", deadline_date: "", deadline_time: "", start_date: "", project_id: d.project_id || "", department: me.department || "", label_ids: d.label_ids || [], item_type: null, link_url: "", collaborator_ids: [], checklist: [], subtasks: [], links: [], attachments: [], estimate: "", card_color: null, card_style: "accent", custom: {}, status: d.status });

function Row({ label, children }) {
  return <div className="grid items-start gap-1 sm:grid-cols-[130px_1fr] sm:gap-3"><span className="pt-2.5 text-xs font-semibold text-sub">{label}</span><div className="min-w-0">{children}</div></div>;
}

export function toDeadline(date, time) {
  if (!date) return null;
  return new Date(`${date}T${time || "17:00"}`).toISOString();
}

export default function TaskCreate({ open, onOpenChange, preset, defaults, onCreated }) {
  const { me, ws, users } = useApp();
  const [f, setF] = useState(blank(me));
  const [projects, setProjects] = useState([]);
  const [link, setLink] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const setAtt = (fn) => setF((x) => ({ ...x, attachments: fn(x.attachments) }));
  const { pick, input } = useUploader(setAtt);
  useEffect(() => { if (open) { setF({ ...blank(me, defaults), ...(preset || {}) }); setMore(false); api.get("/projects").then((r) => setProjects(r.data)); } }, [open]); // eslint-disable-line
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const submit = async (e) => {
    e?.preventDefault();
    if (!f.title.trim()) return toast.error("Task title is required");
    setBusy(true);
    try {
      const { deadline_date, deadline_time, ...rest } = f;
      const { data } = await api.post("/tasks", { ...rest, project_id: f.project_id || null, deadline: toDeadline(deadline_date, deadline_time), deadline_has_time: !!deadline_time, start_date: f.start_date || null, estimate: f.estimate || null });
      toast.success(`Task ${data.number_str} created`);
      onOpenChange(false);
      onCreated?.(data);
    } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-2xl" data-testid="task-create-panel">
        <form onSubmit={submit} className="flex min-h-full flex-col">
          <SheetHeader className="border-b p-5"><SheetTitle>New task</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-4 p-5">
            <input autoFocus value={f.title} onChange={set("title")} placeholder="Task title" className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-sub" data-testid="task-title-input" />
            <RichEditor value={f.description} onChange={set("description")} testid="task-description-editor" />
            <Row label="Requestor"><div className={`${inp} flex items-center`}>{me.name} (you)</div></Row>
            <Row label="Assignee"><UserSelect value={f.assignee_id} onChange={set("assignee_id")} testid="task-assignee-select" /></Row>
            <Row label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} testid="task-priority-select" /></Row>
            <Row label="Deadline"><div className="flex gap-2"><input type="date" value={f.deadline_date} onChange={set("deadline_date")} className={inp} data-testid="task-deadline-input" /><input type="time" value={f.deadline_time} onChange={set("deadline_time")} className={`${inp} w-32`} data-testid="task-deadline-time-input" /></div></Row>
            <Row label="IP / Brand"><LabelPicker value={f.label_ids} onChange={set("label_ids")} testid="task-label-picker" /></Row>
            <Row label="Item"><ItemPicker value={f.item_type} onChange={set("item_type")} testid="task-item-picker" /></Row>
            <Row label="Link file/folder"><input value={f.link_url} onChange={set("link_url")} placeholder="https://…" className={inp} data-testid="task-link-input" /></Row>
            <Row label="Attachments"><div className="space-y-2"><AttachmentList items={f.attachments} onRemove={(a) => setAtt((x) => x.filter((y) => y.id !== a.id))} /><button type="button" onClick={pick} className="flex items-center gap-1.5 text-sm font-semibold text-brand" data-testid="task-add-attachment-btn"><Paperclip size={14} />Add images or documents</button>{input}</div></Row>
            {!more ? <button type="button" onClick={() => setMore(true)} className="text-sm font-semibold text-sub hover:text-ink" data-testid="task-more-fields-btn">+ More fields (dates, project, checklist, links…)</button> : <>
              <Row label="Start date"><input type="date" value={f.start_date} onChange={set("start_date")} className={inp} data-testid="task-start-input" /></Row>
              <Row label="Project"><select value={f.project_id} onChange={set("project_id")} className={inp} data-testid="task-project-select"><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Row>
              <Row label="Department"><input value={f.department} onChange={set("department")} className={inp} list="depts" data-testid="task-department-input" /><datalist id="depts">{[...new Set(users.map((u) => u.department).filter(Boolean))].map((d) => <option key={d} value={d} />)}</datalist></Row>
              <Row label="Collaborators"><div className="flex flex-wrap gap-1">{users.map((u) => { const on = f.collaborator_ids.includes(u.user_id); return <button type="button" key={u.user_id} onClick={() => set("collaborator_ids")(on ? f.collaborator_ids.filter((x) => x !== u.user_id) : [...f.collaborator_ids, u.user_id])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--c-accent)] bg-soft-red" : ""}`}>{u.name.split(" ")[0]}</button>; })}</div></Row>
              <Row label="Checklist"><ListEditor items={f.checklist} onChange={set("checklist")} placeholder="Add checklist item" testid="task-checklist-editor" /></Row>
              <Row label="Subtasks"><ListEditor items={f.subtasks} onChange={set("subtasks")} field="title" placeholder="Add subtask" testid="task-subtasks-editor" /></Row>
              <Row label="Reference links"><div>{f.links.map((l) => <div key={l} className="flex items-center gap-2 py-0.5 text-sm"><Link2 size={13} className="text-sub" /><a href={l} target="_blank" rel="noreferrer" className="flex-1 truncate text-brand">{l}</a><button type="button" onClick={() => set("links")(f.links.filter((x) => x !== l))} aria-label="Remove link"><X size={13} /></button></div>)}
                <div className="flex gap-1"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inp} data-testid="task-link-input" /><button type="button" onClick={() => { if (/^https?:\/\//.test(link)) { set("links")([...f.links, link]); setLink(""); } else toast.error("Enter a valid URL"); }} className="rounded-xl border px-3 text-sm" data-testid="task-add-link-btn">Add</button></div></div></Row>
              <Row label="Estimated effort"><input value={f.estimate} onChange={set("estimate")} placeholder="e.g. 4h, 2 days" className={inp} /></Row>
              <Row label="Card color"><ColorPicker value={f.card_color} onChange={set("card_color")} style={f.card_style} onStyle={set("card_style")} /></Row>
              {(ws.task_fields || []).map((cf) => <Row key={cf.key} label={cf.name}><input value={f.custom[cf.key] || ""} onChange={(e) => set("custom")({ ...f.custom, [cf.key]: e.target.value })} className={inp} /></Row>)}
            </>}
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t bg-surface p-4 pb-safe">
            <button type="button" onClick={() => onOpenChange(false)} className="btn-ghost h-11 flex-1 border font-semibold">Cancel</button>
            <button disabled={busy} className="btn-accent h-11 flex-[2] font-semibold disabled:opacity-50" data-testid="task-create-submit-btn">Create task</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
