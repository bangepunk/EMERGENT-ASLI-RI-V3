import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Body, Query
from core import db, now_iso, new_id, get_user, is_admin, notify, manager

router = APIRouter(prefix="/api")
P = {"_id": 0}
EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🙏"]


TAG_RX = re.compile(r"(?<![\w#])#(\w{1,40})")


def tags_of(text):
    return list(dict.fromkeys(t.lower() for t in TAG_RX.findall(text or "")))[:15]


async def backfill_tags():
    async for p in db.posts.find({"tags": {"$exists": False}}, {"id": 1, "text": 1}):
        await db.posts.update_one({"id": p["id"]}, {"$set": {"tags": tags_of(p.get("text"))}})


def shape(p, u):
    likes = p.get("likes") or []
    return {**{k: v for k, v in p.items() if k != "likes"}, "like_count": len(likes), "liked": u["user_id"] in likes}


async def broadcast(u, pid):
    ids = [x["user_id"] async for x in db.users.find({"workspace_id": u["workspace_id"]}, {"user_id": 1})]
    await manager.send([i for i in ids if i in manager.conns], {"type": "posts:changed", "data": {"id": pid}})


async def load(pid, u):
    p = await db.posts.find_one({"id": pid, "workspace_id": u["workspace_id"], "deleted": {"$ne": True}}, P)
    if not p:
        raise HTTPException(404, "Postingan tidak ditemukan")
    return p


def thread_link(p):
    return f"/beranda/{p.get('parent_id') or p['id']}"


@router.get("/posts")
async def list_posts(before: str = Query(None), tag: str = Query(None), u=Depends(get_user)):
    q = {"workspace_id": u["workspace_id"], "parent_id": None, "deleted": {"$ne": True}}
    if before:
        q["created_at"] = {"$lt": before}
    if tag:
        t = tag.lstrip("#").lower()
        roots = await db.posts.distinct("parent_id", {"workspace_id": u["workspace_id"], "tags": t, "parent_id": {"$ne": None}, "deleted": {"$ne": True}})
        q["$or"] = [{"tags": t}, {"id": {"$in": roots}}]
    items = await db.posts.find(q, P).sort("created_at", -1).limit(30).to_list(30)
    replies = await db.posts.find({"parent_id": {"$in": [p["id"] for p in items]}, "deleted": {"$ne": True}}, P).sort("created_at", 1).to_list(5000)
    by = {}
    for r in replies:
        by.setdefault(r["parent_id"], []).append(r)
    return [{**shape(p, u), "replies_preview": [shape(r, u) for r in by.get(p["id"], [])[:5]]} for p in items]


@router.get("/posts/trending")
async def trending(u=Depends(get_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = await db.posts.aggregate([
        {"$match": {"workspace_id": u["workspace_id"], "deleted": {"$ne": True}, "created_at": {"$gte": since}, "tags.0": {"$exists": True}}},
        {"$unwind": "$tags"}, {"$group": {"_id": "$tags", "count": {"$sum": 1}, "last": {"$max": "$created_at"}}},
        {"$sort": {"count": -1, "last": -1}}, {"$limit": 10}]).to_list(10)
    return [{"tag": r["_id"], "count": r["count"]} for r in rows]


@router.get("/posts/{pid}")
async def get_post(pid: str, u=Depends(get_user)):
    p = await load(pid, u)
    if p.get("parent_id"):
        p = await load(p["parent_id"], u)
    replies = await db.posts.find({"parent_id": p["id"], "deleted": {"$ne": True}}, P).sort("created_at", 1).to_list(500)
    return {**shape(p, u), "replies": [shape(r, u) for r in replies]}


@router.post("/posts")
async def create_post(body: dict = Body(...), u=Depends(get_user)):
    ws = u["workspace_id"]
    text = (body.get("text") or "").strip()[:5000]
    atts = []
    for a in (body.get("attachments") or [])[:6]:
        f = await db.files.find_one({"id": a.get("id"), "workspace_id": ws, "content_type": {"$regex": "^image/"}}, P)
        if f:
            atts.append({"id": f["id"], "name": f["name"], "content_type": f["content_type"]})
    if not text and not atts and not body.get("poll"):
        raise HTTPException(400, "Tulis sesuatu atau lampirkan foto")
    parent = await load(body["parent_id"], u) if body.get("parent_id") else None
    if parent and parent.get("parent_id"):
        parent = await load(parent["parent_id"], u)
    poll = None
    if body.get("poll") and not parent:
        pb = body["poll"]
        q = (pb.get("question") or "").strip()
        opts = [o.strip() for o in pb.get("options", []) if o and o.strip()]
        if not q or len(opts) < 2:
            raise HTTPException(400, "Polling butuh pertanyaan dan minimal 2 pilihan")
        poll = {"id": new_id("poll"), "workspace_id": ws, "conversation_id": None, "question": q[:300],
                "options": [{"id": new_id("opt"), "text": o[:200]} for o in opts[:12]], "multiple": bool(pb.get("multiple")),
                "anonymous": bool(pb.get("anonymous")), "allow_change": pb.get("allow_change", True) is not False,
                "expires_at": pb.get("expires_at") or None, "closed": False, "created_by": u["user_id"], "created_at": now_iso()}
    mentions = [x["user_id"] async for x in db.users.find({"workspace_id": ws, "status": "active", "user_id": {"$in": body.get("mention_ids") or []}}, {"user_id": 1})]
    p = {"id": new_id("post"), "workspace_id": ws, "author_id": u["user_id"], "text": text, "attachments": atts, "mention_ids": mentions, "tags": tags_of(text),
         "parent_id": parent["id"] if parent else None, "poll_id": poll["id"] if poll else None, "likes": [], "reactions": {}, "reply_count": 0, "created_at": now_iso()}
    if poll:
        poll["post_id"] = p["id"]
        await db.polls.insert_one(dict(poll))
    await db.posts.insert_one(dict(p))
    link = thread_link(p)
    if parent:
        await db.posts.update_one({"id": parent["id"]}, {"$inc": {"reply_count": 1}})
        if parent["author_id"] not in mentions:
            await notify(ws, [parent["author_id"]], "post_reply", f"{u['name']} membalas postinganmu", text, link, u["user_id"])
    await notify(ws, mentions, "post_mention", f"{u['name']} menyebut kamu di Beranda", text, link, u["user_id"])
    await broadcast(u, p["id"])
    return shape(p, u)


@router.post("/posts/{pid}/like")
async def like_post(pid: str, u=Depends(get_user)):
    p = await load(pid, u)
    liked = u["user_id"] in (p.get("likes") or [])
    await db.posts.update_one({"id": pid}, {("$pull" if liked else "$addToSet"): {"likes": u["user_id"]}})
    if not liked and not await db.notifications.find_one({"type": "post_like", "actor_id": u["user_id"], "link": thread_link(p), "body": p.get("text", "")[:200]}):
        await notify(u["workspace_id"], [p["author_id"]], "post_like", f"{u['name']} menyukai postinganmu", p.get("text", ""), thread_link(p), u["user_id"])
    await broadcast(u, pid)
    return shape(await load(pid, u), u)


@router.post("/posts/{pid}/react")
async def react_post(pid: str, body: dict = Body(...), u=Depends(get_user)):
    emoji = body.get("emoji")
    if emoji not in EMOJIS:
        raise HTTPException(400, "Reaksi tidak valid")
    p = await load(pid, u)
    on = u["user_id"] in (p.get("reactions") or {}).get(emoji, [])
    await db.posts.update_one({"id": pid}, {("$pull" if on else "$addToSet"): {f"reactions.{emoji}": u["user_id"]}})
    await broadcast(u, pid)
    return shape(await load(pid, u), u)


@router.delete("/posts/{pid}")
async def delete_post(pid: str, u=Depends(get_user)):
    p = await load(pid, u)
    if p["author_id"] != u["user_id"] and not is_admin(u):
        raise HTTPException(403, "Kamu tidak bisa menghapus postingan ini")
    await db.posts.update_one({"id": pid}, {"$set": {"deleted": True}})
    if p.get("parent_id"):
        await db.posts.update_one({"id": p["parent_id"]}, {"$inc": {"reply_count": -1}})
    await broadcast(u, pid)
    return {"ok": True}
