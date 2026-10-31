import csv
import io
import json
import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Body, Request, Query
from fastapi.responses import Response
from core import db, now_iso, new_id, get_user, is_admin, is_manager, require_manager, notify, manager, audit

router = APIRouter(prefix="/api")
P = {"_id": 0}
PRIORITIES = ["low", "medium", "high", "urgent"]
TASK_FIELDS = {"title", "description", "status", "assignee_id", "collaborator_ids", "priority", "start_date", "deadline", "deadline_has_time",
               "project_id", "department", "label_ids", "card_color", "card_style", "checklist", "subtasks", "links", "attachments",
               "estimate", "custom", "reviewer_id", "skip_review", "reminder_at", "item_type", "link_url", "submit_date",
               "board_id", "checkpoints"}
ITEM_COLORS = ["#F87171", "#FB923C", "#FACC15", "#4ADE80", "#60A5FA", "#A78BFA", "#F472B6", "#2DD4BF", "#94A3B8"]
DEFAULT_ITEMS = [{"name": n, "color": ITEM_COLORS[i]} for i, n in enumerate(["Article Asset", "Article Copywriting", "SocMed Asset", "SocMed Copywriting", "Video Storyline"])]


def clean_text_fields(d):
    for k, n in (("item_type", 60), ("link_url", 1000), ("submit_date", 10)):
        if k in d:
            d[k] = str(d[k]).strip()[:n] if d[k] else None
TRACKED = {"status": "status", "assignee_id": "assignee", "deadline": "deadline", "priority": "priority", "label_ids": "labels",
           "description": "description", "attachments": "attachments", "title": "title", "archived": "archive"}


async def ws_statuses(ws_id):
    ws = await db.workspaces.find_one({"id": ws_id}, {"task_statuses": 1})
    return ws.get("task_statuses", [])


def done_keys(statuses):
    return {s["key"] for s in statuses if s.get("is_done")}


def can_edit(t, u, project=None):
    if is_manager(u):
        return True
    ids = {t.get("requestor_id"), t.get("assignee_id"), t.get("created_by"), t.get("reviewer_id"), *(t.get("collaborator_ids") or []),
           *(c.get("assignee_id") for c in t.get("checkpoints") or [])}
    if project and (project.get("owner_id") == u["user_id"] or u["user_id"] in project.get("member_ids", [])):
        return True
    return u["user_id"] in ids


async def board_scope(u):
    if is_admin(u):
        return None
    return [b["id"] async for b in db.boards.find({"workspace_id": u["workspace_id"], "$or": [{"member_ids": u["user_id"]}, {"created_by": u["user_id"]}]}, {"id": 1})]


async def scoped(u, q, board_id=None):
    ids = await board_scope(u)
    if board_id:
        q["board_id"] = board_id if ids is None or board_id in ids else "__none__"
    elif ids is not None:
        q["board_id"] = {"$in": ids}
    return q


async def load_board(bid, u):
    b = await db.boards.find_one({"id": bid, "workspace_id": u["workspace_id"]}, P)
    ids = await board_scope(u)
    if not b or (ids is not None and bid not in ids):
        raise HTTPException(404, "Board tidak ditemukan")
    return b


def check_members(b, d):
    allowed = set(b.get("member_ids", []))
    for k in ("assignee_id", "reviewer_id"):
        if d.get(k) and d[k] not in allowed:
            raise HTTPException(400, "Orang ini bukan anggota board")
    if any(x not in allowed for x in d.get("collaborator_ids") or []):
        raise HTTPException(400, "Kolaborator harus anggota board")
    if any(c.get("assignee_id") and c["assignee_id"] not in allowed for c in d.get("checkpoints") or []):
        raise HTTPException(400, "PIC checkpoint harus anggota board")


def clean_checkpoints(items):
    out = []
    for c in (items or [])[:50]:
        title = str(c.get("title") or "").strip()[:200]
        if title:
            out.append({"id": c.get("id") or new_id("cp"), "title": title, "assignee_id": c.get("assignee_id") or None, "done": bool(c.get("done")),
                        "done_at": c.get("done_at") if c.get("done") else None, "done_by": c.get("done_by") if c.get("done") else None})
    return out


def progress_of(cps):
    return round(100 * sum(1 for c in cps if c["done"]) / len(cps)) if cps else None


async def ensure_board(w, division, users, extra=()):
    b = await db.boards.find_one({"workspace_id": w, "division": division}, P)
    if not b:
        members = [x["user_id"] for x in users if division == "Umum" or (x.get("department") or "").strip() == division]
        b = {"id": new_id("board"), "workspace_id": w, "name": division if division == "Umum" else f"Board {division}", "division": division,
             "description": "", "color": ITEM_COLORS[await db.boards.count_documents({"workspace_id": w}) % len(ITEM_COLORS)],
             "member_ids": members, "created_by": None, "created_at": now_iso()}
        await db.boards.insert_one(dict(b))
    extra = [x for x in extra if x]
    if extra:
        await db.boards.update_one({"id": b["id"]}, {"$addToSet": {"member_ids": {"$each": extra}}})
    return b["id"]


async def migrate_boards():
    async for ws in db.workspaces.find({}, {"id": 1}):
        w = ws["id"]
        if not await db.tasks.find_one({"workspace_id": w, "board_id": None}):
            continue
        users = await db.users.find({"workspace_id": w}, {"_id": 0, "user_id": 1, "department": 1}).to_list(5000)
        dept = {x["user_id"]: (x.get("department") or "").strip() for x in users}
        async for t in db.tasks.find({"workspace_id": w, "board_id": None}, P):
            d = dept.get(t.get("assignee_id")) or (t.get("department") or "").strip() or dept.get(t.get("requestor_id")) or "Umum"
            bid = await ensure_board(w, d, users, [t.get("assignee_id"), t.get("requestor_id"), t.get("reviewer_id"), *(t.get("collaborator_ids") or [])])
            await db.tasks.update_one({"id": t["id"]}, {"$set": {"board_id": bid}})


async def clean_attachments(atts, ws_id):
    out = []
    for a in (atts or [])[:20]:
        f = await db.files.find_one({"id": a.get("id"), "workspace_id": ws_id}, P)
        if f:
            out.append({"id": f["id"], "name": f["name"], "content_type": f["content_type"], "size": f["size"]})
    return out


def build_query(u, p, statuses):
    q = {"workspace_id": u["workspace_id"]}
    view = p.get("view") or "all"
    me = u["user_id"]
    dk = list(done_keys(statuses))
    now = datetime.now(timezone.utc)
    today_end = now.replace(hour=23, minute=59, second=59).isoformat()
    q["archived"] = True if view == "archived" else {"$ne": True}
    if view == "active":
        q["status"] = {"$nin": dk}
    elif view == "my":
        q["$or"] = [{"assignee_id": me}, {"requestor_id": me}, {"collaborator_ids": me}]
    elif view == "requested":
        q["requestor_id"] = me
    elif view == "assigned":
        q["assignee_id"] = me
    elif view == "today":
        q.update(status={"$nin": dk}, deadline={"$gte": now.replace(hour=0, minute=0, second=0).isoformat(), "$lte": today_end})
    elif view == "upcoming":
        q.update(status={"$nin": dk}, deadline={"$gt": today_end, "$lte": (now + timedelta(days=14)).isoformat()})
    elif view == "overdue":
        q.update(status={"$nin": dk}, deadline={"$lt": now.isoformat(), "$ne": None})
    elif view == "completed":
        q["status"] = {"$in": dk}
    elif view == "issues":
        q["open_issues"] = {"$gt": 0}
    for key in ("project_id", "assignee_id", "requestor_id", "department", "priority"):
        if p.get(key):
            q[key] = {"$in": p[key].split(",")}
    if p.get("status"):
        q["status"] = {"$in": p["status"].split(",")}
    if p.get("label"):
        q["label_ids"] = {"$in": p["label"].split(",")}
    if p.get("ids"):
        q["id"] = {"$in": p["ids"].split(",")}
    if p.get("q"):
        import re
        rx = {"$regex": re.escape(p["q"]), "$options": "i"}
        q.setdefault("$and", []).append({"$or": [{"title": rx}, {"description": rx}, {"number_str": rx}]})
    return q


@router.get("/tasks")
async def list_tasks(request: Request, u=Depends(get_user)):
    statuses = await ws_statuses(u["workspace_id"])
    p = dict(request.query_params)
    q = await scoped(u, build_query(u, p, statuses), p.get("board_id"))
    return await db.tasks.find(q, {"_id": 0}).sort("updated_at", -1).to_list(3000)


@router.post("/tasks")
async def create_task(body: dict = Body(...), u=Depends(get_user)):
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Task title is required")
    statuses = await ws_statuses(u["workspace_id"])
    keys = [s["key"] for s in statuses]
    status = body.get("status") if body.get("status") in keys else ("todo" if "todo" in keys else keys[0])
    if body.get("priority") and body["priority"] not in PRIORITIES:
        raise HTTPException(400, "Invalid priority")
    bid = body.get("board_id")
    if not bid:
        ids = await board_scope(u)
        first = await db.boards.find_one({"workspace_id": u["workspace_id"], **({} if ids is None else {"id": {"$in": ids}})}, P, sort=[("name", 1)])
        if not first:
            raise HTTPException(400, "Kamu belum menjadi anggota board mana pun")
        bid = first["id"]
    board = await load_board(bid, u)
    counter = await db.counters.find_one_and_update({"id": f"task_{u['workspace_id']}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    n = counter["seq"]
    t = {k: body.get(k) for k in TASK_FIELDS if k in body}
    clean_text_fields(t)
    t.update({"id": new_id("task"), "number": n, "number_str": f"T-{n}", "workspace_id": u["workspace_id"], "title": title[:300],
              "status": status, "priority": body.get("priority") or "medium", "requestor_id": u["user_id"], "created_by": u["user_id"],
              "label_ids": body.get("label_ids") or [], "collaborator_ids": body.get("collaborator_ids") or [],
              "checklist": body.get("checklist") or [], "subtasks": body.get("subtasks") or [], "links": body.get("links") or [],
              "attachments": await clean_attachments(body.get("attachments"), u["workspace_id"]), "comment_count": 0,
              "archived": False, "completed_at": None, "completed_by": None, "conversation_id": body.get("conversation_id"),
              "message_id": body.get("message_id"), "created_at": now_iso(), "updated_at": now_iso()})
    t["board_id"] = bid
    t["checkpoints"] = clean_checkpoints(body.get("checkpoints"))
    t["progress"] = progress_of(t["checkpoints"])
    t["open_issues"] = 0
    check_members(board, t)
    if t["status"] in done_keys(statuses):
        t.update(completed_at=now_iso(), completed_by=u["user_id"])
    await db.tasks.insert_one(dict(t))
    await log(t, u, "created", {"title": title})
    if t.get("assignee_id"):
        await notify(u["workspace_id"], [t["assignee_id"]], "task_assigned", f"{u['name']} assigned you: {title}", "", f"/tasks?task={t['id']}", u["user_id"])
    await notify(u["workspace_id"], t["collaborator_ids"], "task_assigned", f"You were added as collaborator: {title}", "", f"/tasks?task={t['id']}", u["user_id"])
    await broadcast(u)
    return t


async def log(t, u, action, changes=None):
    await db.task_activity.insert_one({"id": new_id("act"), "workspace_id": t["workspace_id"], "task_id": t["id"], "task_title": t["title"],
                                       "actor_id": u["user_id"], "action": action, "changes": changes or {}, "created_at": now_iso()})


async def broadcast(u):
    ids = [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1})]
    await manager.send([i for i in ids if i in manager.conns], {"type": "tasks:changed", "data": {"workspace_id": u["workspace_id"]}})


async def load_task(tid, u):
    t = await db.tasks.find_one({"id": tid, "workspace_id": u["workspace_id"]}, P)
    ids = await board_scope(u) if t else None
    if not t or (ids is not None and t.get("board_id") not in ids):
        raise HTTPException(404, "Task not found")
    return t


@router.get("/tasks/export")
async def export_tasks(request: Request, u=Depends(get_user)):
    p = dict(request.query_params)
    statuses = await ws_statuses(u["workspace_id"])
    tasks = await db.tasks.find(await scoped(u, build_query(u, p, statuses), p.get("board_id")), P).sort("number", 1).to_list(20000)
    boards = {x["id"]: x["name"] async for x in db.boards.find({"workspace_id": u["workspace_id"]}, {"id": 1, "name": 1})}
    users = {x["user_id"]: x["name"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1, "name": 1})}
    labels = {x["id"]: x["name"] async for x in db.labels.find({"workspace_id": u["workspace_id"]}, {"id": 1, "name": 1})}
    projects = {x["id"]: x["name"] async for x in db.projects.find({"workspace_id": u["workspace_id"]}, {"id": 1, "name": 1})}
    smap = {s["key"]: s["name"] for s in statuses}
    base = str(request.base_url).replace("http://", "https://").rstrip("/")
    rows = []
    for t in tasks:
        rows.append({"Task ID": t["number_str"], "Board": boards.get(t.get("board_id"), ""), "Progress": "" if t.get("progress") is None else f"{t['progress']}%", "Task Name": t["title"], "Description": strip_html(t.get("description") or ""),
                     "Status": smap.get(t["status"], t["status"]), "Requestor": users.get(t.get("requestor_id"), ""),
                     "Assignee": users.get(t.get("assignee_id"), ""), "Priority": (t.get("priority") or "").title(),
                     "IP / Brand Labels": "; ".join(labels.get(i, "") for i in t.get("label_ids", [])), "Item": t.get("item_type") or "",
                     "Link File/Folder": t.get("link_url") or "", "Submit Date": t.get("submit_date") or "", "Card Color": t.get("card_color") or "",
                     "Created Date": t["created_at"], "Start Date": t.get("start_date") or "", "Deadline": t.get("deadline") or "",
                     "Completion Date": t.get("completed_at") or "", "Project": projects.get(t.get("project_id"), ""),
                     "Department": t.get("department") or "", "Attachments": " ".join(f"{base}/api/files/{a['id']}" for a in t.get("attachments", [])),
                     "Created By": users.get(t.get("created_by"), ""), "Last Updated": t.get("updated_at", ""), "Archived": "Yes" if t.get("archived") else "No"})
    await audit(u, "tasks.export", p.get("format", "csv"), {"count": len(rows)})
    if p.get("format") == "json":
        return Response(json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8"), media_type="application/json; charset=utf-8",
                        headers={"Content-Disposition": "attachment; filename=circle-tasks.json"})
    buf = io.StringIO()
    cols = list(rows[0].keys()) if rows else ["Task ID", "Task Name"]
    w = csv.DictWriter(buf, fieldnames=cols, quoting=csv.QUOTE_MINIMAL)
    w.writeheader()
    w.writerows(rows)
    return Response(("\ufeff" + buf.getvalue()).encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=circle-tasks.csv", "X-Record-Count": str(len(rows))})


def strip_html(h):
    import re
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).strip()


@router.get("/tasks/{tid}")
async def get_task(tid: str, u=Depends(get_user)):
    t = await load_task(tid, u)
    t["comments"] = await db.task_comments.find({"task_id": tid}, P).sort("created_at", 1).to_list(500)
    t["activity"] = await db.task_activity.find({"task_id": tid}, P).sort("created_at", -1).to_list(200)
    t["board"] = await db.boards.find_one({"id": t.get("board_id")}, {"_id": 0, "id": 1, "name": 1, "color": 1, "member_ids": 1})
    project = await db.projects.find_one({"id": t.get("project_id")}, P) if t.get("project_id") else None
    t["can_edit"] = can_edit(t, u, project)
    return t


async def apply_update(t, body, u, statuses):
    upd = {k: v for k, v in body.items() if k in TASK_FIELDS}
    clean_text_fields(upd)
    if "title" in upd and not str(upd["title"]).strip():
        raise HTTPException(400, "Task title is required")
    if "priority" in upd and upd["priority"] not in PRIORITIES:
        raise HTTPException(400, "Invalid priority")
    if "status" in upd and upd["status"] not in [s["key"] for s in statuses]:
        raise HTTPException(400, "Invalid status")
    if "attachments" in upd:
        upd["attachments"] = await clean_attachments(upd["attachments"], u["workspace_id"])
    if "archived" in body:
        upd["archived"] = bool(body["archived"])
    dk = done_keys(statuses)
    ws = u["workspace_id"]
    link = f"/tasks?task={t['id']}"
    if "board_id" in upd and not upd["board_id"]:
        raise HTTPException(400, "Board wajib dipilih")
    if upd.get("board_id") or t.get("board_id"):
        board = await load_board(upd.get("board_id") or t["board_id"], u)
        check_members(board, {**t, **upd} if upd.get("board_id") and upd["board_id"] != t.get("board_id") else upd)
    if "checkpoints" in upd:
        old = {c["id"]: c for c in t.get("checkpoints") or []}
        upd["checkpoints"] = clean_checkpoints(upd["checkpoints"])
        if upd.get("board_id") or t.get("board_id"):
            check_members(board, {"checkpoints": upd["checkpoints"]})
        for c in upd["checkpoints"]:
            o = old.get(c["id"], {})
            if c["done"] and not o.get("done"):
                c.update(done_at=now_iso(), done_by=u["user_id"])
                await log(t, u, f"menyelesaikan checkpoint \"{c['title']}\"")
            elif c["done"]:
                c.update(done_at=o.get("done_at"), done_by=o.get("done_by"))
            if c["assignee_id"] and c["assignee_id"] != o.get("assignee_id"):
                await notify(ws, [c["assignee_id"]], "task_assigned", f"{u['name']} menunjukmu sebagai PIC checkpoint: {c['title']}", t["title"], link, u["user_id"])
        upd["progress"] = progress_of(upd["checkpoints"])
    if "status" in upd and upd["status"] != t["status"]:
        if upd["status"] in dk:
            upd.update(completed_at=now_iso(), completed_by=u["user_id"])
            await notify(ws, [t.get("requestor_id"), t.get("assignee_id"), *(t.get("collaborator_ids") or [])], "task_completed", f"Completed: {t['title']}", f"by {u['name']}", link, u["user_id"])
        elif t["status"] in dk:
            upd.update(completed_at=None, completed_by=None)
        if upd["status"] == "in_review":
            await notify(ws, [t.get("reviewer_id") or t.get("requestor_id")], "task_review", f"Ready for review: {t['title']}", f"by {u['name']}", link, u["user_id"])
    if upd.get("assignee_id") and upd["assignee_id"] != t.get("assignee_id"):
        await notify(ws, [upd["assignee_id"]], "task_assigned" if not t.get("assignee_id") else "task_reassigned", f"{u['name']} assigned you: {t['title']}", "", link, u["user_id"])
    if "deadline" in upd and upd["deadline"] != t.get("deadline"):
        await notify(ws, [t.get("assignee_id")], "deadline_changed", f"Deadline changed: {t['title']}", upd["deadline"] or "removed", link, u["user_id"])
        upd["deadline_notified"] = []
    changes = {}
    for k, label in TRACKED.items():
        if k in upd and upd[k] != t.get(k):
            changes[label] = {"from": t.get(k) if k not in ("description", "attachments") else None, "to": upd[k] if k not in ("description",) else None}
            if k == "attachments":
                changes[label] = {"from": len(t.get(k) or []), "to": len(upd[k])}
    upd["updated_at"] = now_iso()
    await db.tasks.update_one({"id": t["id"]}, {"$set": upd})
    for label, ch in changes.items():
        action = "completed" if label == "status" and upd.get("status") in dk else ("archived" if label == "archive" and upd.get("archived") else f"changed {label}")
        await log(t, u, action, ch)
    return upd


@router.patch("/tasks/{tid}")
async def update_task(tid: str, body: dict = Body(...), u=Depends(get_user)):
    t = await load_task(tid, u)
    project = await db.projects.find_one({"id": t.get("project_id")}, P) if t.get("project_id") else None
    if not can_edit(t, u, project):
        raise HTTPException(403, "You cannot edit this task")
    if not can_edit({**t, "checkpoints": []}, u, project) and set(body) - {"checkpoints"}:
        raise HTTPException(403, "PIC checkpoint hanya bisa mengubah checkpoint")
    await apply_update(t, body, u, await ws_statuses(u["workspace_id"]))
    await broadcast(u)
    return await get_task(tid, u)


@router.post("/tasks/bulk")
async def bulk_update(body: dict = Body(...), u=Depends(get_user)):
    statuses = await ws_statuses(u["workspace_id"])
    patch = body.get("patch") or {}
    done = 0
    for tid in body.get("ids", [])[:500]:
        try:
            t = await load_task(tid, u)
        except HTTPException:
            continue
        if can_edit(t, u):
            await apply_update(t, patch, u, statuses)
            done += 1
    await broadcast(u)
    return {"updated": done}


@router.post("/tasks/{tid}/comments")
async def add_comment(tid: str, body: dict = Body(...), u=Depends(get_user)):
    t = await load_task(tid, u)
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Comment is empty")
    cp = next((x for x in t.get("checkpoints") or [] if x["id"] == body.get("checkpoint_id")), None)
    kind = "issue" if body.get("kind") == "issue" else "update"
    c = {"id": new_id("cmt"), "task_id": tid, "workspace_id": u["workspace_id"], "author_id": u["user_id"], "text": text[:4000],
         "mention_ids": body.get("mention_ids", []), "checkpoint_id": cp["id"] if cp else None, "kind": kind, "resolved": False, "created_at": now_iso()}
    await db.task_comments.insert_one(dict(c))
    await db.tasks.update_one({"id": tid}, {"$inc": {"comment_count": 1, "open_issues": 1 if kind == "issue" else 0}, "$set": {"updated_at": now_iso()}})
    await log(t, u, f"melaporkan kendala{' di ' + cp['title'] if cp else ''}" if kind == "issue" else "commented", {"text": text[:140]})
    link = f"/tasks?task={tid}"
    if kind == "issue":
        await notify(u["workspace_id"], [t.get("requestor_id"), t.get("created_by"), t.get("assignee_id")], "mention", f"Kendala di {t['title']}", text, link, u["user_id"])
    await notify(u["workspace_id"], c["mention_ids"], "mention", f"{u['name']} mentioned you on {t['title']}", text, link, u["user_id"])
    await notify(u["workspace_id"], [x for x in [t.get("assignee_id"), t.get("requestor_id")] if x not in c["mention_ids"]], "task_assigned", f"New comment on {t['title']}", text, link, u["user_id"])
    return c


@router.patch("/tasks/{tid}/comments/{cid}")
async def resolve_comment(tid: str, cid: str, body: dict = Body(...), u=Depends(get_user)):
    t = await load_task(tid, u)
    c = await db.task_comments.find_one({"id": cid, "task_id": tid, "kind": "issue"}, P)
    if not c:
        raise HTTPException(404, "Kendala tidak ditemukan")
    if c["author_id"] != u["user_id"] and not can_edit(t, u):
        raise HTTPException(403, "Kamu tidak bisa mengubah kendala ini")
    resolved = bool(body.get("resolved"))
    if resolved != c.get("resolved"):
        await db.task_comments.update_one({"id": cid}, {"$set": {"resolved": resolved, "resolved_by": u["user_id"] if resolved else None}})
        n = await db.task_comments.count_documents({"task_id": tid, "kind": "issue", "resolved": False})
        await db.tasks.update_one({"id": tid}, {"$set": {"open_issues": n, "updated_at": now_iso()}})
        await log(t, u, "menandai kendala selesai" if resolved else "membuka kembali kendala", {"text": c["text"][:140]})
        await broadcast(u)
    return {"ok": True}


# ---------- Boards ----------
async def board_out(b):
    b["task_count"] = await db.tasks.count_documents({"board_id": b["id"], "archived": {"$ne": True}})
    return b


@router.get("/boards")
async def list_boards(u=Depends(get_user)):
    ids = await board_scope(u)
    q = {"workspace_id": u["workspace_id"], **({} if ids is None else {"id": {"$in": ids}})}
    return [await board_out(b) for b in await db.boards.find(q, P).sort("name", 1).to_list(500)]


async def board_members(u, ids):
    return [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"], "user_id": {"$in": list(ids or [])}}, {"user_id": 1})]


@router.post("/boards")
async def create_board(body: dict = Body(...), u=Depends(get_user)):
    require_manager(u)
    name = (body.get("name") or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Nama board wajib diisi")
    members = await board_members(u, set(body.get("member_ids") or []) | {u["user_id"]})
    b = {"id": new_id("board"), "workspace_id": u["workspace_id"], "name": name, "division": None, "description": (body.get("description") or "")[:300],
         "color": (body.get("color") or ITEM_COLORS[4])[:9], "member_ids": members, "created_by": u["user_id"], "created_at": now_iso()}
    await db.boards.insert_one(dict(b))
    await notify(u["workspace_id"], [m for m in members if m != u["user_id"]], "project", f"Kamu ditambahkan ke board {name}", "", f"/tasks?board={b['id']}", u["user_id"])
    await broadcast(u)
    return await board_out(b)


@router.patch("/boards/{bid}")
async def update_board(bid: str, body: dict = Body(...), u=Depends(get_user)):
    require_manager(u)
    b = await load_board(bid, u)
    upd = {k: body[k] for k in ("name", "description", "color") if k in body}
    if "name" in upd and not str(upd["name"]).strip():
        raise HTTPException(400, "Nama board wajib diisi")
    if "member_ids" in body:
        upd["member_ids"] = await board_members(u, body["member_ids"])
        new = [m for m in upd["member_ids"] if m not in b["member_ids"]]
        gone = [m for m in b["member_ids"] if m not in upd["member_ids"]]
        if gone:
            bq = {"board_id": bid}
            await db.tasks.update_many({**bq, "assignee_id": {"$in": gone}}, {"$set": {"assignee_id": None}})
            await db.tasks.update_many({**bq, "reviewer_id": {"$in": gone}}, {"$set": {"reviewer_id": None}})
            await db.tasks.update_many(bq, {"$pull": {"collaborator_ids": {"$in": gone}}})
            await db.tasks.update_many({**bq, "checkpoints.assignee_id": {"$in": gone}}, {"$set": {"checkpoints.$[c].assignee_id": None}},
                                       array_filters=[{"c.assignee_id": {"$in": gone}}])
        await notify(u["workspace_id"], new, "project", f"Kamu ditambahkan ke board {upd.get('name', b['name'])}", "", f"/tasks?board={bid}", u["user_id"])
    await db.boards.update_one({"id": bid}, {"$set": upd})
    await broadcast(u)
    return await board_out(await db.boards.find_one({"id": bid}, P))


@router.delete("/boards/{bid}")
async def delete_board(bid: str, u=Depends(get_user)):
    if not is_admin(u):
        raise HTTPException(403, "Hanya admin yang bisa menghapus board")
    await load_board(bid, u)
    if await db.tasks.count_documents({"board_id": bid}):
        raise HTTPException(400, "Pindahkan atau hapus semua task di board ini dulu")
    await db.boards.delete_one({"id": bid})
    await broadcast(u)
    return {"ok": True}


@router.post("/tasks/{tid}/share")
async def share_task(tid: str, body: dict = Body(...), u=Depends(get_user)):
    from routes_chat import get_conv, post_message
    t = await load_task(tid, u)
    c = await get_conv(body.get("conversation_id"), u, member=True)
    card = {k: t.get(k) for k in ("id", "number", "number_str", "title", "status", "priority", "deadline", "label_ids", "assignee_id")}
    return await post_message(c, u, {"type": "task", "text": body.get("text", ""), "task": card, "attachments": []})


@router.post("/item-types")
async def add_item_type(body: dict = Body(...), u=Depends(get_user)):
    name = (body.get("name") or "").strip()[:60]
    if not name:
        raise HTTPException(400, "Nama item wajib diisi")
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"item_types": 1})
    items = ws.get("item_types") or []
    if not any(i["name"].lower() == name.lower() for i in items):
        rx = {"$regex": f"^{re.escape(name)}$", "$options": "i"}
        await db.workspaces.update_one({"id": u["workspace_id"], "item_types.name": {"$not": rx}},
                                       {"$push": {"item_types": {"name": name, "color": ITEM_COLORS[len(items) % len(ITEM_COLORS)]}}})
    return (await db.workspaces.find_one({"id": u["workspace_id"]}, {"item_types": 1})).get("item_types", [])


@router.get("/stats/monthly")
async def monthly_stats(month: str = Query(None), user_id: str = Query(None), u=Depends(get_user)):
    try:
        y, m = map(int, (month or datetime.now(timezone.utc).strftime("%Y-%m")).split("-"))
        start, end = f"{y:04d}-{m:02d}-01", f"{y + (m == 12):04d}-{m % 12 + 1:02d}-01"
    except ValueError:
        raise HTTPException(400, "Invalid month")
    rng = {"$gte": start, "$lt": end}
    q = {"workspace_id": u["workspace_id"], "archived": {"$ne": True}, "assignee_id": {"$ne": None},
         "$or": [{"submit_date": rng}, {"completed_at": rng}, {"deadline": rng}, {"created_at": rng}]}
    if not is_manager(u):
        q["assignee_id"] = u["user_id"]
    elif user_id:
        q["assignee_id"] = user_id
    await scoped(u, q)
    fields = {"_id": 0, "id": 1, "number_str": 1, "title": 1, "item_type": 1, "status": 1, "assignee_id": 1, "label_ids": 1,
              "submit_date": 1, "deadline": 1, "completed_at": 1, "created_at": 1}
    tasks = await db.tasks.find(q, fields).sort("created_at", -1).to_list(5000)
    return {"month": f"{y:04d}-{m:02d}", "scope": "all" if is_manager(u) and not user_id else "user", "tasks": tasks}


# ---------- Labels ----------
@router.get("/labels")
async def list_labels(u=Depends(get_user)):
    return await db.labels.find({"workspace_id": u["workspace_id"]}, P).sort("name", 1).to_list(500)


@router.post("/labels")
async def create_label(body: dict = Body(...), u=Depends(get_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Label name is required")
    if await db.labels.find_one({"workspace_id": u["workspace_id"], "name": name}):
        raise HTTPException(409, "Label already exists")
    lb = {"id": new_id("lbl"), "workspace_id": u["workspace_id"], "name": name[:60], "color": body.get("color") or "#FF5364",
          "description": body.get("description", ""), "department": body.get("department", ""), "project_id": body.get("project_id"),
          "archived": False, "created_by": u["user_id"], "created_at": now_iso()}
    await db.labels.insert_one(dict(lb))
    return lb


@router.patch("/labels/{lid}")
async def update_label(lid: str, body: dict = Body(...), u=Depends(get_user)):
    require_manager(u)
    upd = {k: v for k, v in body.items() if k in ("name", "color", "description", "department", "project_id", "archived")}
    if "name" in upd and not str(upd["name"]).strip():
        raise HTTPException(400, "Label name is required")
    await db.labels.update_one({"id": lid, "workspace_id": u["workspace_id"]}, {"$set": upd})
    return await db.labels.find_one({"id": lid}, P)


@router.delete("/labels/{lid}")
async def delete_label(lid: str, u=Depends(get_user)):
    require_manager(u)
    used = await db.tasks.count_documents({"workspace_id": u["workspace_id"], "label_ids": lid})
    if used:
        raise HTTPException(409, f"Label is used by {used} tasks. Archive it instead.")
    await db.labels.delete_one({"id": lid, "workspace_id": u["workspace_id"]})
    await audit(u, "label.delete", lid)
    return {"ok": True}


@router.put("/settings/task-config")
async def task_config(body: dict = Body(...), u=Depends(get_user)):
    require_manager(u)
    upd = {}
    if "task_statuses" in body:
        sts = body["task_statuses"]
        if not sts or not all(s.get("key") and s.get("name") for s in sts):
            raise HTTPException(400, "Each status needs a key and name")
        if not any(s.get("is_done") for s in sts):
            raise HTTPException(400, "At least one status must be marked as done")
        keys = {s["key"] for s in sts}
        used = await db.tasks.distinct("status", {"workspace_id": u["workspace_id"]})
        if set(used) - keys:
            raise HTTPException(409, "Some removed statuses are still used by tasks")
        upd["task_statuses"] = [{"key": s["key"], "name": s["name"], "color": s.get("color", "#DDEEFF"), "is_done": bool(s.get("is_done"))} for s in sts]
    if "task_fields" in body:
        upd["task_fields"] = [{"key": f.get("key") or new_id("tf"), "name": f["name"], "type": f.get("type", "text")} for f in body["task_fields"] if f.get("name")]
    await db.workspaces.update_one({"id": u["workspace_id"]}, {"$set": upd})
    await audit(u, "task_config.update")
    return await db.workspaces.find_one({"id": u["workspace_id"]}, P)


# ---------- Projects ----------
async def project_progress(p, dk):
    total = await db.tasks.count_documents({"project_id": p["id"], "archived": {"$ne": True}})
    done = await db.tasks.count_documents({"project_id": p["id"], "archived": {"$ne": True}, "status": {"$in": list(dk)}})
    return {**p, "task_total": total, "task_done": done, "progress": round(done * 100 / total) if total else 0}


@router.get("/projects")
async def list_projects(u=Depends(get_user)):
    dk = done_keys(await ws_statuses(u["workspace_id"]))
    ps = await db.projects.find({"workspace_id": u["workspace_id"]}, P).sort("created_at", -1).to_list(500)
    return [await project_progress(p, dk) for p in ps]


@router.get("/projects/{pid}")
async def get_project(pid: str, u=Depends(get_user)):
    p = await db.projects.find_one({"id": pid, "workspace_id": u["workspace_id"]}, P)
    if not p:
        raise HTTPException(404, "Project not found")
    return await project_progress(p, done_keys(await ws_statuses(u["workspace_id"])))


@router.post("/projects")
async def create_project(body: dict = Body(...), u=Depends(get_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Project name is required")
    members = sorted(set(body.get("member_ids", [])) | {u["user_id"]})
    p = {"id": new_id("prj"), "workspace_id": u["workspace_id"], "name": name[:120], "description": body.get("description", ""),
         "owner_id": u["user_id"], "member_ids": members, "start_date": body.get("start_date"), "deadline": body.get("deadline"),
         "status": body.get("status", "active"), "label_ids": body.get("label_ids", []), "department": body.get("department", ""),
         "location": body.get("location", ""), "color": body.get("color", "#FF5364"), "conversation_id": None, "created_at": now_iso()}
    if body.get("create_group", True):
        from routes_chat import create_group
        g = await create_group({"name": name, "description": f"Project group for {name}", "group_type": "project", "member_ids": members}, u)
        p["conversation_id"] = g["id"]
    await db.projects.insert_one(dict(p))
    await notify(u["workspace_id"], members, "project", f"You were added to project {name}", "", f"/projects/{p['id']}", u["user_id"])
    return p


@router.patch("/projects/{pid}")
async def update_project(pid: str, body: dict = Body(...), u=Depends(get_user)):
    p = await db.projects.find_one({"id": pid, "workspace_id": u["workspace_id"]}, P)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["owner_id"] != u["user_id"] and not is_manager(u):
        raise HTTPException(403, "Only the owner or managers can edit this project")
    upd = {k: v for k, v in body.items() if k in ("name", "description", "member_ids", "start_date", "deadline", "status", "label_ids", "department", "location", "color", "owner_id")}
    await db.projects.update_one({"id": pid}, {"$set": upd})
    if "member_ids" in upd and p.get("conversation_id"):
        await db.conversations.update_one({"id": p["conversation_id"]}, {"$addToSet": {"member_ids": {"$each": upd["member_ids"]}}})
    return await get_project(pid, u)


@router.get("/activity")
async def team_activity(u=Depends(get_user)):
    q = {"workspace_id": u["workspace_id"]}
    ids = await board_scope(u)
    if ids is not None:
        q["task_id"] = {"$in": await db.tasks.distinct("id", {"workspace_id": u["workspace_id"], "board_id": {"$in": ids}})}
    return await db.task_activity.find(q, P).sort("created_at", -1).limit(30).to_list(30)
