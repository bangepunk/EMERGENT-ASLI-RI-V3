import { useEffect, useRef, useState } from "react";
import { Smile, Sticker, Paperclip, Image as ImageIcon, BarChart3, SendHorizonal, X, Search, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, fileUrl, uploadFile } from "../../lib/api";
import { useApp } from "../../context/AppContext";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Avatar } from "../../components/common";

export const EMOJIS = "😀 😄 😂 🥹 😊 😍 🤩 😎 🤔 😅 😴 😭 😡 👍 👎 👏 🙌 🙏 💪 👀 🔥 ✨ 🎉 💯 ✅ ❌ ❤️ 💙 💜 💚 💛 🧡 ☕ 🍜 🚀 💡 📌 📎 📅 ⏰ 🎨 🎬 📸 📣 🤝 🌿 ⭕".split(" ");

export function StickerTile({ s, size = 96 }) {
  if (s.file_id) return <img src={fileUrl(s.file_id)} alt={s.name} style={{ width: size, height: size }} className="rounded-2xl object-cover" />;
  return (
    <span className="flex flex-col items-center justify-center rounded-3xl shadow-sm" style={{ width: size, height: size, background: s.bg || "#FFF0F2" }}>
      <span style={{ fontSize: size * 0.42, lineHeight: 1 }}>{s.emoji}</span>
      <span className="mt-1 max-w-full truncate px-1 text-[10px] font-extrabold uppercase tracking-wide text-[#20283B]" style={{ fontSize: Math.max(9, size * 0.1) }}>{s.name}</span>
    </span>
  );
}

function StickerPicker({ onPick }) {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("Recent");
  const [q, setQ] = useState("");
  const fileRef = useRef(null);
  const load = () => api.get("/stickers").then((r) => { setData(r.data); if (!r.data.recent.length) setCat(r.data.packs[0]?.category || "Reactions"); });
  useEffect(() => { load(); }, []);
  if (!data) return <div className="h-64 animate-pulse" />;
  const byId = Object.fromEntries(data.stickers.map((s) => [s.id, s]));
  const cats = ["Recent", "Frequent", ...new Set(data.packs.map((p) => p.category))];
  const list = q ? data.stickers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.category.toLowerCase().includes(q.toLowerCase()))
    : cat === "Recent" ? data.recent.map((i) => byId[i]).filter(Boolean) : cat === "Frequent" ? data.frequent.map((i) => byId[i]).filter(Boolean) : data.stickers.filter((s) => s.category === cat);
  const upload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { const up = await uploadFile(f); await api.post("/stickers", { file_id: up.id, name: f.name.split(".")[0] }); toast.success("Sticker added"); setCat("Custom"); load(); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="w-[300px] sm:w-[340px]" data-testid="sticker-picker">
      <div className="flex items-center gap-2 rounded-xl border bg-surface2 px-2"><Search size={14} className="text-sub" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stickers" className="h-9 flex-1 bg-transparent text-sm outline-none" data-testid="sticker-search-input" />
        <button onClick={() => fileRef.current.click()} className="text-sub" aria-label="Upload sticker" data-testid="sticker-upload-btn"><Upload size={15} /></button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} /></div>
      {!q && <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">{cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${cat === c ? "bg-brand text-white" : "bg-surface2 text-sub"}`} data-testid={`sticker-cat-${c.replace(/\s/g, "-")}`}>{c}</button>)}</div>}
      <div className="mt-2 grid max-h-60 grid-cols-4 gap-2 overflow-y-auto scroll-thin">
        {list.map((s) => <button key={s.id} onClick={() => onPick(s)} className="transition-transform hover:scale-105" data-testid={`sticker-${s.id}`} title={s.name}><StickerTile s={s} size={68} /></button>)}
        {!list.length && <p className="col-span-4 py-6 text-center text-xs text-sub">No stickers here yet.</p>}
      </div>
    </div>
  );
}

export default function Composer({ conv, reply, onCancelReply, onSent, onPoll }) {
  const { send, userMap } = useApp();
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mentions, setMentions] = useState([]);
  const [mq, setMq] = useState(null);
  const ta = useRef(null);
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const lastTyping = useRef(0);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  useEffect(() => {
    if (ta.current) { ta.current.style.height = "auto"; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 160)}px`; }
  }, [text]);

  const post = async (body) => {
    setBusy(true);
    try { const { data } = await api.post(`/conversations/${conv.id}/messages`, body); onSent?.(data); return true; } catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    if (files.some((f) => f.uploading)) return toast("Wait for uploads to finish");
    const ok = await post({ text, attachments: files.map((f) => ({ id: f.id })), reply_to: reply?.id, mention_ids: mentions.filter((m) => text.includes(`@${userMap[m]?.name}`)) });
    if (ok) { setText(""); setFiles([]); setMentions([]); onCancelReply?.(); }
  };
  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const m = v.slice(0, e.target.selectionStart).match(/@([\w]*)$/);
    setMq(m ? m[1].toLowerCase() : null);
    if (Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); send({ type: "typing", conversation_id: conv.id }); }
  };
  const pickMention = (u) => {
    const pos = ta.current.selectionStart;
    const before = text.slice(0, pos).replace(/@[\w]*$/, `@${u.name} `);
    setText(before + text.slice(pos));
    setMentions([...mentions, u.user_id]);
    setMq(null);
    ta.current.focus();
  };
  const addFiles = async (list) => {
    for (const f of Array.from(list)) {
      const tmp = { key: Math.random(), name: f.name, uploading: true, content_type: f.type, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null };
      setFiles((x) => [...x, tmp]);
      try { const up = await uploadFile(f); setFiles((x) => x.map((y) => (y.key === tmp.key ? { ...y, ...up, uploading: false } : y))); } catch (e) { toast.error(errMsg(e)); setFiles((x) => x.filter((y) => y.key !== tmp.key)); }
    }
  };
  const members = mq !== null ? conv.member_ids.map((id) => userMap[id]).filter((u) => u && u.name.toLowerCase().includes(mq)).slice(0, 6) : [];

  return (
    <div className="border-t bg-surface px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-4" data-testid="message-composer">
      {reply && <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-xs"><span className="flex-1 truncate">Replying to <b>{userMap[reply.sender_id]?.name}</b>: {reply.text}</span><button onClick={onCancelReply} aria-label="Cancel reply"><X size={14} /></button></div>}
      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar" data-testid="composer-attachments">
          {files.map((f) => (
            <div key={f.key} className="relative flex h-16 shrink-0 items-center gap-2 rounded-xl border bg-surface2 px-2">
              {f.preview ? <img src={f.preview} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <FileText size={18} className="text-sub" />}
              <span className="max-w-[120px] truncate text-xs">{f.uploading ? "Uploading…" : f.name}</span>
              <button onClick={() => setFiles(files.filter((x) => x.key !== f.key))} className="absolute -right-1 -top-1 rounded-full bg-ink p-0.5 text-[var(--c-surface)]" aria-label="Remove attachment"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}
      {members.length > 0 && <div className="mb-2 rounded-xl border bg-surface p-1 shadow-lg" data-testid="mention-suggestions">{members.map((u) => <button key={u.user_id} onClick={() => pickMention(u)} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-surface2"><Avatar user={u} size={22} showStatus={false} />{u.name}</button>)}</div>}
      <div className="flex items-end gap-1.5 rounded-2xl border bg-surface2 p-1.5">
        <div className="flex shrink-0 items-center">
          <Popover><PopoverTrigger asChild><button className="btn-ghost flex h-10 w-10 items-center justify-center text-sub" aria-label="Emoji" data-testid="emoji-picker-btn"><Smile size={19} /></button></PopoverTrigger>
            <PopoverContent className="w-72 bg-surface p-2" align="start"><div className="grid grid-cols-8 gap-1" data-testid="emoji-picker">{EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="h-8 rounded-lg text-lg hover:bg-surface2">{e}</button>)}</div></PopoverContent></Popover>
          <Popover><PopoverTrigger asChild><button className="btn-ghost flex h-10 w-10 items-center justify-center text-sub" aria-label="Stickers" data-testid="sticker-picker-btn"><Sticker size={19} /></button></PopoverTrigger>
            <PopoverContent className="w-auto bg-surface p-3" align="start"><StickerPicker onPick={(s) => post({ type: "sticker", sticker_id: s.id, reply_to: reply?.id }).then((ok) => ok && onCancelReply?.())} /></PopoverContent></Popover>
          <button onClick={() => imgRef.current.click()} className="btn-ghost hidden h-10 w-10 items-center justify-center text-sub sm:flex" aria-label="Attach image" data-testid="attach-image-btn"><ImageIcon size={19} /></button>
          <button onClick={() => fileRef.current.click()} className="btn-ghost flex h-10 w-10 items-center justify-center text-sub" aria-label="Attach file" data-testid="attach-file-btn"><Paperclip size={19} /></button>
          {conv.type === "group" && <button onClick={onPoll} className="btn-ghost hidden h-10 w-10 items-center justify-center text-sub sm:flex" aria-label="Create poll" data-testid="composer-poll-btn"><BarChart3 size={19} /></button>}
          <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="attach-file-input" />
        </div>
        <textarea ref={ta} rows={1} value={text} onChange={onChange} placeholder={conv.archived ? "This group is archived" : "Write a message…"} disabled={conv.archived}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          enterKeyHint="send" className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] outline-none" data-testid="message-input" />
        <button onClick={submit} disabled={busy} className="btn-accent flex h-10 w-10 shrink-0 items-center justify-center disabled:opacity-50" aria-label="Send" data-testid="send-message-btn"><SendHorizonal size={18} /></button>
      </div>
      {conv.type === "group" && <button onClick={onPoll} className="mt-1 text-[11px] font-semibold text-sub sm:hidden" data-testid="composer-poll-btn-mobile">+ Poll</button>}
    </div>
  );
}
