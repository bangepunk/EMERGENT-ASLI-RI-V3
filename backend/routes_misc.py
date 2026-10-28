import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File, Query
from fastapi.responses import Response
from core import db, now_iso, new_id, get_user, is_admin, require_admin, notify, audit, put_object, get_object, APP_NAME, manager

router = APIRouter(prefix="/api")
P = {"_id": 0}
PREF_KEYS = {"theme_mode", "theme", "background", "dashboard", "notifications", "task_columns", "task_card_style", "push_enabled", "task_view"}
WS_KEYS = {"name", "tagline", "description", "logo_file_id", "theme", "allowed_domains", "auto_join_domain", "require_approval", "org_levels", "divisions"}
MAX_SIZE = 15 * 1024 * 1024
ALLOWED = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv",
           "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
           "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
           "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
           "application/zip", "video/mp4", "audio/mpeg"}


@router.get("/prefs")
async def get_prefs(u=Depends(get_user)):
    return await db.user_prefs.find_one({"user_id": u["user_id"]}, P) or {"user_id": u["user_id"]}


@router.put("/prefs")
async def set_prefs(body: dict = Body(...), u=Depends(get_user)):
    upd = {k: v for k, v in body.items() if k in PREF_KEYS}
    if upd.get("theme_mode") and upd["theme_mode"] not in ("light", "dark", "system"):
        raise HTTPException(400, "Invalid theme mode")
    await db.user_prefs.update_one({"user_id": u["user_id"]}, {"$set": upd}, upsert=True)
    return await db.user_prefs.find_one({"user_id": u["user_id"]}, P)


@router.get("/workspace")
async def get_ws(u=Depends(get_user)):
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, P)
    if "divisions" not in ws:
        units = await db.org_units.distinct("name", {"workspace_id": ws["id"], "level": "Department"})
        depts = await db.users.distinct("department", {"workspace_id": ws["id"]})
        ws["divisions"] = sorted({d for d in units + depts if d})
        await db.workspaces.update_one({"id": ws["id"]}, {"$set": {"divisions": ws["divisions"]}})
    return ws


@router.get("/public/branding")
async def branding():
    ws = await db.workspaces.find_one({"id": "ws_internal"}, {"_id": 0, "name": 1, "tagline": 1, "description": 1, "logo_file_id": 1, "brand_name": 1})
    return ws or {}


@router.patch("/workspace")
async def update_ws(body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    upd = {k: v for k, v in body.items() if k in WS_KEYS}
    if "allowed_domains" in upd:
        upd["allowed_domains"] = [d.strip().lower().lstrip("@") for d in upd["allowed_domains"] if d.strip()]
    if "divisions" in upd:
        upd["divisions"] = list(dict.fromkeys(str(d).strip()[:60] for d in upd["divisions"] if str(d).strip()))
    if "brand_name" in body:
        upd["brand_name"] = body["brand_name"]
    await db.workspaces.update_one({"id": u["workspace_id"]}, {"$set": upd})
    await audit(u, "workspace.update", u["workspace_id"], {"fields": list(upd.keys())})
    return await db.workspaces.find_one({"id": u["workspace_id"]}, P)


async def deadline_scan(u):
    now = datetime.now(timezone.utc)
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"task_statuses": 1})
    dk = [s["key"] for s in ws.get("task_statuses", []) if s.get("is_done")]
    q = {"workspace_id": u["workspace_id"], "assignee_id": u["user_id"], "archived": {"$ne": True}, "status": {"$nin": dk},
         "deadline": {"$ne": None, "$lte": (now + timedelta(hours=24)).isoformat()}}
    async for t in db.tasks.find(q, P):
        kind = "overdue" if t["deadline"] < now.isoformat() else "deadline_upcoming"
        if kind in (t.get("deadline_notified") or []):
            continue
        await db.tasks.update_one({"id": t["id"]}, {"$addToSet": {"deadline_notified": kind}})
        await notify(u["workspace_id"], [u["user_id"]], kind, ("Overdue: " if kind == "overdue" else "Due soon: ") + t["title"], t["deadline"], f"/tasks?task={t['id']}")


@router.get("/notifications")
async def notifications(u=Depends(get_user)):
    await deadline_scan(u)
    items = await db.notifications.find({"user_id": u["user_id"]}, P).sort("created_at", -1).limit(100).to_list(100)
    unread = await db.notifications.count_documents({"user_id": u["user_id"], "read": False})
    return {"items": items, "unread": unread}


@router.post("/notifications/{nid}/read")
async def read_notif(nid: str, u=Depends(get_user)):
    await db.notifications.update_one({"id": nid, "user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def read_all(u=Depends(get_user)):
    await db.notifications.update_many({"user_id": u["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/upload")
async def upload(file: UploadFile = File(...), u=Depends(get_user)):
    ct = file.content_type or "application/octet-stream"
    if ct not in ALLOWED:
        raise HTTPException(400, f"File type {ct} is not allowed")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "File is larger than 15 MB")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/{u['workspace_id']}/{u['user_id']}/{uuid.uuid4()}.{ext}"
    try:
        res = put_object(path, data, ct)
    except Exception:
        raise HTTPException(502, "File storage is unavailable, try again")
    f = {"id": new_id("file"), "workspace_id": u["workspace_id"], "storage_path": res["path"], "name": file.filename[:200],
         "content_type": ct, "size": len(data), "uploaded_by": u["user_id"], "is_deleted": False, "created_at": now_iso()}
    await db.files.insert_one(dict(f))
    return {k: f[k] for k in ("id", "name", "content_type", "size")}


@router.get("/files/{fid}")
async def download(fid: str, u=Depends(get_user)):
    f = await db.files.find_one({"id": fid, "workspace_id": u["workspace_id"], "is_deleted": False}, P)
    if not f:
        raise HTTPException(404, "File not found")
    data, _ = get_object(f["storage_path"])
    disp = "inline" if f["content_type"].startswith("image/") or f["content_type"] == "application/pdf" else "attachment"
    return Response(data, media_type=f["content_type"], headers={"Content-Disposition": f'{disp}; filename="{f["name"]}"', "Cache-Control": "private, max-age=86400"})


@router.get("/public/logo/{fid}")
async def public_logo(fid: str):
    ws = await db.workspaces.find_one({"id": "ws_internal", "logo_file_id": fid})
    f = await db.files.find_one({"id": fid}, P) if ws else None
    if not f:
        raise HTTPException(404, "Not found")
    data, _ = get_object(f["storage_path"])
    return Response(data, media_type=f["content_type"])


@router.get("/reminders")
async def reminders(u=Depends(get_user)):
    return await db.reminders.find({"user_id": u["user_id"]}, P).sort("at", 1).to_list(200)


@router.post("/reminders")
async def add_reminder(body: dict = Body(...), u=Depends(get_user)):
    if not (body.get("text") or "").strip():
        raise HTTPException(400, "Text is required")
    r = {"id": new_id("rem"), "user_id": u["user_id"], "text": body["text"][:300], "kind": "meeting" if body.get("kind") == "meeting" else "reminder",
         "at": body.get("at"), "done": False, "created_at": now_iso()}
    await db.reminders.insert_one(dict(r))
    return r


@router.patch("/reminders/{rid}")
async def upd_reminder(rid: str, body: dict = Body(...), u=Depends(get_user)):
    await db.reminders.update_one({"id": rid, "user_id": u["user_id"]}, {"$set": {k: v for k, v in body.items() if k in ("text", "at", "done")}})
    return {"ok": True}


@router.delete("/reminders/{rid}")
async def del_reminder(rid: str, u=Depends(get_user)):
    await db.reminders.delete_one({"id": rid, "user_id": u["user_id"]})
    return {"ok": True}


@router.get("/admin/stats")
async def stats(u=Depends(get_user)):
    require_admin(u)
    w = u["workspace_id"]
    ws = await db.workspaces.find_one({"id": w}, {"task_statuses": 1})
    dk = [s["key"] for s in ws.get("task_statuses", []) if s.get("is_done")]
    base = {"workspace_id": w, "archived": {"$ne": True}, "status": {"$nin": dk}}
    return {"total_employees": await db.users.count_documents({"workspace_id": w}),
            "active_employees": await db.users.count_documents({"workspace_id": w, "status": "active"}),
            "pending_employees": await db.users.count_documents({"workspace_id": w, "status": "pending"}),
            "online_now": len([x async for x in db.users.find({"workspace_id": w}, {"user_id": 1}) if x["user_id"] in manager.conns]),
            "departments": await db.org_units.count_documents({"workspace_id": w, "level": "Department"}),
            "groups": await db.conversations.count_documents({"workspace_id": w, "type": "group", "deleted": {"$ne": True}}),
            "active_projects": await db.projects.count_documents({"workspace_id": w, "status": "active"}),
            "open_tasks": await db.tasks.count_documents(base),
            "overdue_tasks": await db.tasks.count_documents({**base, "deadline": {"$lt": now_iso(), "$ne": None}})}


@router.get("/admin/audit")
async def audit_logs(u=Depends(get_user)):
    require_admin(u)
    return await db.audit_logs.find({"workspace_id": u["workspace_id"]}, P).sort("created_at", -1).limit(200).to_list(200)


@router.get("/search")
async def search(q: str = Query(..., min_length=1), u=Depends(get_user)):
    import re
    rx = {"$regex": re.escape(q), "$options": "i"}
    w = u["workspace_id"]
    convs = await db.conversations.find({"workspace_id": w, "deleted": {"$ne": True}, "$or": [{"member_ids": u["user_id"]}, {"type": "group", "group_type": {"$ne": "private"}}]}, {"_id": 0, "id": 1, "name": 1, "type": 1, "member_ids": 1, "group_type": 1, "description": 1, "archived": 1}).to_list(1000)
    member_ids = [c["id"] for c in convs if u["user_id"] in c["member_ids"]]
    groups = [c for c in convs if c["type"] == "group" and not c.get("archived") and (re.search(re.escape(q), c.get("name", ""), re.I) or re.search(re.escape(q), c.get("description", ""), re.I))][:8]
    for g in groups:
        g.pop("member_ids", None)
    return {"employees": await db.users.find({"workspace_id": w, "status": "active", "$or": [{"name": rx}, {"job_title": rx}, {"department": rx}]}, {"_id": 0, "user_id": 1, "name": 1, "job_title": 1, "picture": 1}).limit(8).to_list(8),
            "messages": await db.messages.find({"conversation_id": {"$in": member_ids}, "text": rx, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "text": 1, "conversation_id": 1, "sender_id": 1, "created_at": 1}).sort("created_at", -1).limit(10).to_list(10),
            "groups": groups,
            "projects": await db.projects.find({"workspace_id": w, "name": rx}, {"_id": 0, "id": 1, "name": 1, "status": 1}).limit(6).to_list(6),
            "tasks": await db.tasks.find({"workspace_id": w, "archived": {"$ne": True}, "$or": [{"title": rx}, {"number_str": rx}]}, {"_id": 0, "id": 1, "title": 1, "number_str": 1, "status": 1}).limit(10).to_list(10),
            "polls": await db.polls.find({"conversation_id": {"$in": member_ids}, "question": rx}, {"_id": 0, "id": 1, "question": 1, "conversation_id": 1}).limit(6).to_list(6)}
