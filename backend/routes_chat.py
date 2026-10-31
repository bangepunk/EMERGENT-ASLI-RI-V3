import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Body, Query, WebSocket, WebSocketDisconnect
from core import db, now_iso, new_id, get_user, is_admin, require_admin, notify, manager, user_from_token, audit

router = APIRouter(prefix="/api")
P = {"_id": 0}


def can_see(conv, u):
    if conv.get("deleted"):
        return False
    if u["user_id"] in conv.get("member_ids", []):
        return True
    return conv["type"] == "group" and conv.get("group_type") in ("public", "department", "project") and not conv.get("private")


async def get_conv(cid, u, member=False):
    c = await db.conversations.find_one({"id": cid, "workspace_id": u["workspace_id"]}, P)
    if not c or not can_see(c, u):
        raise HTTPException(404, "Conversation not found")
    if member and u["user_id"] not in c["member_ids"]:
        raise HTTPException(403, "Join this group first")
    return c


def can_manage_group(c, u):
    return is_admin(u) or u["user_id"] in c.get("admin_ids", [])


@router.get("/conversations")
async def my_conversations(u=Depends(get_user)):
    convs = await db.conversations.find({"workspace_id": u["workspace_id"], "member_ids": u["user_id"], "deleted": {"$ne": True}}, P).sort("last_message_at", -1).to_list(500)
    for c in convs:
        last_read = (c.get("reads") or {}).get(u["user_id"], "")
        c["unread"] = await db.messages.count_documents({"conversation_id": c["id"], "created_at": {"$gt": last_read}, "sender_id": {"$ne": u["user_id"]}, "deleted": {"$ne": True}}) if c.get("last_message_at", "") > last_read else 0
    return convs


@router.get("/groups/browse")
async def browse_groups(u=Depends(get_user)):
    q = {"workspace_id": u["workspace_id"], "type": "group", "deleted": {"$ne": True},
         "$or": [{"member_ids": u["user_id"]}, {"group_type": {"$in": ["public", "department", "project"]}}]}
    gs = await db.conversations.find(q, {"_id": 0, "reads": 0}).sort("name", 1).to_list(500)
    for g in gs:
        g["member_count"] = len(g["member_ids"])
        g["is_member"] = u["user_id"] in g["member_ids"]
    return gs


@router.post("/conversations/dm")
async def open_dm(body: dict = Body(...), u=Depends(get_user)):
    other = body.get("user_id")
    if not await db.users.find_one({"user_id": other, "workspace_id": u["workspace_id"], "status": "active"}):
        raise HTTPException(404, "Employee not found")
    members = sorted({u["user_id"], other})
    c = await db.conversations.find_one({"workspace_id": u["workspace_id"], "type": "dm", "member_ids": members}, P)
    if not c:
        c = {"id": new_id("conv"), "workspace_id": u["workspace_id"], "type": "dm", "member_ids": members, "admin_ids": [],
             "created_by": u["user_id"], "created_at": now_iso(), "last_message_at": now_iso(), "last_message_preview": "", "reads": {}, "pinned_ids": []}
        await db.conversations.insert_one(dict(c))
    return c


@router.post("/groups")
async def create_group(body: dict = Body(...), u=Depends(get_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    gt = body.get("group_type", "public")
    if gt not in ("public", "private", "department", "project"):
        raise HTTPException(400, "Invalid group type")
    valid = [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"], "user_id": {"$in": body.get("member_ids", [])}}, {"user_id": 1})]
    members = sorted(set(valid) | {u["user_id"]})
    c = {"id": new_id("grp"), "workspace_id": u["workspace_id"], "type": "group", "group_type": gt, "name": name[:80],
         "description": body.get("description", ""), "image": body.get("image", ""), "location": body.get("location", ""),
         "member_ids": members, "admin_ids": [u["user_id"]], "created_by": u["user_id"], "created_at": now_iso(),
         "last_message_at": now_iso(), "last_message_preview": "", "reads": {}, "pinned_ids": [], "archived": False}
    await db.conversations.insert_one(dict(c))
    await notify(u["workspace_id"], members, "group_invite", f"You were added to {name}", "", f"/messages/{c['id']}", u["user_id"])
    return c


@router.get("/conversations/{cid}")
async def conversation_detail(cid: str, u=Depends(get_user)):
    c = await get_conv(cid, u)
    if c.get("group_type") == "private" and u["user_id"] not in c["member_ids"]:
        raise HTTPException(404, "Conversation not found")
    c["is_member"] = u["user_id"] in c["member_ids"]
    c["pinned"] = await db.messages.find({"id": {"$in": c.get("pinned_ids", [])}, "deleted": {"$ne": True}}, P).to_list(50)
    files = []
    async for m in db.messages.find({"conversation_id": cid, "attachments.0": {"$exists": True}, "deleted": {"$ne": True}}, P).sort("created_at", -1).limit(60):
        for a in m["attachments"]:
            files.append({**a, "message_id": m["id"], "sender_id": m["sender_id"], "created_at": m["created_at"]})
    c["files"] = files
    c["tasks"] = await db.tasks.find({"workspace_id": u["workspace_id"], "conversation_id": cid}, {"_id": 0, "id": 1, "number": 1, "title": 1, "status": 1}).to_list(50)
    c["active_call"] = await db.calls.find_one({"conversation_id": cid, "status": "active"}, P)
    return c


@router.patch("/groups/{cid}")
async def update_group(cid: str, body: dict = Body(...), u=Depends(get_user)):
    c = await get_conv(cid, u)
    if not can_manage_group(c, u):
        raise HTTPException(403, "Only group admins can edit")
    upd = {k: v for k, v in body.items() if k in ("name", "description", "image", "location", "group_type", "archived")}
    if "name" in upd and not str(upd["name"]).strip():
        raise HTTPException(400, "Group name is required")
    await db.conversations.update_one({"id": cid}, {"$set": upd})
    return {"ok": True}


@router.delete("/groups/{cid}")
async def delete_group(cid: str, u=Depends(get_user)):
    c = await get_conv(cid, u)
    if c.get("is_default") or not can_manage_group(c, u):
        raise HTTPException(403, "This group cannot be deleted by you")
    await db.conversations.update_one({"id": cid}, {"$set": {"deleted": True}})
    await audit(u, "group.delete", cid, {"name": c.get("name")})
    return {"ok": True}


@router.post("/groups/{cid}/join")
async def join_group(cid: str, u=Depends(get_user)):
    c = await get_conv(cid, u)
    if c.get("group_type") == "private":
        raise HTTPException(403, "Private group")
    await db.conversations.update_one({"id": cid}, {"$addToSet": {"member_ids": u["user_id"]}})
    return {"ok": True}


@router.post("/groups/{cid}/leave")
async def leave_group(cid: str, u=Depends(get_user)):
    await db.conversations.update_one({"id": cid, "workspace_id": u["workspace_id"]}, {"$pull": {"member_ids": u["user_id"], "admin_ids": u["user_id"]}})
    return {"ok": True}


@router.post("/groups/{cid}/members")
async def manage_members(cid: str, body: dict = Body(...), u=Depends(get_user)):
    c = await get_conv(cid, u)
    if not can_manage_group(c, u):
        raise HTTPException(403, "Only group admins can manage members")
    add = [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"], "user_id": {"$in": body.get("add", [])}}, {"user_id": 1})]
    if add:
        await db.conversations.update_one({"id": cid}, {"$addToSet": {"member_ids": {"$each": add}}})
        await notify(u["workspace_id"], add, "group_invite", f"You were added to {c.get('name')}", "", f"/messages/{cid}", u["user_id"])
    if body.get("remove"):
        await db.conversations.update_one({"id": cid}, {"$pull": {"member_ids": {"$in": body["remove"]}, "admin_ids": {"$in": body["remove"]}}})
    if body.get("admin_id"):
        op = "$addToSet" if body.get("make_admin", True) else "$pull"
        await db.conversations.update_one({"id": cid}, {op: {"admin_ids": body["admin_id"]}})
    return {"ok": True}


@router.post("/conversations/{cid}/mute")
async def mute(cid: str, body: dict = Body(...), u=Depends(get_user)):
    await get_conv(cid, u)
    op = "$addToSet" if body.get("muted", True) else "$pull"
    await db.user_prefs.update_one({"user_id": u["user_id"]}, {op: {"muted_conversations": cid}}, upsert=True)
    return {"ok": True}


@router.get("/conversations/{cid}/messages")
async def messages(cid: str, before: str = Query(None), q: str = Query(None), limit: int = 50, u=Depends(get_user)):
    c = await get_conv(cid, u)
    if c.get("group_type") == "private" and u["user_id"] not in c["member_ids"]:
        raise HTTPException(404, "Conversation not found")
    query = {"conversation_id": cid}
    if before:
        query["created_at"] = {"$lt": before}
    if q:
        import re
        query["text"] = {"$regex": re.escape(q), "$options": "i"}
        query["deleted"] = {"$ne": True}
    ms = await db.messages.find(query, P).sort("created_at", -1).limit(min(limit, 100)).to_list(100)
    return list(reversed(ms))


@router.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: dict = Body(...), u=Depends(get_user)):
    c = await get_conv(cid, u, member=True)
    if c.get("archived"):
        raise HTTPException(400, "Group is archived")
    text = (body.get("text") or "")[:8000]
    mtype = body.get("type", "text")
    if mtype not in ("text", "sticker", "task"):
        raise HTTPException(400, "Invalid type")
    atts = []
    for a in body.get("attachments", [])[:10]:
        f = await db.files.find_one({"id": a.get("id"), "workspace_id": u["workspace_id"]}, P)
        if f:
            atts.append({"id": f["id"], "name": f["name"], "content_type": f["content_type"], "size": f["size"]})
    sticker = None
    if mtype == "sticker":
        sticker = await db.stickers.find_one({"id": body.get("sticker_id"), "workspace_id": {"$in": [u["workspace_id"], "global"]}}, P)
        if not sticker:
            raise HTTPException(404, "Sticker not found")
        await db.user_prefs.update_one({"user_id": u["user_id"]}, {"$inc": {f"sticker_usage.{sticker['id']}": 1}, "$set": {f"sticker_recent.{sticker['id']}": now_iso()}}, upsert=True)
    if mtype == "text" and not text.strip() and not atts:
        raise HTTPException(400, "Message is empty")
    reply = None
    if body.get("reply_to"):
        r = await db.messages.find_one({"id": body["reply_to"], "conversation_id": cid}, P)
        if r:
            reply = {"id": r["id"], "sender_id": r["sender_id"], "text": (r.get("text") or ("Sticker" if r.get("sticker") else "Attachment"))[:140]}
    task = None
    if mtype == "task":
        task = await db.tasks.find_one({"id": body.get("task_id"), "workspace_id": u["workspace_id"]}, {"_id": 0, "id": 1, "number": 1, "title": 1, "status": 1, "priority": 1, "deadline": 1})
        if not task:
            raise HTTPException(404, "Task not found")
    return await post_message(c, u, {"type": mtype, "text": text, "attachments": atts, "sticker": sticker, "reply_to": reply, "task": task,
                                     "mention_ids": [m for m in body.get("mention_ids", []) if m in c["member_ids"]]})


async def post_message(c, u, data):
    m = {"id": new_id("msg"), "conversation_id": c["id"], "workspace_id": c["workspace_id"], "sender_id": u["user_id"],
         "reactions": {}, "edited": False, "deleted": False, "pinned": False, "created_at": now_iso(), **data}
    await db.messages.insert_one(dict(m))
    preview = m.get("text") or ("Sticker" if m.get("sticker") else "Poll" if m.get("type") == "poll" else "Task" if m.get("task") else "Attachment")
    await db.conversations.update_one({"id": c["id"]}, {"$set": {"last_message_at": m["created_at"], "last_message_preview": f"{u['name'].split(' ')[0]}: {preview}"[:120], f"reads.{u['user_id']}": m["created_at"]}})
    await manager.send(c["member_ids"], {"type": "message:new", "data": m})
    title = u["name"] if c["type"] == "dm" else f"{u['name']} in {c.get('name')}"
    mentions = set(data.get("mention_ids") or [])
    if mentions:
        await notify(c["workspace_id"], mentions, "mention", f"{u['name']} mentioned you", preview, f"/messages/{c['id']}", u["user_id"], c["id"])
    if m.get("type") != "system":
        others = [x for x in c["member_ids"] if x not in mentions and x not in manager.conns]
        await notify(c["workspace_id"], others, "dm" if c["type"] == "dm" else "group_message", title, preview, f"/messages/{c['id']}", u["user_id"], c["id"])
    return m


async def own_message(mid, u):
    m = await db.messages.find_one({"id": mid, "workspace_id": u["workspace_id"]}, P)
    if not m:
        raise HTTPException(404, "Message not found")
    c = await get_conv(m["conversation_id"], u, member=True)
    return m, c


@router.patch("/messages/{mid}")
async def edit_message(mid: str, body: dict = Body(...), u=Depends(get_user)):
    m, c = await own_message(mid, u)
    if m["sender_id"] != u["user_id"]:
        raise HTTPException(403, "You can only edit your own messages")
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    await db.messages.update_one({"id": mid}, {"$set": {"text": text, "edited": True}})
    m.update(text=text, edited=True)
    await manager.send(c["member_ids"], {"type": "message:update", "data": m})
    return m


@router.delete("/messages/{mid}")
async def delete_message(mid: str, u=Depends(get_user)):
    m, c = await own_message(mid, u)
    if m["sender_id"] != u["user_id"] and not can_manage_group(c, u):
        raise HTTPException(403, "Not allowed")
    await db.messages.update_one({"id": mid}, {"$set": {"deleted": True, "text": "", "attachments": [], "sticker": None}})
    m.update(deleted=True, text="", attachments=[], sticker=None)
    await manager.send(c["member_ids"], {"type": "message:update", "data": m})
    return {"ok": True}


@router.post("/messages/{mid}/react")
async def react(mid: str, body: dict = Body(...), u=Depends(get_user)):
    m, c = await own_message(mid, u)
    emoji = (body.get("emoji") or "")[:16]
    if not emoji:
        raise HTTPException(400, "Emoji required")
    users = m.get("reactions", {}).get(emoji, [])
    users = [x for x in users if x != u["user_id"]] if u["user_id"] in users else users + [u["user_id"]]
    m.setdefault("reactions", {})[emoji] = users
    if not users:
        m["reactions"].pop(emoji)
    await db.messages.update_one({"id": mid}, {"$set": {"reactions": m["reactions"]}})
    await manager.send(c["member_ids"], {"type": "message:update", "data": m})
    return m


@router.post("/messages/{mid}/pin")
async def pin(mid: str, u=Depends(get_user)):
    m, c = await own_message(mid, u)
    pinned = not m.get("pinned")
    await db.messages.update_one({"id": mid}, {"$set": {"pinned": pinned}})
    await db.conversations.update_one({"id": c["id"]}, {("$addToSet" if pinned else "$pull"): {"pinned_ids": mid}})
    m["pinned"] = pinned
    await manager.send(c["member_ids"], {"type": "message:update", "data": m})
    return m


@router.post("/conversations/{cid}/read")
async def mark_read(cid: str, u=Depends(get_user)):
    c = await get_conv(cid, u, member=True)
    ts = now_iso()
    await db.conversations.update_one({"id": cid}, {"$set": {f"reads.{u['user_id']}": ts}})
    await manager.send(c["member_ids"], {"type": "read", "data": {"conversation_id": cid, "user_id": u["user_id"], "at": ts}})
    return {"ok": True}


# ---------- Polls ----------
def poll_view(p, votes, u):
    counts = {o["id"]: 0 for o in p["options"]}
    voters = {o["id"]: [] for o in p["options"]}
    mine = []
    for v in votes:
        for oid in v["option_ids"]:
            if oid in counts:
                counts[oid] += 1
                if not p.get("anonymous"):
                    voters[oid].append(v["user_id"])
        if v["user_id"] == u["user_id"]:
            mine = v["option_ids"]
    expired = bool(p.get("expires_at") and p["expires_at"] < now_iso())
    return {**p, "counts": counts, "voters": voters if not p.get("anonymous") else {}, "total_votes": len(votes),
            "my_vote": mine, "status": "closed" if (p.get("closed") or expired) else "open"}


@router.post("/conversations/{cid}/polls")
async def create_poll(cid: str, body: dict = Body(...), u=Depends(get_user)):
    c = await get_conv(cid, u, member=True)
    q = (body.get("question") or "").strip()
    opts = [o.strip() for o in body.get("options", []) if o and o.strip()]
    if not q or len(opts) < 2:
        raise HTTPException(400, "A question and at least two options are required")
    p = {"id": new_id("poll"), "workspace_id": u["workspace_id"], "conversation_id": cid, "question": q[:300],
         "options": [{"id": new_id("opt"), "text": o[:200]} for o in opts[:12]], "multiple": bool(body.get("multiple")),
         "anonymous": bool(body.get("anonymous")), "allow_change": body.get("allow_change", True) is not False,
         "expires_at": body.get("expires_at") or None, "closed": False, "created_by": u["user_id"], "created_at": now_iso()}
    await db.polls.insert_one(dict(p))
    await post_message(c, u, {"type": "poll", "text": q, "poll_id": p["id"], "attachments": []})
    await notify(u["workspace_id"], [x for x in c["member_ids"] if x in manager.conns], "poll", f"New poll: {q}", "", f"/messages/{cid}", u["user_id"], cid)
    return p


async def accessible_poll(pid, u):
    p = await db.polls.find_one({"id": pid, "workspace_id": u["workspace_id"]}, P)
    if not p:
        raise HTTPException(404, "Poll not found")
    if p.get("post_id"):
        return p, None
    c = await get_conv(p["conversation_id"], u)
    return p, c


async def poll_audience(p, c):
    if c:
        return c["member_ids"]
    return [x["user_id"] async for x in db.users.find({"workspace_id": p["workspace_id"]}, {"user_id": 1}) if x["user_id"] in manager.conns]


@router.get("/polls")
async def list_polls(u=Depends(get_user)):
    conv_ids = [c["id"] async for c in db.conversations.find({"workspace_id": u["workspace_id"], "member_ids": u["user_id"], "deleted": {"$ne": True}}, {"id": 1})]
    ps = await db.polls.find({"conversation_id": {"$in": conv_ids}}, P).sort("created_at", -1).to_list(200)
    out = []
    for p in ps:
        votes = await db.poll_votes.find({"poll_id": p["id"]}, P).to_list(5000)
        out.append(poll_view(p, votes, u))
    return out


@router.get("/polls/{pid}")
async def get_poll(pid: str, u=Depends(get_user)):
    p, _ = await accessible_poll(pid, u)
    return poll_view(p, await db.poll_votes.find({"poll_id": pid}, P).to_list(5000), u)


@router.post("/polls/{pid}/vote")
async def vote(pid: str, body: dict = Body(...), u=Depends(get_user)):
    p, c = await accessible_poll(pid, u)
    if c and u["user_id"] not in c["member_ids"]:
        raise HTTPException(403, "Join the conversation to vote")
    view = poll_view(p, [], u)
    if view["status"] == "closed":
        raise HTTPException(400, "Poll is closed")
    valid = {o["id"] for o in p["options"]}
    ids = [o for o in dict.fromkeys(body.get("option_ids", [])) if o in valid]
    if not ids or (not p["multiple"] and len(ids) > 1):
        raise HTTPException(400, "Invalid selection")
    ex = await db.poll_votes.find_one({"poll_id": pid, "user_id": u["user_id"]})
    if ex and not p.get("allow_change"):
        raise HTTPException(400, "You have already voted")
    await db.poll_votes.update_one({"poll_id": pid, "user_id": u["user_id"]}, {"$set": {"option_ids": ids, "voted_at": now_iso()}}, upsert=True)
    res = poll_view(p, await db.poll_votes.find({"poll_id": pid}, P).to_list(5000), u)
    await manager.send(await poll_audience(p, c), {"type": "poll:update", "data": {"poll_id": pid}})
    return res


@router.post("/polls/{pid}/close")
async def close_poll(pid: str, u=Depends(get_user)):
    p, c = await accessible_poll(pid, u)
    if p["created_by"] != u["user_id"] and not is_admin(u):
        raise HTTPException(403, "Only the creator can close this poll")
    await db.polls.update_one({"id": pid}, {"$set": {"closed": True}})
    await manager.send(await poll_audience(p, c), {"type": "poll:update", "data": {"poll_id": pid}})
    return {"ok": True}


# ---------- Stickers ----------
@router.get("/stickers")
async def stickers(u=Depends(get_user)):
    ws = [u["workspace_id"], "global"]
    packs = await db.sticker_packs.find({"workspace_id": {"$in": ws}, "archived": {"$ne": True}}, P).sort("order", 1).to_list(100)
    items = await db.stickers.find({"workspace_id": {"$in": ws}, "deleted": {"$ne": True}}, P).to_list(1000)
    prefs = await db.user_prefs.find_one({"user_id": u["user_id"]}, P) or {}
    usage, recent = prefs.get("sticker_usage", {}), prefs.get("sticker_recent", {})
    return {"packs": packs, "stickers": items,
            "recent": sorted(recent, key=lambda k: recent[k], reverse=True)[:12],
            "frequent": sorted(usage, key=lambda k: usage[k], reverse=True)[:12]}


@router.post("/stickers")
async def add_sticker(body: dict = Body(...), u=Depends(get_user)):
    f = await db.files.find_one({"id": body.get("file_id"), "workspace_id": u["workspace_id"]}, P)
    if not f or not f["content_type"].startswith("image/"):
        raise HTTPException(400, "Upload an image first")
    pack = body.get("pack_id") or "pack_custom_" + u["workspace_id"]
    if not await db.sticker_packs.find_one({"id": pack}):
        await db.sticker_packs.insert_one({"id": pack, "workspace_id": u["workspace_id"], "name": "Custom", "category": "Custom", "order": 99, "created_at": now_iso()})
    s = {"id": new_id("stk"), "workspace_id": u["workspace_id"], "pack_id": pack, "name": (body.get("name") or "Sticker")[:40],
         "category": body.get("category") or "Custom", "file_id": f["id"], "created_by": u["user_id"], "created_at": now_iso()}
    await db.stickers.insert_one(dict(s))
    return s


@router.post("/sticker-packs")
async def add_pack(body: dict = Body(...), u=Depends(get_user)):
    require_admin(u)
    if not (body.get("name") or "").strip():
        raise HTTPException(400, "Name required")
    p = {"id": new_id("pack"), "workspace_id": u["workspace_id"], "name": body["name"].strip(), "category": body.get("category") or body["name"].strip(), "order": 50, "created_at": now_iso()}
    await db.sticker_packs.insert_one(dict(p))
    return p


@router.delete("/stickers/{sid}")
async def del_sticker(sid: str, u=Depends(get_user)):
    s = await db.stickers.find_one({"id": sid, "workspace_id": u["workspace_id"]}, P)
    if not s or (s["created_by"] != u["user_id"] and not is_admin(u)):
        raise HTTPException(403, "Not allowed")
    await db.stickers.update_one({"id": sid}, {"$set": {"deleted": True}})
    return {"ok": True}


# ---------- Calls (WebRTC signaling) ----------
@router.post("/calls")
async def start_call(body: dict = Body(...), u=Depends(get_user)):
    c = await get_conv(body.get("conversation_id"), u, member=True)
    ex = await db.calls.find_one({"conversation_id": c["id"], "status": "active"}, P)
    if ex:
        return ex
    call = {"id": new_id("call"), "workspace_id": u["workspace_id"], "conversation_id": c["id"], "media": "video" if body.get("media") == "video" else "audio",
            "started_by": u["user_id"], "participants": [u["user_id"]], "ever_joined": [u["user_id"]], "declined": [], "status": "active",
            "is_group": c["type"] == "group", "started_at": now_iso(), "ended_at": None}
    await db.calls.insert_one(dict(call))
    others = [x for x in c["member_ids"] if x != u["user_id"]]
    await manager.send(others, {"type": "call:ring", "data": {**call, "caller_name": u["name"], "conversation_name": c.get("name")}})
    await notify(u["workspace_id"], [x for x in others if x not in manager.conns], "call", f"Incoming {call['media']} call from {u['name']}", "", f"/messages/{c['id']}", u["user_id"])
    return call


async def call_and_conv(call_id, u):
    call = await db.calls.find_one({"id": call_id, "workspace_id": u["workspace_id"]}, P)
    if not call:
        raise HTTPException(404, "Call not found")
    c = await get_conv(call["conversation_id"], u, member=True)
    return call, c


async def finish_call(call, c):
    await db.calls.update_one({"id": call["id"]}, {"$set": {"status": "ended", "ended_at": now_iso(), "participants": []}})
    await manager.send(c["member_ids"], {"type": "call:ended", "data": {"call_id": call["id"]}})
    missed = [x for x in c["member_ids"] if x not in call.get("ever_joined", [])]
    starter = await db.users.find_one({"user_id": call["started_by"]}, {"name": 1})
    await notify(c["workspace_id"], missed, "missed_call", f"Missed {call['media']} call from {starter['name'] if starter else 'a colleague'}", "", f"/messages/{c['id']}", call["started_by"])
    dur = 0
    if len(call.get("ever_joined", [])) > 1:
        dur = int((datetime.now(timezone.utc) - datetime.fromisoformat(call["started_at"])).total_seconds())
    m = {"id": new_id("msg"), "conversation_id": c["id"], "workspace_id": c["workspace_id"], "sender_id": call["started_by"], "type": "call",
         "text": f"{call['media'].title()} call", "call": {"duration": dur, "missed": dur == 0, "media": call["media"]}, "reactions": {},
         "attachments": [], "deleted": False, "created_at": now_iso()}
    await db.messages.insert_one(dict(m))
    await manager.send(c["member_ids"], {"type": "message:new", "data": m})


@router.post("/calls/{call_id}/join")
async def join_call(call_id: str, u=Depends(get_user)):
    call, c = await call_and_conv(call_id, u)
    if call["status"] != "active":
        raise HTTPException(400, "Call has ended")
    await db.calls.update_one({"id": call_id}, {"$addToSet": {"participants": u["user_id"], "ever_joined": u["user_id"]}})
    await manager.send(call["participants"], {"type": "call:joined", "data": {"call_id": call_id, "user_id": u["user_id"]}})
    return {**call, "participants": list(set(call["participants"]) | {u["user_id"]})}


@router.post("/calls/{call_id}/decline")
async def decline_call(call_id: str, u=Depends(get_user)):
    call, c = await call_and_conv(call_id, u)
    await db.calls.update_one({"id": call_id}, {"$addToSet": {"declined": u["user_id"]}})
    await manager.send(call["participants"], {"type": "call:declined", "data": {"call_id": call_id, "user_id": u["user_id"]}})
    if not call["is_group"]:
        await finish_call(call, c)
    return {"ok": True}


@router.post("/calls/{call_id}/leave")
async def leave_call(call_id: str, body: dict = Body(default={}), u=Depends(get_user)):
    call, c = await call_and_conv(call_id, u)
    if call["status"] != "active":
        return {"ok": True}
    remaining = [x for x in call["participants"] if x != u["user_id"]]
    end_all = body.get("end_for_all") and (call["started_by"] == u["user_id"] or u["user_id"] in c.get("admin_ids", []) or is_admin(u))
    if end_all or not remaining or not call["is_group"]:
        await finish_call({**call, "ever_joined": list(set(call["ever_joined"]))}, c)
    else:
        await db.calls.update_one({"id": call_id}, {"$set": {"participants": remaining}})
        await manager.send(remaining, {"type": "call:left", "data": {"call_id": call_id, "user_id": u["user_id"]}})
    return {"ok": True}


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    token = ws.cookies.get("session_token") or ws.query_params.get("token")
    u = await user_from_token(token)
    if not u:
        await ws.close(code=4401)
        return
    await ws.accept()
    uid = u["user_id"]
    first = uid not in manager.conns
    await manager.connect(uid, ws)
    peers = [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1})]
    if first:
        await manager.send(peers, {"type": "presence", "data": {"user_id": uid, "online": True}})
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            t = msg.get("type")
            if t == "typing":
                c = await db.conversations.find_one({"id": msg.get("conversation_id"), "member_ids": uid}, {"member_ids": 1})
                if c:
                    await manager.send([x for x in c["member_ids"] if x != uid], {"type": "typing", "data": {"conversation_id": msg["conversation_id"], "user_id": uid}})
            elif t == "signal":
                call = await db.calls.find_one({"id": msg.get("call_id"), "participants": uid, "status": "active"}, {"participants": 1})
                if call and msg.get("to") in call["participants"]:
                    await manager.send([msg["to"]], {"type": "signal", "data": {"from": uid, "call_id": msg["call_id"], "signal": msg.get("signal")}})
            elif t == "ping":
                await ws.send_text('{"type":"pong"}')
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        manager.disconnect(uid, ws)
        if uid not in manager.conns:
            await manager.send(peers, {"type": "presence", "data": {"user_id": uid, "online": False}})
