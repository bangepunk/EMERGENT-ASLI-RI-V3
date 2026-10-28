import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, MessageCircle, Hash, Users, Network, CheckSquare, FolderKanban, Bell, Settings, Search, Moon, Sun, LogOut, Menu, ChevronsLeft, ChevronsRight, FlaskConical } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Avatar, Logo, ROLE_NAMES } from "./common";
import { CallProvider } from "./CallLayer";
import SearchDialog from "./SearchDialog";
import { NotificationRail } from "./NotificationPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

const NAV = [
  { to: "/", icon: Home, label: "Home", id: "home" },
  { to: "/messages", icon: MessageCircle, label: "Messages", id: "messages" },
  { to: "/groups", icon: Hash, label: "Groups", id: "groups" },
  { to: "/people", icon: Users, label: "Directory", id: "directory" },
  { to: "/org", icon: Network, label: "Organization", id: "org" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks", id: "tasks" },
  { to: "/projects", icon: FolderKanban, label: "Projects", id: "projects" },
  { to: "/settings", icon: Settings, label: "Settings", id: "settings" },
];
const MOBILE = ["home", "messages", "tasks", "directory"];

function NavItem({ item, compact, unread, onClick }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.to === "/"} onClick={onClick} data-testid={`sidebar-${item.id}-link`} title={item.label}
      className={({ isActive }) => `group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${isActive ? "bg-surface2 text-ink" : "text-sub hover:bg-surface2 hover:text-ink"} ${compact ? "justify-center px-0" : ""}`}>
      {({ isActive }) => (<>
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-brand" />}
        <Icon size={18} className={isActive ? "text-brand" : ""} />
        {!compact && <span className="flex-1">{item.label}</span>}
        {item.id === "notifications" && unread > 0 && <span className={`rounded-full bg-brand px-1.5 text-[10px] font-bold text-white ${compact ? "absolute right-1 top-1" : ""}`} data-testid="unread-count">{unread > 99 ? "99+" : unread}</span>}
      </>)}
    </NavLink>
  );
}

function Sidebar({ compact, setCompact, openSearch }) {
  const { me, ws, savePrefs, logout, unread, isDemo } = useApp();
  const navigate = useNavigate();
  const dark = document.documentElement.classList.contains("dark");
  return (
    <aside className={`hidden md:flex sticky top-0 h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-300 ${compact ? "w-[76px]" : "w-[248px]"}`} data-testid="sidebar">
      <div className={`flex items-center gap-2.5 p-4 ${compact ? "justify-center" : ""}`}>
        <Logo ws={ws} />
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold tracking-tight" data-testid="workspace-brand">{ws?.brand_name || "CIRCLE"}</p>
            <p className="truncate text-xs text-sub" data-testid="workspace-name">{ws?.name}{isDemo && " · Demo"}</p>
          </div>
        )}
        <button onClick={() => setCompact(!compact)} className="btn-ghost hidden h-8 w-8 items-center justify-center lg:flex text-sub" aria-label="Toggle sidebar" data-testid="sidebar-collapse-btn">
          {compact ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      {isDemo && !compact && <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-soft-yellow px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200" data-testid="demo-banner"><FlaskConical size={14} />Demo mode · sample data</div>}
      <div className="px-3">
        <button onClick={openSearch} className={`flex h-10 w-full items-center gap-2 rounded-xl border bg-surface2 px-3 text-sm text-sub ${compact ? "justify-center px-0" : ""}`} data-testid="sidebar-search-btn">
          <Search size={16} />{!compact && <><span className="flex-1 text-left">Search…</span><kbd className="rounded-md border bg-surface px-1.5 text-[10px]">Ctrl K</kbd></>}
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 scroll-thin">{NAV.map((n) => <NavItem key={n.id} item={n} compact={compact} unread={unread} />)}</nav>
      <div className="border-t p-3">
        <div className={`flex items-center gap-2.5 ${compact ? "flex-col" : ""}`}>
          <button onClick={() => navigate(`/people/${me.user_id}`)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left hover:bg-surface2" data-testid="sidebar-profile-btn">
            <Avatar user={me} size={34} />
            {!compact && <span className="min-w-0"><span className="block truncate text-sm font-semibold">{me.name}</span><span className="block truncate text-xs text-sub">{ROLE_NAMES[me.role]}</span></span>}
          </button>
          <button onClick={() => savePrefs({ theme_mode: dark ? "light" : "dark" })} className="btn-ghost flex h-9 w-9 items-center justify-center text-sub" aria-label="Toggle theme" data-testid="theme-toggle-btn">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button onClick={logout} className="btn-ghost flex h-9 w-9 items-center justify-center text-sub" aria-label="Log out" data-testid="logout-btn"><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ openSearch }) {
  const [more, setMore] = useState(false);
  const { unread, me, logout, ws, isDemo } = useApp();
  const items = NAV.filter((n) => MOBILE.includes(n.id));
  return (
    <>
      <header className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-2 border-b glass px-3 pt-safe" data-testid="mobile-header">
        <Logo size={30} ws={ws} />
        <span className="flex-1 font-extrabold tracking-tight">{ws?.brand_name || "CIRCLE"}{isDemo && <span className="ml-2 rounded-full bg-soft-yellow px-2 py-0.5 text-[10px] font-semibold text-amber-800">Demo</span>}</span>
        <NavLink to="/notifications" className="btn-ghost relative flex h-11 w-11 items-center justify-center" aria-label="Notifikasi" data-testid="mobile-notifications-btn"><Bell size={20} />{unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-[16px] rounded-full bg-brand px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}</NavLink>
        <button onClick={openSearch} className="btn-ghost flex h-11 w-11 items-center justify-center" aria-label="Search" data-testid="mobile-search-btn"><Search size={20} /></button>
      </header>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t glass pb-safe" data-testid="mobile-bottom-nav">
        {items.map((n) => (
          <NavLink key={n.id} to={n.to} end={n.to === "/"} data-testid={`mobile-nav-${n.id}`} className={({ isActive }) => `relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? "text-brand" : "text-sub"}`}>
            <n.icon size={21} />{n.label}
            {n.id === "notifications" && unread > 0 && <span className="absolute right-[22%] top-2 h-2.5 w-2.5 rounded-full bg-brand" />}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-sub" data-testid="mobile-nav-more"><Menu size={21} />More</button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-surface pb-safe">
          <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {NAV.filter((n) => !MOBILE.includes(n.id)).map((n) => (
              <NavLink key={n.id} to={n.to} onClick={() => setMore(false)} data-testid={`more-nav-${n.id}`} className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface2 text-xs font-medium">
                <n.icon size={20} className="text-brand" />{n.label}
              </NavLink>
            ))}
            <NavLink to={`/people/${me.user_id}`} onClick={() => setMore(false)} className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface2 text-xs font-medium" data-testid="more-nav-profile"><Avatar user={me} size={22} showStatus={false} />Profile</NavLink>
            <button onClick={logout} className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface2 text-xs font-medium" data-testid="more-nav-logout"><LogOut size={20} className="text-brand" />Log out</button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default function Shell() {
  const { prefs } = useApp();
  const [search, setSearch] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [compact, setCompactState] = useState(() => window.innerWidth < 1024 || !!prefs.sidebar_compact);
  const loc = useLocation();
  const chatOpen = /^\/messages\/.+/.test(loc.pathname);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    const r = () => window.innerWidth < 1024 && setCompactState(true);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  const setCompact = setCompactState;
  return (
    <CallProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar compact={compact} setCompact={setCompact} openSearch={() => setSearch(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          {!chatOpen && <MobileNav openSearch={() => setSearch(true)} />}
          <main className={`min-w-0 flex-1 ${chatOpen ? "" : "pb-24 md:pb-0"}`}><Outlet /></main>
        </div>
        <NotificationRail open={notifOpen} setOpen={setNotifOpen} />
      </div>
      <SearchDialog open={search} onOpenChange={setSearch} />
    </CallProvider>
  );
}
