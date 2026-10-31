import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Sparkles, FlaskConical, MessageCircle, CheckSquare, Users } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { api, errMsg } from "../lib/api";
import { Avatar, Logo } from "../components/common";

const STATUS_MSG = {
  pending: "Your account is waiting for administrator approval. You'll be able to sign in once an admin approves it.",
  inactive: "Your account has been deactivated. Please contact your workspace administrator.",
  not_allowed: "This Google account is not allowed to join this workspace.",
  error: "Sign-in failed. Please try again.",
};

function Floating({ image }) {
  const src = image ? `${process.env.REACT_APP_BACKEND_URL}/api/public/login-image/${image}` : "/login-default.jpg";
  return (
    <div className="relative hidden lg:flex flex-1 overflow-hidden rounded-[32px] bg-[#20283B] p-10 text-white" data-testid="login-hero">
      <img src={src} alt="" onError={(e) => { if (!e.currentTarget.src.endsWith("/login-default.jpg")) e.currentTarget.src = "/login-default.jpg"; }} className="absolute inset-0 h-full w-full object-cover" data-testid="login-hero-image" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#20283B]/90 via-[#20283B]/30 to-transparent" />
      <div className="relative z-10 flex w-full flex-col justify-between">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium backdrop-blur"><Sparkles size={14} />Your Team. One Circle.</span>
        <div>
          <h2 className="max-w-md text-5xl font-extrabold leading-[1.05] tracking-tight">Connect people. Move work forward.</h2>
          <p className="mt-4 max-w-md text-white/85">One workspace to connect your people, manage your work, and keep everything moving.</p>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[[MessageCircle, "Chat & calls"], [CheckSquare, "Tasks & projects"], [Users, "People & org"]].map(([I, t], i) => (
              <div key={t} className="animate-float rounded-3xl bg-white/90 p-4 text-[#20283B] shadow-xl" style={{ animationDelay: `${i * 0.8}s` }}>
                <I size={20} className="text-[#FF5364]" /><p className="mt-6 text-sm font-semibold">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { session, setSession } = useApp();
  const [params] = useSearchParams();
  const [demo, setDemo] = useState({ enabled: false, users: [] });
  const [brand, setBrand] = useState({});
  const navigate = useNavigate();
  const status = params.get("status");
  useEffect(() => {
    api.get("/auth/demo-users").then((r) => setDemo(r.data)).catch(() => {});
    api.get("/public/branding").then((r) => setBrand(r.data)).catch(() => {});
  }, []);
  if (session) return <Navigate to="/" replace />;
  const google = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  const demoLogin = async (uid) => {
    try {
      const { data } = await api.post("/auth/demo", { user_id: uid });
      setSession(data);
      navigate("/");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const logo = brand.logo_file_id ? { logo_file_id: null } : null;
  return (
    <div className="flex min-h-screen bg-background p-3 sm:p-5">
      <Floating image={brand.login_image_file_id} />
      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:max-w-[560px]">
        <div className="w-full max-w-sm animate-rise">
          <div className="flex items-center gap-3">
            {brand.logo_file_id ? <img src={`${process.env.REACT_APP_BACKEND_URL}/api/public/logo/${brand.logo_file_id}`} alt="logo" className="h-11 w-11 rounded-xl object-cover" /> : <Logo size={44} ws={logo} />}
            <span className="text-2xl font-extrabold tracking-tight" data-testid="login-app-name">{brand.brand_name || "CIRCLE"}</span>
          </div>
          <h1 className="mt-10 text-4xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sub" data-testid="login-tagline">{brand.tagline || "Your Team. One Circle."}</p>
          {status && <div className="mt-6 rounded-2xl border bg-soft-yellow p-4 text-sm text-amber-900 dark:text-amber-100" data-testid="login-status-message">{STATUS_MSG[status] || STATUS_MSG.error}</div>}
          <button onClick={google} className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-full border bg-surface font-semibold shadow-sm transition-transform hover:-translate-y-0.5" data-testid="login-google-button">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-sub"><ShieldCheck size={14} />Only invited or company accounts can join the Internal workspace.</p>
          {demo.enabled && (
            <div className="mt-10 rounded-3xl border border-dashed bg-surface p-4" data-testid="demo-mode-panel">
              <p className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={16} className="text-amber-500" />Explore Demo Mode</p>
              <p className="mt-1 text-xs text-sub">Sample data only — separate from the real workspace.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {demo.users.map((u) => (
                  <button key={u.user_id} onClick={() => demoLogin(u.user_id)} className="flex items-center gap-2 rounded-2xl bg-surface2 p-2 text-left transition-colors hover:bg-soft-red" data-testid={`demo-login-${u.user_id}`}>
                    <Avatar user={u} size={30} showStatus={false} />
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold">{u.name}</span><span className="block truncate text-[10px] text-sub">{u.job_title}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
