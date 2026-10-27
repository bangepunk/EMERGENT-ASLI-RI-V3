import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, wsUrl } from "../lib/api";
import { applyTheme, buildTheme } from "../lib/theme";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [users, setUsers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [online, setOnline] = useState(new Set());
  const [unread, setUnread] = useState(0);
  const [themeDraft, setThemeDraft] = useState(null);
  const subs = useRef(new Set());
  const sock = useRef(null);

  const me = session?.user;
  const ws = session?.workspace;
  const prefs = useMemo(() => session?.prefs || {}, [session?.prefs]);

  const loadAll = useCallback(async () => {
    const [u, l, n] = await Promise.all([api.get("/users"), api.get("/labels"), api.get("/notifications")]);
    setUsers(u.data);
    setLabels(l.data);
    setUnread(n.data.unread);
    setOnline(new Set(u.data.filter((x) => x.online).map((x) => x.user_id)));
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setSession(data);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) return;
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (me) loadAll().catch(() => {});
  }, [me, loadAll]);

  useEffect(() => {
    applyTheme(buildTheme(ws?.theme, prefs, themeDraft));
  }, [ws?.theme, prefs, themeDraft]);

  useEffect(() => {
    if (prefs.theme_mode !== "system") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyTheme(buildTheme(ws?.theme, prefs, themeDraft));
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [prefs, ws?.theme, themeDraft]);

  const emit = (evt) => subs.current.forEach((fn) => fn(evt));

  useEffect(() => {
    if (!me) return undefined;
    let closed = false;
    let timer;
    const connect = () => {
      const s = new WebSocket(wsUrl());
      sock.current = s;
      s.onmessage = (m) => {
        const evt = JSON.parse(m.data);
        if (evt.type === "presence") {
          setOnline((prev) => {
            const n = new Set(prev);
            evt.data.online ? n.add(evt.data.user_id) : n.delete(evt.data.user_id);
            return n;
          });
        }
        if (evt.type === "notification") {
          setUnread((x) => x + 1);
          if (!["dm", "group_message"].includes(evt.data.type) || !window.location.pathname.startsWith("/messages")) {
            toast(evt.data.title, { description: evt.data.body });
          }
          if (document.hidden && window.Notification?.permission === "granted") new Notification(evt.data.title, { body: evt.data.body });
        }
        emit(evt);
      };
      s.onclose = () => {
        if (!closed) timer = setTimeout(connect, 2500);
      };
    };
    connect();
    const ping = setInterval(() => sock.current?.readyState === 1 && sock.current.send('{"type":"ping"}'), 25000);
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      sock.current?.close();
    };
  }, [me]);

  const value = useMemo(() => {
    const userMap = Object.fromEntries(users.map((u) => [u.user_id, u]));
    const labelMap = Object.fromEntries(labels.map((l) => [l.id, l]));
    return {
      session, setSession, me, ws, prefs, users, userMap, labels, labelMap, online, unread, setUnread,
      statuses: ws?.task_statuses || [],
      isAdmin: ["super_admin", "workspace_admin"].includes(me?.role),
      isManager: ["super_admin", "workspace_admin", "department_manager", "project_manager"].includes(me?.role),
      isDemo: !!me?.is_demo,
      themeDraft, setThemeDraft,
      reloadUsers: () => api.get("/users").then((r) => setUsers(r.data)),
      reloadLabels: () => api.get("/labels").then((r) => setLabels(r.data)),
      reloadWs: () => api.get("/workspace").then((r) => setSession((s) => ({ ...s, workspace: r.data }))),
      savePrefs: async (patch) => {
        setSession((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
        const { data } = await api.put("/prefs", patch);
        setSession((s) => ({ ...s, prefs: data }));
      },
      subscribe: (fn) => {
        subs.current.add(fn);
        return () => subs.current.delete(fn);
      },
      send: (obj) => sock.current?.readyState === 1 && sock.current.send(JSON.stringify(obj)),
      logout: async () => {
        await api.post("/auth/logout").catch(() => {});
        setSession(null);
      },
      checkAuth,
    };
  }, [session, me, ws, prefs, users, labels, online, unread, themeDraft, checkAuth]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
