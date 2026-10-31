import csv
import io
from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File, Query
from fastapi.responses import Response
from core import db, NO_ID, now_iso, new_id, get_user, is_admin, is_manager, require_admin, require_manager, audit, notify, manager

router = APIRouter(prefix="/api")
RANK = {"everyone": 0, "managers": 1, "admins": 2}
DEFAULT_VIS = {"phone": "managers", "employee_id": "managers", "employment_status": "managers", "join_date": "everyone", "email": "everyone"}
SELF_EDITABLE = {"name", "picture", "phone", "bio", "skills", "work_mode", "city", "office", "custom_location", "location_status",
                 "share_location", "timezone", "custom", "nickname"}
ADMIN_EDITABLE = SELF_EDITABLE | {"company", "employee_id", "job_title", "department", "division", "team", "employment_status", "join_date", "manager_id"}
LOCATION_FIELDS = ["work_mode", "city", "office", "custom_location", "location_status"]


def viewer_rank(viewer, target):
    if viewer["user_id"] == target["user_id"] or is_admin(viewer):
        return 2
    return 1 if is_manager(viewer) else 0


def public_user(t, viewer, ws):
    vis = {**DEFAULT_VIS, **(ws.get("field_visibility") or {})}
    rank = viewer_rank(viewer, t)
    out = {k: v for k, v in t.items() if k not in ("last_login",)}
    for f, level in vis.items():
        if RANK.get(level, 0) > rank:
            out.pop(f, None)
    if not t.get("share_location", True) and rank < 2:
        for f in LOCATION_FIELDS:
            out.pop(f, None)
    custom = {}
    for cf in ws.get("profile_fields", []):
        if RANK.get(cf.get("visibility", "everyone"), 0) <= rank and cf["key"] in (t.get("custom") or {}):
            custom[cf["key"]] = t["custom"][cf["key"]]
    out["custom"] = custom
    out["online"] = t["user_id"] in manager.conns
    return out


async def unit_chain(unit_id):
    chain, seen = [], set()
    while unit_id and unit_id not in seen:
        seen.add(unit_id)
        un = await db.org_units.find_one({"id": unit_id}, {"_id": 0})
        if not un:
            break
        chain.append(un)
        unit_id = un.get("parent_id")
    return chain


async def org_fields(unit_id):
    upd = {"department": "", "division": "", "team": ""}
    for un in await unit_chain(unit_id):
        lvl = (un.get("level") or "").lower()
        if lvl in upd and not upd[lvl]:
            upd[lvl] = un["name"]
    return upd


@router.get("/users")
async def list_users(u=Depends(get_user)):
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0})
    users = await db.users.find({"workspace_id": u["workspace_id"], "status": "active"}, {"_id": 0}).sort("name", 1).to_list(5000)
    return [public_user(t, u, ws) for t in users]


@router.get("/users/{uid}")
async def get_profile(uid: str, u=Depends(get_user)):
    t = await db.users.find_one({"user_id": uid, "workspace_id": u["workspace_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Employee not found")
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0})
    from routes_tasks import scoped
    tasks = await db.tasks.find(await scoped(u, {"workspace_id": u["workspace_id"], "assignee_id": uid, "archived": {"$ne": True}}),
                                {"_id": 0, "id": 1, "number": 1, "title": 1, "status": 1, "priority": 1, "deadline": 1, "label_ids": 1}).sort("updated_at", -1).to_list(50)
    out = public_user(t, u, ws)
    out["tasks"] = tasks
    out["can_edit"] = viewer_rank(u, t) == 2
    return out


@router.post("/me/onboarding")
async def onboarding(body: dict = Body(...), u=Depends(get_user)):
    if not u.get("needs_onboarding"):
        raise HTTPException(400, "Profil sudah dilengkapi")
    f = {k: str(body.get(k) or "").strip()[:80] for k in ("name", "nickname", "department", "company", "job_title", "phone", "join_date")}
    missing = [k for k in ("name", "nickname", "department", "company", "job_title") if not f[k]]
    if missing:
        raise HTTPException(400, "Lengkapi semua kolom wajib")
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0, "divisions": 1})
    if f["department"] not in (ws.get("divisions") or []):
        raise HTTPException(400, "Divisi tidak valid")
    if not f["join_date"]:
        f.pop("join_date")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {**f, "needs_onboarding": False}})
    return await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0})


@router.patch("/users/{uid}")
async def update_profile(uid: str, body: dict = Body(...), u=Depends(get_user)):
    t = await db.users.find_one({"user_id": uid, "workspace_id": u["workspace_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Employee not found")
    if uid == u["user_id"] and not is_admin(u):
        allowed = SELF_EDITABLE
    elif is_admin(u):
        allowed = ADMIN_EDITABLE
    else:
        raise HTTPException(403, "You cannot edit this profile")
    upd = {k: v for k, v in body.items() if k in allowed}
    if "name" in upd and not str(upd["name"]).strip():
        raise HTTPException(400, "Name is required")
    if "skills" in upd and not isinstance(upd["skills"], list):
        raise HTTPException(400, "Skills must be a list")
    if "custom" in upd:
        ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0})
        keys = {f["key"] for f in ws.get("profile_fields", [])}
        upd["custom"] = {**(t.get("custom") or {}), **{k: v for k, v in (upd["custom"] or {}).items() if k in keys}}
    if upd.get("manager_id") == uid:
        raise HTTPException(400, "Employee cannot report to themselves")
    await db.users.update_one({"user_id": uid}, {"$set": upd})
    if uid != u["user_id"]:
        await audit(u, "profile.update", uid, {"fields": list(upd.keys())})
    return await get_profile(uid, u)


@router.put("/settings/profile-fields")
async def set_profile_fields(body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    fields = []
    types = {"short_text", "long_text", "email", "phone", "date", "dropdown", "multi_select", "url", "boolean", "location"}
    for i, f in enumerate(body.get("fields", [])):
        if f.get("type") not in types or not f.get("name"):
            raise HTTPException(400, "Invalid field")
        fields.append({"key": f.get("key") or new_id("cf"), "name": f["name"], "type": f["type"], "options": f.get("options", []),
                       "visibility": f.get("visibility", "everyone") if f.get("visibility") in RANK else "everyone", "order": i})
    upd = {"profile_fields": fields}
    if isinstance(body.get("field_visibility"), dict):
        upd["field_visibility"] = {k: v for k, v in body["field_visibility"].items() if v in RANK}
    await db.workspaces.update_one({"id": u["workspace_id"]}, {"$set": upd})
    await audit(u, "profile_fields.update")
    return await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0})


@router.get("/org/units")
async def list_units(u=Depends(get_user)):
    return await db.org_units.find({"workspace_id": u["workspace_id"]}, {"_id": 0}).sort("order", 1).to_list(2000)


@router.post("/org/units")
async def create_unit(body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    if not (body.get("name") or "").strip():
        raise HTTPException(400, "Name is required")
    if body.get("parent_id") and not await db.org_units.find_one({"id": body["parent_id"], "workspace_id": u["workspace_id"]}):
        raise HTTPException(400, "Parent unit not found")
    count = await db.org_units.count_documents({"workspace_id": u["workspace_id"], "parent_id": body.get("parent_id")})
    un = {"id": new_id("unit"), "workspace_id": u["workspace_id"], "name": body["name"].strip(), "level": body.get("level", "Department"),
          "parent_id": body.get("parent_id"), "head_id": body.get("head_id"), "order": count, "created_at": now_iso()}
    await db.org_units.insert_one(dict(un))
    await audit(u, "org.unit.create", un["id"], {"name": un["name"]})
    return un


async def refresh_unit_members(ws_id, unit_id):
    ids = [unit_id]
    i = 0
    while i < len(ids):
        async for c in db.org_units.find({"workspace_id": ws_id, "parent_id": ids[i]}, {"id": 1}):
            ids.append(c["id"])
        i += 1
    for uid_ in ids:
        f = await org_fields(uid_)
        await db.users.update_many({"workspace_id": ws_id, "org_unit_id": uid_}, {"$set": f})


@router.patch("/org/units/{unit_id}")
async def update_unit(unit_id: str, body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    un = await db.org_units.find_one({"id": unit_id, "workspace_id": u["workspace_id"]}, {"_id": 0})
    if not un:
        raise HTTPException(404, "Unit not found")
    upd = {k: v for k, v in body.items() if k in ("name", "level", "parent_id", "head_id", "order")}
    if "parent_id" in upd and upd["parent_id"]:
        chain = await unit_chain(upd["parent_id"])
        if any(c["id"] == unit_id for c in chain):
            raise HTTPException(400, "A unit cannot be moved inside itself")
    await db.org_units.update_one({"id": unit_id}, {"$set": upd})
    if {"name", "level", "parent_id"} & upd.keys():
        await refresh_unit_members(u["workspace_id"], unit_id)
    await audit(u, "org.unit.update", unit_id, upd)
    return await db.org_units.find_one({"id": unit_id}, {"_id": 0})


@router.put("/org/units-order")
async def reorder_units(body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    for i, uid_ in enumerate(body.get("ids", [])):
        await db.org_units.update_one({"id": uid_, "workspace_id": u["workspace_id"]}, {"$set": {"order": i}})
    return {"ok": True}


@router.delete("/org/units/{unit_id}")
async def delete_unit(unit_id: str, reassign_to: str = Query(None), u=Depends(get_user)):
    require_admin(u)
    ws_id = u["workspace_id"]
    un = await db.org_units.find_one({"id": unit_id, "workspace_id": ws_id}, {"_id": 0})
    if not un:
        raise HTTPException(404, "Unit not found")
    kids = await db.org_units.count_documents({"workspace_id": ws_id, "parent_id": unit_id})
    members = await db.users.count_documents({"workspace_id": ws_id, "org_unit_id": unit_id})
    if kids or members:
        if not reassign_to or reassign_to == unit_id:
            raise HTTPException(409, f"Unit has {kids} sub-units and {members} employees; choose a unit to reassign them to")
        target = await db.org_units.find_one({"id": reassign_to, "workspace_id": ws_id})
        if not target or any(c["id"] == unit_id for c in await unit_chain(reassign_to)):
            raise HTTPException(400, "Invalid reassignment target")
        await db.org_units.update_many({"workspace_id": ws_id, "parent_id": unit_id}, {"$set": {"parent_id": reassign_to}})
        await db.users.update_many({"workspace_id": ws_id, "org_unit_id": unit_id}, {"$set": {"org_unit_id": reassign_to}})
        await refresh_unit_members(ws_id, reassign_to)
    await db.org_units.delete_one({"id": unit_id})
    await audit(u, "org.unit.delete", unit_id, {"name": un["name"], "reassign_to": reassign_to})
    return {"ok": True}


@router.patch("/org/members/{uid}")
async def move_member(uid: str, body: dict = Body(...), u=Depends(get_user)):
    require_manager(u)
    t = await db.users.find_one({"user_id": uid, "workspace_id": u["workspace_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Employee not found")
    upd = {}
    if "org_unit_id" in body:
        if body["org_unit_id"] and not await db.org_units.find_one({"id": body["org_unit_id"], "workspace_id": u["workspace_id"]}):
            raise HTTPException(400, "Unit not found")
        upd["org_unit_id"] = body["org_unit_id"]
        upd.update(await org_fields(body["org_unit_id"]))
    if "manager_id" in body:
        if body["manager_id"] == uid:
            raise HTTPException(400, "Employee cannot report to themselves")
        upd["manager_id"] = body["manager_id"]
    if "job_title" in body:
        upd["job_title"] = body["job_title"]
    await db.users.update_one({"user_id": uid}, {"$set": upd})
    await audit(u, "org.member.move", uid, upd)
    await notify(u["workspace_id"], [uid], "org_change", "Your organization details were updated", "", f"/people/{uid}", u["user_id"])
    return await db.users.find_one({"user_id": uid}, {"_id": 0})


@router.get("/org/export")
async def export_org(u=Depends(get_user)):
    require_manager(u)
    units = {x["id"]: x async for x in db.org_units.find({"workspace_id": u["workspace_id"]}, {"_id": 0})}
    users = await db.users.find({"workspace_id": u["workspace_id"], "status": "active"}, {"_id": 0}).to_list(5000)
    emails = {x["user_id"]: x["email"] for x in users}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "email", "job_title", "unit", "unit_level", "department", "division", "team", "manager_email", "work_mode", "city"])
    for x in users:
        un = units.get(x.get("org_unit_id")) or {}
        w.writerow([x["name"], x["email"], x.get("job_title", ""), un.get("name", ""), un.get("level", ""), x.get("department", ""),
                    x.get("division", ""), x.get("team", ""), emails.get(x.get("manager_id"), ""), x.get("work_mode", ""), x.get("city", "")])
    return Response(buf.getvalue().encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=organization.csv"})


@router.post("/org/import")
async def import_org(file: UploadFile = File(...), u=Depends(get_user)):
    require_admin(u)
    raw = (await file.read()).decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(raw)))
    ws_id = u["workspace_id"]
    created = updated = 0
    for r in rows:
        email = (r.get("email") or "").strip().lower()
        if "@" not in email:
            continue
        unit_id = None
        if r.get("unit"):
            un = await db.org_units.find_one({"workspace_id": ws_id, "name": r["unit"].strip()})
            if not un:
                root = await db.org_units.find_one({"workspace_id": ws_id, "parent_id": None})
                un = {"id": new_id("unit"), "workspace_id": ws_id, "name": r["unit"].strip(), "level": r.get("unit_level") or "Department",
                      "parent_id": root["id"] if root else None, "head_id": None, "order": 99, "created_at": now_iso()}
                await db.org_units.insert_one(dict(un))
            unit_id = un["id"]
        fields = {"job_title": r.get("job_title", ""), "work_mode": r.get("work_mode") or "Office", "city": r.get("city", "")}
        if unit_id:
            fields["org_unit_id"] = unit_id
            fields.update(await org_fields(unit_id))
        ex = await db.users.find_one({"workspace_id": ws_id, "email": email})
        if ex:
            await db.users.update_one({"email": email, "workspace_id": ws_id}, {"$set": fields})
            updated += 1
        else:
            await db.users.insert_one({"user_id": new_id("user"), "email": email, "name": r.get("name") or email.split("@")[0], "picture": "",
                                       "role": "employee", "status": "active", "is_demo": ws_id == "ws_demo", "workspace_id": ws_id,
                                       "manager_id": None, "employment_status": "Full-time", "join_date": now_iso()[:10], "skills": [],
                                       "custom": {}, "share_location": True, "timezone": "Asia/Jakarta", "bio": "", "phone": "",
                                       "employee_id": "", "source": "import", "created_at": now_iso(), **fields})
            created += 1
    for r in rows:
        if r.get("manager_email"):
            m = await db.users.find_one({"workspace_id": ws_id, "email": r["manager_email"].strip().lower()})
            if m:
                await db.users.update_one({"workspace_id": ws_id, "email": (r.get("email") or "").strip().lower()}, {"$set": {"manager_id": m["user_id"]}})
    await audit(u, "org.import", file.filename, {"created": created, "updated": updated})
    return {"created": created, "updated": updated}
