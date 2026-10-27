import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, ListChecks, Link2, Image as ImageIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { fileUrl, uploadFile, errMsg } from "../lib/api";

export const sanitize = (html) => DOMPurify.sanitize(html || "", { ADD_ATTR: ["target"] });
export function RichView({ html, className = "" }) {
  return <div className={`rich text-sm leading-relaxed ${className}`} dangerouslySetInnerHTML={{ __html: sanitize(html) || "<p style='opacity:.6'>No description</p>" }} />;
}

export default function RichEditor({ value, onChange, placeholder = "Write a brief… paste links, add images or files", testid = "rich-editor" }) {
  const ref = useRef(null);
  const img = useRef(null);
  const doc = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = sanitize(value); }, []); // eslint-disable-line
  const emit = () => onChange(sanitize(ref.current.innerHTML));
  const cmd = (c, v) => { ref.current.focus(); document.execCommand(c, false, v); emit(); };
  const insert = (html) => { ref.current.focus(); document.execCommand("insertHTML", false, html); emit(); };
  const up = async (e, image) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { const r = await uploadFile(f); insert(image ? `<img src="${fileUrl(r.id)}" alt="${r.name}"/>` : `<a href="${fileUrl(r.id)}" target="_blank">📎 ${r.name}</a>&nbsp;`); } catch (er) { toast.error(errMsg(er)); }
  };
  const paste = (e) => {
    const t = e.clipboardData.getData("text/plain");
    if (/^https?:\/\/\S+$/.test(t.trim())) { e.preventDefault(); insert(`<a href="${t.trim()}" target="_blank">${t.trim()}</a>&nbsp;`); }
  };
  const B = ({ on, I, label }) => <button type="button" onMouseDown={(e) => { e.preventDefault(); on(); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-surface hover:text-ink" aria-label={label} title={label}><I size={15} /></button>;
  const onClick = (e) => { if (e.target.tagName === "LI" && e.target.parentElement.classList.contains("checklist")) { e.target.classList.toggle("checked"); emit(); } };
  return (
    <div className="rounded-2xl border bg-surface2" data-testid={testid}>
      <div className="flex flex-wrap gap-0.5 border-b p-1">
        <B I={Bold} label="Bold" on={() => cmd("bold")} /><B I={Italic} label="Italic" on={() => cmd("italic")} />
        <B I={Heading2} label="Heading" on={() => cmd("formatBlock", "h2")} /><B I={Heading3} label="Subheading" on={() => cmd("formatBlock", "h3")} />
        <B I={List} label="Bulleted list" on={() => cmd("insertUnorderedList")} /><B I={ListOrdered} label="Numbered list" on={() => cmd("insertOrderedList")} />
        <B I={ListChecks} label="Checklist" on={() => insert('<ul class="checklist"><li>To do</li></ul><p></p>')} />
        <B I={Link2} label="Link" on={() => { const u = window.prompt("Link URL"); if (u) cmd("createLink", u); }} />
        <B I={ImageIcon} label="Image" on={() => img.current.click()} /><B I={Paperclip} label="File" on={() => doc.current.click()} />
        <input ref={img} type="file" accept="image/*" hidden onChange={(e) => up(e, true)} /><input ref={doc} type="file" hidden onChange={(e) => up(e, false)} />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={emit} onPaste={paste} onClick={onClick} data-placeholder={placeholder} className="rich min-h-[120px] max-h-[360px] overflow-y-auto p-3 text-sm outline-none" data-testid={`${testid}-content`} />
    </div>
  );
}
