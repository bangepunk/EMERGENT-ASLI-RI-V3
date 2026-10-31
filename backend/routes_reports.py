import asyncio
import hmac
import logging
import os
from datetime import datetime, timezone, timedelta
from html import escape
from fastapi import APIRouter, Request, HTTPException, Depends
from pymongo.errors import DuplicateKeyError
from core import db, now_iso, get_user, require_manager, MANAGER_ROLES
from email_service import send_email, EMAIL_FROM_NAME
from routes_tasks import board_scope

router = APIRouter(prefix="/api")
logger = logging.getLogger("circle.reports")
REAL_WS = "ws_internal"
WIB = timezone(timedelta(hours=7))


def app_base(request: Request):
    return str(request.base_url).replace("http://", "https://").rstrip("/")


async def report_data(u):
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"task_statuses": 1})
    done = {s["key"] for s in ws.get("task_statuses", []) if s.get("is_done")}
    ids = await board_scope(u)
    boards = await db.boards.find({"workspace_id": u["workspace_id"], **({} if ids is None else {"id": {"$in": ids}})}, {"_id": 0}).sort("name", 1).to_list(200)
    names = {x["user_id"]: x["name"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1, "name": 1})}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    out = []
    for b in boards:
        tasks = await db.tasks.find({"board_id": b["id"], "archived": {"$ne": True}}, {"_id": 0}).sort("deadline", 1).to_list(2000)
        tmap = {t["id"]: t for t in tasks}
        tracked = [t for t in tasks if t.get("checkpoints") and (t["status"] not in done or (t.get("completed_at") or "") >= week_ago)]
        issues = await db.task_comments.find({"task_id": {"$in": list(tmap)}, "kind": "issue", "resolved": False}, {"_id": 0}).sort("created_at", 1).to_list(300)
        out.append({"board": b, "names": names, "active": sum(1 for t in tasks if t["status"] not in done), "tracked": tracked, "tmap": tmap,
                    "done_week": sum(1 for t in tasks for c in t.get("checkpoints") or [] if (c.get("done_at") or "") >= week_ago),
                    "issues": issues})
    return out


def render(u, data, base):
    td = 'style="padding:8px 10px;border-bottom:1px solid #EEF0F4;font-size:13px;color:#20283B"'
    parts = []
    for d in data:
        b, n = d["board"], d["names"]
        rows = ""
        for t in d["tracked"]:
            nxt = next((c for c in t["checkpoints"] if not c["done"]), None)
            nxt_txt = f'{escape(nxt["title"])} <span style="color:#7A8194">({escape(n.get(nxt.get("assignee_id"), "tanpa PIC"))})</span>' if nxt else "Semua checkpoint selesai"
            rows += (f'<tr><td {td}>{escape(t["title"])}</td><td {td}><b>{t.get("progress") or 0}%</b> '
                     f'<span style="color:#7A8194">({sum(1 for c in t["checkpoints"] if c["done"])}/{len(t["checkpoints"])})</span></td><td {td}>{nxt_txt}</td></tr>')
        tasks_html = (f'<table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;margin-top:8px">'
                      f'<tr><th align="left" {td}>Task</th><th align="left" {td}>Progres</th><th align="left" {td}>Checkpoint berikutnya</th></tr>{rows}</table>'
                      if rows else '<p style="font-size:13px;color:#7A8194">Belum ada task dengan checkpoint.</p>')
        iss = ""
        for c in d["issues"]:
            t = d["tmap"].get(c["task_id"], {})
            cp = next((x for x in t.get("checkpoints") or [] if x["id"] == c.get("checkpoint_id")), None)
            iss += (f'<li style="margin-bottom:6px;font-size:13px;color:#20283B"><b>{escape(t.get("title", ""))}</b>'
                    f'{" — " + escape(cp["title"]) if cp else ""}: {escape(c["text"][:300])} '
                    f'<span style="color:#7A8194">({escape(n.get(c["author_id"], ""))}, {c["created_at"][:10]})</span></li>')
        issues_html = f'<ul style="margin:6px 0 0 18px;padding:0">{iss}</ul>' if iss else '<p style="font-size:13px;color:#16A34A">Tidak ada kendala terbuka.</p>'
        parts.append(
            f'<tr><td style="padding:18px 24px;border-top:4px solid {escape(b.get("color") or "#60A5FA")}">'
            f'<h2 style="margin:0;font-size:17px;color:#20283B">{escape(b["name"])}</h2>'
            f'<p style="margin:4px 0 0;font-size:13px;color:#7A8194">{d["active"]} task aktif · {d["done_week"]} checkpoint selesai minggu ini · '
            f'<span style="color:{"#E11D48" if d["issues"] else "#16A34A"}">{len(d["issues"])} kendala terbuka</span></p>'
            f'{tasks_html}<p style="margin:14px 0 0;font-size:13px;font-weight:bold;color:#20283B">Kendala yang belum selesai</p>{issues_html}'
            f'<p style="margin:12px 0 0"><a href="{base}/tasks?board={escape(b["id"])}" style="color:#FF5364;font-size:13px;font-weight:bold">Buka board di aplikasi</a></p></td></tr>')
    body = "".join(parts) or '<tr><td style="padding:24px;font-size:14px;color:#7A8194">Kamu belum punya board.</td></tr>'
    today = datetime.now(WIB).strftime("%d %b %Y")
    return (f'<table role="presentation" width="100%" style="background:#F5F6FA;padding:24px 0;font-family:Arial,sans-serif"><tr><td align="center">'
            f'<table role="presentation" width="640" style="max-width:640px;background:#ffffff;border-radius:16px">'
            f'<tr><td style="padding:24px"><p style="margin:0;font-size:12px;color:#FF5364;font-weight:bold">{escape(EMAIL_FROM_NAME)} · Laporan Progres Mingguan</p>'
            f'<h1 style="margin:6px 0 0;font-size:22px;color:#20283B">Halo {escape(u["name"].split(" ")[0])}, ini progres tim per {today}</h1></td></tr>'
            f'{body}<tr><td style="padding:18px 24px;font-size:11px;color:#9AA0AE">Dikirim otomatis setiap Senin oleh {escape(EMAIL_FROM_NAME)} untuk admin dan manager workspace Internal.</td></tr>'
            f'</table></td></tr></table>')


async def send_report(u, base):
    data = await report_data(u)
    await send_email(to=u["email"], subject=f"Laporan Progres Mingguan {EMAIL_FROM_NAME} — {datetime.now(WIB).strftime('%d %b %Y')}", html=render(u, data, base))
    return len(data)


async def run_weekly(base):
    async for u in db.users.find({"workspace_id": REAL_WS, "status": "active", "role": {"$in": list(MANAGER_ROLES)}, "is_demo": {"$ne": True}, "email": {"$regex": "@"}}, {"_id": 0}):
        try:
            await send_report(u, base)
        except Exception as e:
            logger.error(f"Weekly report to {u['user_id']} failed: {e}")


@router.post("/cron/weekly-report")
async def cron_weekly(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    try:
        env = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("x-webhook-id") or (env or {}).get("run_id")
    if not run_id:
        raise HTTPException(400, "Missing run id")
    try:
        await db.cron_runs.insert_one({"_id": run_id, "name": "weekly-report", "created_at": now_iso()})
    except DuplicateKeyError:
        return {"status": "duplicate"}
    asyncio.create_task(run_weekly(app_base(request)))
    return {"status": "accepted"}


@router.post("/reports/weekly/test")
async def weekly_test(request: Request, u=Depends(get_user)):
    require_manager(u)
    if u.get("is_demo") or u["workspace_id"] != REAL_WS:
        raise HTTPException(400, "Laporan hanya untuk workspace Internal")
    return {"sent_to": u["email"], "boards": await send_report(u, app_base(request))}
