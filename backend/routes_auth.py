import os
from datetime import datetime, timezone, timedelta
import requests
from fastapi import APIRouter, Request, Response, HTTPException, Depends, Body
from core import db, NO_ID, now_iso, new_id, get_user, token_from_request, audit

router = APIRouter(prefix="/api")
REAL_WS = "ws_internal"
DEMO_WS = "ws_demo"


def demo_enabled():
    return os.environ.get("DEMO_MODE_ENABLED", "false").lower() == "true"


async def make_session(response, user_id, demo=False):
    token = new_id("sess") + new_id("x")
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": token, "demo": demo,
                                       "expires_at": datetime.now(timezone.utc) + timedelta(days=7), "created_at": now_iso()})
    response.set_cookie("session_token", token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 86400)
    return token


async def me_payload(u):
    ws = await db.workspaces.find_one({"id": u["workspace_id"]}, {"_id": 0})
    prefs = await db.user_prefs.find_one({"user_id": u["user_id"]}, {"_id": 0}) or {"user_id": u["user_id"]}
    return {"user": u, "workspace": ws, "prefs": prefs}


@router.post("/auth/session")
async def auth_session(response: Response, body: dict = Body(...)):
    sid = body.get("session_id")
    if not sid:
        raise HTTPException(400, "session_id required")
    r = requests.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": sid}, timeout=20)
    if r.status_code != 200:
        raise HTTPException(401, "Google authentication failed")
    g = r.json()
    email = g["email"].lower().strip()
    ws = await db.workspaces.find_one({"id": REAL_WS}, {"_id": 0})
    u = await db.users.find_one({"email": email, "is_demo": {"$ne": True}}, {"_id": 0})
    if u:
        if u["status"] == "pending":
            raise HTTPException(403, "pending")
        if u["status"] != "active":
            raise HTTPException(403, "inactive")
        upd = {"last_login": now_iso()}
        if not u.get("picture") and g.get("picture"):
            upd["picture"] = g["picture"]
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": upd})
    else:
        supers = [e.strip().lower() for e in os.environ.get("SUPER_ADMIN_EMAILS", "").split(",") if e.strip()]
        invite = await db.invitations.find_one({"email": email, "workspace_id": REAL_WS, "used": False}, {"_id": 0})
        domain = email.split("@")[-1]
        role, status = "employee", "pending"
        if email in supers:
            role, status = "super_admin", "active"
        elif invite:
            role, status = invite.get("role", "employee"), "active"
        elif domain in ws.get("allowed_domains", []) and ws.get("auto_join_domain", True):
            status = "active"
        elif not ws.get("require_approval", True):
            raise HTTPException(403, "not_allowed")
        u = {"user_id": new_id("user"), "email": email, "name": g.get("name") or email.split("@")[0], "picture": g.get("picture", ""),
             "role": role, "status": status, "is_demo": False, "workspace_id": REAL_WS, "job_title": "", "department": "",
             "division": "", "team": "", "org_unit_id": None, "manager_id": None, "employment_status": "Full-time",
             "join_date": now_iso()[:10], "work_mode": "Office", "city": "", "office": "", "custom_location": "",
             "share_location": True, "timezone": "Asia/Jakarta", "bio": "", "skills": [], "phone": "", "employee_id": "",
             "custom": {}, "created_at": now_iso(), "last_login": now_iso()}
        await db.users.insert_one(dict(u))
        if invite:
            await db.invitations.update_one({"id": invite["id"]}, {"$set": {"used": True}})
        if status != "active":
            raise HTTPException(403, "pending")
        await db.conversations.update_many({"workspace_id": REAL_WS, "is_default": True}, {"$addToSet": {"member_ids": u["user_id"]}})
    await make_session(response, u["user_id"])
    u = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0})
    return await me_payload(u)


@router.get("/auth/me")
async def auth_me(u=Depends(get_user)):
    return await me_payload(u)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    t = token_from_request(request)
    if t:
        await db.user_sessions.delete_one({"session_token": t})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@router.get("/auth/demo-users")
async def demo_users():
    if not demo_enabled():
        return {"enabled": False, "users": []}
    users = await db.users.find({"is_demo": True, "workspace_id": DEMO_WS}, {"_id": 0, "user_id": 1, "name": 1, "job_title": 1, "picture": 1}).to_list(50)
    return {"enabled": True, "users": users}


@router.post("/auth/demo")
async def demo_login(response: Response, body: dict = Body(...)):
    if not demo_enabled():
        raise HTTPException(403, "Demo mode disabled")
    u = await db.users.find_one({"user_id": body.get("user_id"), "is_demo": True}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Demo user not found")
    await make_session(response, u["user_id"], demo=True)
    return await me_payload(u)


@router.get("/admin/users")
async def admin_users(u=Depends(get_user)):
    from core import require_admin
    require_admin(u)
    return await db.users.find({"workspace_id": u["workspace_id"]}, {"_id": 0}).sort("name", 1).to_list(2000)


@router.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, body: dict = Body(...), u=Depends(get_user)):
    from core import require_admin, ROLES
    require_admin(u)
    t = await db.users.find_one({"user_id": uid, "workspace_id": u["workspace_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "User not found")
    upd = {}
    if "role" in body:
        if body["role"] not in ROLES:
            raise HTTPException(400, "Invalid role")
        if (body["role"] in ("super_admin", "workspace_admin") or t["role"] == "super_admin") and u["role"] != "super_admin":
            raise HTTPException(403, "Only Super Admin can manage administrators")
        upd["role"] = body["role"]
    if "status" in body:
        if body["status"] not in ("active", "inactive", "pending"):
            raise HTTPException(400, "Invalid status")
        if uid == u["user_id"]:
            raise HTTPException(400, "You cannot change your own status")
        upd["status"] = body["status"]
        if body["status"] == "active":
            await db.conversations.update_many({"workspace_id": u["workspace_id"], "is_default": True}, {"$addToSet": {"member_ids": uid}})
        else:
            await db.user_sessions.delete_many({"user_id": uid})
    await db.users.update_one({"user_id": uid}, {"$set": upd})
    await audit(u, "user.update", uid, upd)
    return await db.users.find_one({"user_id": uid}, {"_id": 0})


@router.get("/admin/invitations")
async def list_invites(u=Depends(get_user)):
    from core import require_admin
    require_admin(u)
    return await db.invitations.find({"workspace_id": u["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/admin/invitations")
async def create_invite(body: dict = Body(...), u=Depends(get_user)):
    from core import require_admin, ROLES
    require_admin(u)
    email = (body.get("email") or "").strip().lower()
    if "@" not in email:
        raise HTTPException(400, "Valid email required")
    role = body.get("role", "employee")
    if role not in ROLES or (role in ("super_admin", "workspace_admin") and u["role"] != "super_admin"):
        raise HTTPException(403, "Role not allowed")
    inv = {"id": new_id("inv"), "workspace_id": u["workspace_id"], "email": email, "role": role, "used": False,
           "invited_by": u["user_id"], "created_at": now_iso()}
    await db.invitations.insert_one(dict(inv))
    await audit(u, "invite.create", email, {"role": role})
    return inv


@router.delete("/admin/invitations/{iid}")
async def delete_invite(iid: str, u=Depends(get_user)):
    from core import require_admin
    require_admin(u)
    await db.invitations.delete_one({"id": iid, "workspace_id": u["workspace_id"]})
    return {"ok": True}
