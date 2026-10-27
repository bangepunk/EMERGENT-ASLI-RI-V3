import os
import uuid
import json
import logging
from datetime import datetime, timezone
from fastapi import Request, HTTPException, WebSocket
from motor.motor_asyncio import AsyncIOMotorClient
import requests

logger = logging.getLogger("circle")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

ADMIN_ROLES = {"super_admin", "workspace_admin"}
MANAGER_ROLES = ADMIN_ROLES | {"department_manager", "project_manager"}
ROLES = ["super_admin", "workspace_admin", "department_manager", "project_manager", "employee"]
NO_ID = {"_id": 0}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def is_admin(u):
    return u.get("role") in ADMIN_ROLES


def is_manager(u):
    return u.get("role") in MANAGER_ROLES


def require_admin(u):
    if not is_admin(u):
        raise HTTPException(403, "Admin permission required")


def require_manager(u):
    if not is_manager(u):
        raise HTTPException(403, "Manager permission required")


async def user_from_token(token):
    if not token:
        return None
    s = await db.user_sessions.find_one({"session_token": token}, NO_ID)
    if not s:
        return None
    exp = s["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None
    u = await db.users.find_one({"user_id": s["user_id"]}, NO_ID)
    if not u or u.get("status") != "active":
        return None
    return u


def token_from_request(request):
    t = request.cookies.get("session_token")
    if not t:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            t = h[7:]
    return t


async def get_user(request: Request):
    u = await user_from_token(token_from_request(request))
    if not u:
        raise HTTPException(401, "Not authenticated")
    return u


async def get_settings(ws_id):
    return await db.workspaces.find_one({"id": ws_id}, NO_ID)


async def audit(u, action, target="", meta=None):
    await db.audit_logs.insert_one({"id": new_id("aud"), "workspace_id": u["workspace_id"], "actor_id": u["user_id"],
                                    "actor_name": u.get("name"), "action": action, "target": target,
                                    "meta": meta or {}, "created_at": now_iso()})


class Manager:
    def __init__(self):
        self.conns = {}

    async def connect(self, uid, ws: WebSocket):
        self.conns.setdefault(uid, set()).add(ws)

    def disconnect(self, uid, ws):
        s = self.conns.get(uid)
        if s:
            s.discard(ws)
            if not s:
                self.conns.pop(uid, None)

    def online(self):
        return list(self.conns.keys())

    async def send(self, user_ids, event):
        data = json.dumps(event, default=str)
        for uid in set(user_ids):
            for ws in list(self.conns.get(uid, [])):
                try:
                    await ws.send_text(data)
                except Exception:
                    self.disconnect(uid, ws)


manager = Manager()

NOTIF_CATEGORY = {"dm": "messages", "group_message": "messages", "mention": "mentions", "call": "calls",
                  "missed_call": "calls", "task_assigned": "tasks", "task_reassigned": "tasks",
                  "deadline_changed": "tasks", "deadline_upcoming": "deadlines", "overdue": "deadlines",
                  "task_completed": "tasks", "task_review": "tasks", "poll": "polls", "group_invite": "groups",
                  "org_change": "org", "project": "tasks"}


async def notify(ws_id, user_ids, ntype, title, body="", link="", actor_id=None, conv_id=None):
    targets = [x for x in set(user_ids) if x and x != actor_id]
    if not targets:
        return
    cat = NOTIF_CATEGORY.get(ntype, "other")
    prefs = {p["user_id"]: p async for p in db.user_prefs.find({"user_id": {"$in": targets}}, NO_ID)}
    for uid in targets:
        p = prefs.get(uid, {})
        if p.get("notifications", {}).get(cat) is False:
            continue
        if conv_id and conv_id in p.get("muted_conversations", []) and ntype not in ("mention", "call"):
            continue
        n = {"id": new_id("ntf"), "workspace_id": ws_id, "user_id": uid, "type": ntype, "category": cat,
             "title": title, "body": body[:200], "link": link, "actor_id": actor_id, "read": False,
             "created_at": now_iso()}
        await db.notifications.insert_one(dict(n))
        await manager.send([uid], {"type": "notification", "data": n})


STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "circle"
_storage_key = None


def init_storage(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def put_object(path, data, content_type):
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 404:
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(True), "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def get_object(path):
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")
