# CIRCLE — PRD

## Original problem statement
"CIRCLE — COMPLETE INTERNAL COMPANY WORKSPACE": an all-in-one internal company platform (Slack + Lark + Notion + Trello inspired, original identity) with tagline "Your Team. One Circle." Secure Google OAuth with domain restriction / invitations / approval, single "Internal" workspace, isolated demo mode with Indonesian demo data; responsive 3-panel desktop + purpose-built mobile; light (default) / dark / system themes with personal & workspace theme editor; customizable dashboard backgrounds & widgets; real-time personal & group chat (attachments, replies, reactions, edit/delete, pins, search, typing, presence, read receipts), emoji & stickers, polls; WebRTC voice/video calls; customizable employee profiles & custom fields with visibility; directory; dynamic org chart with admin tools, CSV import/export; groups (public/private/department/project); full task system (Board/List/Timeline/Calendar on one DB, rich briefs, attachments, IP/Brand labels & card colors, review workflow, comments/mentions, activity history, saved views, bulk edit, CSV/JSON export); projects with real progress; chat↔task integration; notification center; admin dashboard & RBAC (Super Admin, Workspace Admin, Department Manager, Project Manager, Employee).

## User choices
- Emergent-managed Google Sign-In
- Access: invited emails or company domain `asliri.id`; others go to admin approval queue
- Super Admin: saeful.rohman@asliri.id (env SUPER_ADMIN_EMAILS)
- Calls: direct browser-to-browser (WebRTC mesh, public STUN)

## Architecture
- Backend FastAPI + MongoDB (Emergent stack equivalent to requested Postgres/Node): core.py (db, auth, RBAC helpers, WS manager, notify, object storage), routes_auth / routes_people (profiles, custom fields, org) / routes_chat (conversations, messages, polls, stickers, calls, /api/ws) / routes_tasks (tasks, labels, statuses, export, projects, activity) / routes_misc (prefs, workspace, notifications, uploads, reminders, admin stats, audit, search), seed.py (idempotent).
- Tenant isolation by workspace_id: `ws_internal` (real) vs `ws_demo` (demo, enabled by DEMO_MODE_ENABLED).
- Files in Emergent object storage, served via authenticated /api/files/{id}.
- Frontend React + Tailwind + shadcn, CSS-variable design tokens (lib/theme.js), AppContext (session, users, labels, websocket), CallLayer (WebRTC).

## User personas
Creative, marketing, product teams, management; workspace admins.

## Implemented (2026-10-27)
- All modules above working end-to-end; testing iteration 1: backend 27/27, frontend ~95% of flows passed; tester-found bugs fixed (duplicate widgets, regex injection 500) plus follow-ups (scoped task broadcasts & online stats, archived excluded from search, full-name mentions, poll pluralization, conversation list refresh after rename, reaction menu closing, list empty state, reminder input layout).
- Deadline reminders/overdue notifications are generated when the notifications list is fetched (no background scheduler).

## Revisi 1 (2026-10-28)
- Greeting box removed; Recent Conversations shows Personal + Groups sections
- Task board fits width (no horizontal scroll), list table fixed-width with default hidden extra columns, saved views wrap
- Notifications moved to dedicated right rail panel (desktop) / bell in mobile header; removed from sidebar
- Polls tab removed; polls only creatable in group chats
- Directory simplified: multi-select division tabs + name search

## Onboarding form (2026-10-28)
- New real users (first Google login) get needs_onboarding=true → full-screen "Lengkapi profil kamu" form before entering app (existing users not affected)
- Fields: nama lengkap*, nama panggilan*, divisi* (admin-managed list), company* (pick from labels or type), jabatan*, nomor HP, tanggal mulai kerja
- POST /api/me/onboarding; divisi stored as department (feeds Directory tabs); workspace.divisions managed in Settings → Workspace → Daftar divisi
- Directory card shows nickname + company chip

## Revisi 2 (2026-10-28)
- Task List view = spreadsheet: Name, Owner (label pill), Item (colored item type), Link File/Folder, Title, Submit Date, Deadline, Status; inline edit, row numbers, add-row; prefs key task_sheet; default no grouping
- Item types: workspace.item_types (seeded 5 defaults); anyone POST /api/item-types; admin edits color/removes in Settings → Workspace
- Task fields item_type, link_url, submit_date (also in New Task, Task Detail, CSV export)
- Dashboard widget "Statistik Bulanan" (GET /api/stats/monthly): employee own only, manager/admin all + per-employee filter
- Beranda forum (/beranda, routes_feed.py): posts, photos, @mention, like, emoji reactions, replies thread, delete (author/admin), live via websocket, notifications category "beranda"
- Notification panel docked in layout (no overlap); toasts moved to top-center

## Backlog
- P1: shadcn date pickers instead of native inputs; TURN server for calls behind strict NATs; true browser push (service worker) when tab closed; link previews for URLs.
- P2: drag reorder of org units among siblings (API exists), message threads view, sticker pack management UI per pack, larger-group calls via SFU.

## Next tasks
- Wait for user feedback; optional scheduled deadline digest via platform crons.
