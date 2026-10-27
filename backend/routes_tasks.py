import csv
import io
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Body, Request
from fastapi.responses import Response
from core import db, now_iso, new_id, get_user, is_admin, is_manager, require_manager, notify, manager, audit

router = APIRouter(prefix="/api")
P = {"_id": 0}
PRIORITIES = ["low", "medium", "high", "urgent"]
TASK_FIELDS = {"title", "description", "status", "assignee_id", "collaborator_ids", "priority", "start_date", "deadline", "deadline_has_time",
               "project_id", "department", "label_ids", "card_color", "card_style", "checklist", "subtasks", "links", "attachments",
               "estimate", "custom", "reviewer_id", "skip_review", "reminder_at"}
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
    ids = {t.get("requestor_id"), t.get("assignee_id"), t.get("created_by"), t.get("reviewer_id"), *(t.get("collaborator_ids") or [])}
    if project and (project.get("owner_id") == u["user_id"] or u["user_id"] in project.get("member_ids", [])):
        return True
    return u["user_id"] in ids


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
        rx = {"$regex": p["q"], "$options": "i"}
        q.setdefault("$and", []).append({"$or": [{"title": rx}, {"description": rx}, {"number_str": rx}]})
    return q


@router.get("/tasks")
async def list_tasks(request: Request, u=Depends(get_user)):
    statuses = await ws_statuses(u["workspace_id"])
    q = build_query(u, dict(request.query_params), statuses)
    return await db.tasks.find(q, {"_id": 0, "description": 0}).sort("updated_at", -1).to_list(3000)


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
    counter = await db.counters.find_one_and_update({"id": f"task_{u['workspace_id']}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    n = counter["seq"]
    t = {k: body.get(k) for k in TASK_FIELDS if k in body}
    t.update({"id": new_id("task"), "number": n, "number_str": f"T-{n}", "workspace_id": u["workspace_id"], "title": title[:300],
              "status": status, "priority": body.get("priority") or "medium", "requestor_id": u["user_id"], "created_by": u["user_id"],
              "label_ids": body.get("label_ids") or [], "collaborator_ids": body.get("collaborator_ids") or [],
              "checklist": body.get("checklist") or [], "subtasks": body.get("subtasks") or [], "links": body.get("links") or [],
              "attachments": await clean_attachments(body.get("attachments"), u["workspace_id"]), "comment_count": 0,
              "archived": False, "completed_at": None, "completed_by": None, "conversation_id": body.get("conversation_id"),
              "message_id": body.get("message_id"), "created_at": now_iso(), "updated_at": now_iso()})
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
    await manager.send(list(manager.conns.keys()), {"type": "tasks:changed", "data": {"workspace_id": u["workspace_id"]}})


async def load_task(tid, u):
    t = await db.tasks.find_one({"id": tid, "workspace_id": u["workspace_id"]}, P)
    if not t:
        raise HTTPException(404, "Task not found")
    return t


@router.get("/tasks/export")
async def export_tasks(request: Request, u=Depends(get_user)):
    p = dict(request.query_params)
    statuses = await ws_statuses(u["workspace_id"])
    tasks = await db.tasks.find(build_query(u, p, statuses), P).sort("number", 1).to_list(20000)
    users = {x["user_id"]: x["name"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1, "name": 1})}
    labels = {x["id"]: x["name"] async for x in db.labels.find({"workspace_id": u["workspace_id"]}, {"id": 1, "name": 1})}
    projects = {x["id"]: x["name"] async for x in db.projects.find({"workspace_id": u["workspace_id"]}, {"id": 1, "name": 1})}
    smap = {s["key"]: s["name"] for s in statuses}
    base = str(request.base_url).replace("http://", "https://").rstrip("/")
    rows = []
    for t in tasks:
        rows.append({"Task ID": t["number_str"], "Task Name": t["title"], "Description": strip_html(t.get("description") or ""),
                     "Status": smap.get(t["status"], t["status"]), "Requestor": users.get(t.get("requestor_id"), ""),
                     "Assignee": users.get(t.get("assignee_id"), ""), "Priority": (t.get("priority") or "").title(),
                     "IP / Brand Labels": "; ".join(labels.get(i, "") for i in t.get("label_ids", [])), "Card Color": t.get("card_color") or "",
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
    project = await db.projects.find_one({"id": t.get("project_id")}, P) if t.get("project_id") else None
    t["can_edit"] = can_edit(t, u, project)
    return t


async def apply_update(t, body, u, statuses):
    upd = {k: v for k, v in body.items() if k in TASK_FIELDS}
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
    await apply_update(t, body, u, await ws_statuses(u["workspace_id"]))
    await broadcast(u)
    return await get_task(tid, u)


@router.post("/tasks/bulk")
async def bulk_update(body: dict = Body(...), u=Depends(get_user)):
    statuses = await ws_statuses(u["workspace_id"])
    patch = body.get("patch") or {}
    done = 0
    for tid in body.get("ids", [])[:500]:
        t = await db.tasks.find_one({"id": tid, "workspace_id": u["workspace_id"]}, P)
        if t and can_edit(t, u):
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
    c = {"id": new_id("cmt"), "task_id": tid, "workspace_id": u["workspace_id"], "author_id": u["user_id"], "text": text[:4000],
         "mention_ids": body.get("mention_ids", []), "created_at": now_iso()}
    await db.task_comments.insert_one(dict(c))
    await db.tasks.update_one({"id": tid}, {"$inc": {"comment_count": 1}, "$set": {"updated_at": now_iso()}})
    await log(t, u, "commented", {"text": text[:140]})
    link = f"/tasks?task={tid}"
    await notify(u["workspace_id"], c["mention_ids"], "mention", f"{u['name']} mentioned you on {t['title']}", text, link, u["user_id"])
    await notify(u["workspace_id"], [x for x in [t.get("assignee_id"), t.get("requestor_id")] if x not in c["mention_ids"]], "task_assigned", f"New comment on {t['title']}", text, link, u["user_id"])
    return c


@router.post("/tasks/{tid}/share")
async def share_task(tid: str, body: dict = Body(...), u=Depends(get_user)):
    from routes_chat import get_conv, post_message
    t = await load_task(tid, u)
    c = await get_conv(body.get("conversation_id"), u, member=True)
    card = {k: t.get(k) for k in ("id", "number", "number_str", "title", "status", "priority", "deadline", "label_ids", "assignee_id")}
    return await post_message(c, u, {"type": "task", "text": body.get("text", ""), "task": card, "attachments": []})


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
    return await db.task_activity.find({"workspace_id": u["workspace_id"]}, P).sort("created_at", -1).limit(30).to_list(30)
