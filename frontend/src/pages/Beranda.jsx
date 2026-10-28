import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Newspaper, Heart, MessageCircle, SmilePlus, ImagePlus, X, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, errMsg, fileUrl, uploadFile } from "../lib/api";
import { Avatar, PageHeader, Spinner, rel } from "../components/common";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🙏"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function RichText({ text, mentionIds }) {
  const { userMap } = useApp();
  const names = (mentionIds || []).map((id) => userMap[id]?.name).filter(Boolean);
  if (!names.length) return text;
  return text.split(new RegExp(`(@(?:${names.map(esc).join("|")}))`, "g")).map((part, i) => (i % 2 ? <span key={i} className="font-semibold text-brand">{part}</span> : part));
}

function Composer({ parentId, onPosted, placeholder = "Apa yang sedang terjadi?" }) {
  const { me, users, userMap } = useApp();
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [mq, setMq] = useState(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef(null);
  const fileRef = useRef(null);
  const sugg = mq === null ? [] : users.filter((u) => u.user_id !== me.user_id && u.name.toLowerCase().includes(mq)).slice(0, 6);
  const onChange = (e) => { setText(e.target.value); const m = e.target.value.slice(0, e.target.selectionStart).match(/@([\w]*)$/); setMq(m ? m[1].toLowerCase() : null); };
  const pick = (u) => { const pos = ta.current.selectionStart; setText(text.slice(0, pos).replace(/@[\w]*$/, `@${u.name} `) + text.slice(pos)); setMentions([...mentions, u.user_id]); setMq(null); ta.current.focus(); };
  const addFiles = async (list) => {
    for (const f of Array.from(list).slice(0, 6 - files.length)) {
      if (!f.type.startsWith("image/")) { toast.error(`${f.name} bukan gambar`); continue; }
      try { const up = await uploadFile(f); setFiles((x) => [...x, up]); } catch (er) { toast.error(errMsg(er)); }
    }
  };
  const submit = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/posts", { text, parent_id: parentId || null, attachments: files.map((f) => ({ id: f.id })), mention_ids: mentions.filter((m) => text.includes(`@${userMap[m]?.name}`)) });
      setText(""); setFiles([]); setMentions([]); onPosted?.(data);
    } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="card relative p-4" data-testid={parentId ? "reply-composer" : "post-composer"}>
      <div className="flex gap-3">
        <Avatar user={me} size={38} showStatus={false} />
        <div className="min-w-0 flex-1">
          <textarea ref={ta} value={text} onChange={onChange} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} rows={parentId ? 2 : 3} placeholder={placeholder} className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-sub" data-testid="post-text-input" />
          {sugg.length > 0 && <div className="absolute left-16 z-20 w-64 rounded-xl border bg-surface p-1 shadow-lg" data-testid="post-mention-suggestions">{sugg.map((u) => <button key={u.user_id} onClick={() => pick(u)} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-surface2" data-testid={`post-mention-${u.user_id}`}><Avatar user={u} size={22} showStatus={false} />{u.name}</button>)}</div>}
          {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((f) => <div key={f.id} className="relative"><img src={fileUrl(f.id)} alt={f.name} className="h-20 w-20 rounded-xl object-cover" /><button onClick={() => setFiles(files.filter((x) => x.id !== f.id))} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-[var(--c-surface)]" aria-label="Hapus foto"><X size={11} /></button></div>)}</div>}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button onClick={() => fileRef.current.click()} className="btn-ghost flex h-9 items-center gap-1.5 px-2 text-sm text-sub" data-testid="post-add-photo-btn"><ImagePlus size={17} />Foto</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="post-photo-input" />
            <button onClick={submit} disabled={busy || (!text.trim() && !files.length)} className="btn-accent h-9 px-5 text-sm font-semibold disabled:opacity-40" data-testid="post-submit-btn">{parentId ? "Balas" : "Posting"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Reactions({ p, onChange }) {
  const { me } = useApp();
  const react = (emoji) => api.post(`/posts/${p.id}/react`, { emoji }).then((r) => onChange(r.data)).catch((e) => toast.error(errMsg(e)));
  const list = Object.entries(p.reactions || {}).filter(([, ids]) => ids.length);
  return (
    <>
      {list.map(([e, ids]) => <button key={e} onClick={() => react(e)} className={`flex h-8 items-center gap-1 rounded-full border px-2 text-xs font-semibold ${ids.includes(me.user_id) ? "border-[var(--c-accent)] tint-accent" : "text-sub"}`} data-testid={`post-reaction-${p.id}-${e}`}><span>{e}</span><span>{ids.length}</span></button>)}
      <Popover><PopoverTrigger asChild><button className="btn-ghost flex h-8 w-8 items-center justify-center text-sub" aria-label="Beri reaksi" data-testid={`post-react-btn-${p.id}`}><SmilePlus size={16} /></button></PopoverTrigger>
        <PopoverContent className="flex w-auto gap-1 bg-surface p-1.5" align="start">{EMOJIS.map((e) => <button key={e} onClick={() => react(e)} className="h-9 w-9 rounded-lg text-xl transition-transform hover:scale-125 hover:bg-surface2" data-testid={`post-react-option-${e}`}>{e}</button>)}</PopoverContent></Popover>
    </>
  );
}

function PostCard({ p, onChange, onDelete, reply }) {
  const { me, userMap, isAdmin } = useApp();
  const navigate = useNavigate();
  const author = userMap[p.author_id];
  const like = () => api.post(`/posts/${p.id}/like`).then((r) => onChange(r.data)).catch((e) => toast.error(errMsg(e)));
  const del = () => window.confirm("Hapus postingan ini?") && api.delete(`/posts/${p.id}`).then(() => onDelete(p.id)).catch((e) => toast.error(errMsg(e)));
  return (
    <article className={`flex gap-3 ${reply ? "py-4" : "card p-4"} animate-rise`} data-testid={`post-${p.id}`}>
      <Link to={`/people/${p.author_id}`} className="shrink-0"><Avatar user={author} size={reply ? 34 : 42} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2"><Link to={`/people/${p.author_id}`} className="truncate font-bold hover:underline">{author?.name || "—"}</Link><span className="shrink-0 text-xs text-sub">{author?.job_title ? `${author.job_title} · ` : ""}{rel(p.created_at)}</span>
          {(p.author_id === me.user_id || isAdmin) && <button onClick={del} className="ml-auto text-sub hover:text-rose-500" aria-label="Hapus" data-testid={`post-delete-${p.id}`}><Trash2 size={14} /></button>}</div>
        {p.text && <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed" data-testid={`post-text-${p.id}`}><RichText text={p.text} mentionIds={p.mention_ids} /></p>}
        {p.attachments?.length > 0 && <div className={`mt-2.5 grid gap-1.5 ${p.attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{p.attachments.map((a) => <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer"><img src={fileUrl(a.id)} alt={a.name} className={`rounded-2xl border object-cover ${p.attachments.length > 1 ? "aspect-square w-full" : "max-h-[420px] w-auto max-w-full"}`} /></a>)}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button onClick={like} className={`flex h-8 items-center gap-1.5 rounded-full px-2 text-sm ${p.liked ? "text-rose-500" : "text-sub hover:text-rose-500"}`} data-testid={`post-like-${p.id}`}><Heart size={16} fill={p.liked ? "currentColor" : "none"} />{p.like_count > 0 && p.like_count}</button>
          {!reply && <button onClick={() => navigate(`/beranda/${p.id}`)} className="flex h-8 items-center gap-1.5 rounded-full px-2 text-sm text-sub hover:text-ink" data-testid={`post-reply-btn-${p.id}`}><MessageCircle size={16} />{p.reply_count > 0 ? p.reply_count : "Balas"}</button>}
          <Reactions p={p} onChange={onChange} />
        </div>
      </div>
    </article>
  );
}

function Feed() {
  const { subscribe } = useApp();
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(true);
  const load = useCallback(() => api.get("/posts").then((r) => { setPosts(r.data); setMore(r.data.length === 30); }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe((e) => e.type === "posts:changed" && load()), [subscribe, load]);
  const older = () => api.get("/posts", { params: { before: posts[posts.length - 1].created_at } }).then((r) => { setPosts([...posts, ...r.data]); setMore(r.data.length === 30); });
  const upd = (np) => setPosts((ps) => ps.map((x) => (x.id === np.id ? { ...x, ...np } : x)));
  return (
    <>
      <PageHeader icon={Newspaper} title="Beranda" subtitle="Tempat berbagi kabar, ide, dan obrolan santai bareng semua orang di Internal." />
      <div className="space-y-4">
        <Composer onPosted={(p) => setPosts((ps) => [p, ...(ps || []).filter((x) => x.id !== p.id)])} />
        {!posts ? <Spinner /> : !posts.length ? <p className="py-10 text-center text-sm text-sub" data-testid="feed-empty">Belum ada postingan. Jadilah yang pertama!</p> : posts.map((p) => <PostCard key={p.id} p={p} onChange={upd} onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />)}
        {posts?.length > 0 && more && <button onClick={older} className="w-full py-3 text-sm font-semibold text-brand" data-testid="feed-load-more">Muat lebih banyak</button>}
      </div>
    </>
  );
}

function Thread({ pid }) {
  const { subscribe } = useApp();
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const load = useCallback(() => api.get(`/posts/${pid}`).then((r) => setT(r.data)).catch(() => setT(false)), [pid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe((e) => e.type === "posts:changed" && load()), [subscribe, load]);
  if (t === null) return <Spinner />;
  if (t === false) return <p className="py-10 text-center text-sm text-sub">Postingan tidak ditemukan.</p>;
  const updReply = (np) => setT({ ...t, replies: t.replies.map((r) => (r.id === np.id ? { ...r, ...np } : r)) });
  return (
    <div className="space-y-4" data-testid="post-thread">
      <button onClick={() => navigate("/beranda")} className="flex items-center gap-1.5 text-sm font-semibold text-sub hover:text-ink" data-testid="thread-back-btn"><ArrowLeft size={16} />Beranda</button>
      <PostCard p={t} onChange={(np) => setT({ ...t, ...np })} onDelete={() => navigate("/beranda")} />
      <div className="card px-4" data-testid="thread-replies">
        <p className="border-b py-3 text-sm font-bold">{t.replies.length} balasan</p>
        <div className="divide-y">{t.replies.map((r) => <PostCard key={r.id} p={r} reply onChange={updReply} onDelete={(id) => setT({ ...t, replies: t.replies.filter((x) => x.id !== id) })} />)}</div>
        {!t.replies.length && <p className="py-6 text-center text-sm text-sub">Belum ada balasan.</p>}
      </div>
      <Composer parentId={t.id} placeholder="Balas postingan ini…" onPosted={(r) => setT((x) => ({ ...x, reply_count: x.reply_count + 1, replies: [...x.replies.filter((y) => y.id !== r.id), r] }))} />
    </div>
  );
}

export default function Beranda() {
  const { pid } = useParams();
  return <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-10" data-testid="beranda-page">{pid ? <Thread pid={pid} /> : <Feed />}</div>;
}
