import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Toaster } from "./components/ui/sonner";
import { AppProvider, useApp } from "./context/AppContext";
import { api } from "./lib/api";
import Shell from "./components/Shell";
import { Spinner } from "./components/common";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Messages from "./pages/Messages";
import Groups from "./pages/Groups";
import Directory from "./pages/Directory";
import Profile from "./pages/Profile";
import Org from "./pages/Org";
import Tasks from "./pages/Tasks";
import Projects from "./pages/Projects";
import { NotificationList } from "./components/NotificationPanel";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";

function AuthCallback() {
  const done = useRef(false);
  const navigate = useNavigate();
  const { setSession } = useApp();
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sid = new URLSearchParams(window.location.hash.slice(1)).get("session_id");
    window.history.replaceState(null, "", window.location.pathname);
    api.post("/auth/session", { session_id: sid })
      .then(({ data }) => { setSession(data); navigate("/", { replace: true }); })
      .catch((e) => { setSession(null); navigate(`/login?status=${e?.response?.data?.detail || "error"}`, { replace: true }); });
  }, [navigate, setSession]);
  return <Spinner label="Signing you in" />;
}

function Protected({ children }) {
  const { session } = useApp();
  if (session === undefined) return <Spinner label="Loading CIRCLE" />;
  if (!session) return <Navigate to="/login" replace />;
  if (session.user?.needs_onboarding) return <Onboarding />;
  return children;
}

function Router() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Shell /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:cid" element={<Messages />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/people" element={<Directory />} />
        <Route path="/people/:uid" element={<Profile />} />
        <Route path="/org" element={<Org />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:pid" element={<Projects />} />
        <Route path="/notifications" element={<div className="h-[calc(100dvh-7.5rem)] bg-surface md:h-screen"><NotificationList /></div>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </AppProvider>
  );
}
