from datetime import datetime, timezone, timedelta
from core import db, now_iso, new_id

STATUSES = [{"key": "backlog", "name": "Backlog", "color": "#E9EDF5", "is_done": False},
            {"key": "todo", "name": "To Do", "color": "#DDEEFF", "is_done": False},
            {"key": "in_progress", "name": "In Progress", "color": "#EEE6FF", "is_done": False},
            {"key": "in_review", "name": "In Review", "color": "#FFF3C4", "is_done": False},
            {"key": "done", "name": "Done", "color": "#DFF7E8", "is_done": True}]
LABELS = [("ASLI RI", "#FF5364"), ("Bank Abdi", "#2F7DE1"), ("TixFly", "#8B5CF6"), ("Trinity", "#0EA5A4"), ("Tommy Fondy", "#F59E0B"),
          ("Beezy", "#EAB308"), ("Internal Asli Group", "#64748B"), ("Wellness", "#22C55E")]
GROUPS = [("Internal", "Default general communication group for everyone.", "public", True),
          ("General Announcements", "Official company announcements.", "public", True),
          ("Creative Team", "Design, video and creative production.", "department", False),
          ("Marketing Team", "Campaigns, social media and brand strategy.", "department", False),
          ("Product & Development", "Product and engineering collaboration.", "department", False),
          ("Project Collaboration", "Cross-team project coordination.", "project", False)]
STICKERS = {
    "Reactions": [("Wow", "😮", "#DDEEFF"), ("Love it", "😍", "#FFF0F2"), ("LOL", "😂", "#FFF3C4"), ("Thinking", "🤔", "#EEE6FF"), ("Sad", "🥲", "#DDEEFF"), ("Fire", "🔥", "#FFF0F2")],
    "Work Life": [("Coffee first", "☕", "#FFF3C4"), ("Deep focus", "🎧", "#EEE6FF"), ("On it", "💪", "#DFF7E8"), ("Meeting", "📅", "#DDEEFF"), ("Deadline", "⏰", "#FFF0F2"), ("Lunch", "🍜", "#FFF3C4")],
    "Celebration": [("Yay!", "🎉", "#FFF0F2"), ("Cheers", "🥂", "#FFF3C4"), ("Trophy", "🏆", "#FFF3C4"), ("Party", "🥳", "#EEE6FF"), ("Star", "🌟", "#DDEEFF"), ("Cake", "🎂", "#FFF0F2")],
    "Approval": [("Approved", "✅", "#DFF7E8"), ("LGTM", "👍", "#DFF7E8"), ("Noted", "📝", "#DDEEFF"), ("Revisi dulu", "✏️", "#FFF3C4"), ("Perfect", "👌", "#EEE6FF"), ("Hold", "✋", "#FFF0F2")],
    "Funny": [("Panik", "😱", "#FFF0F2"), ("Santuy", "😎", "#DDEEFF"), ("Ngantuk", "😴", "#EEE6FF"), ("Hehe", "🙈", "#FFF3C4"), ("Mind blown", "🤯", "#FFF0F2"), ("Cat vibes", "🐱", "#DFF7E8")],
    "Company Culture": [("One Circle", "⭕", "#FFF0F2"), ("Teamwork", "🤝", "#DFF7E8"), ("Idea!", "💡", "#FFF3C4"), ("Thank you", "🙏", "#EEE6FF"), ("Rocket", "🚀", "#DDEEFF"), ("Wellness", "🌿", "#DFF7E8")]}


def base_ws(wid, name, demo):
    return {"id": wid, "name": name, "brand_name": "CIRCLE", "tagline": "Your Team. One Circle.",
            "description": "Internal company communication and collaboration workspace.", "is_demo": demo, "logo_file_id": None,
            "allowed_domains": ["asliri.id"], "auto_join_domain": True, "require_approval": True, "theme": None,
            "task_statuses": STATUSES, "task_fields": [], "org_levels": ["Company", "Division", "Department", "Team"],
            "profile_fields": [{"key": "cf_portfolio", "name": "Portfolio URL", "type": "url", "options": [], "visibility": "everyone", "order": 0},
                               {"key": "cf_emergency", "name": "Emergency Contact", "type": "phone", "options": [], "visibility": "admins", "order": 1}],
            "field_visibility": {"phone": "managers", "employee_id": "managers", "employment_status": "managers", "join_date": "everyone", "email": "everyone"},
            "created_at": now_iso()}


async def seed_common(wid, demo, member_ids):
    groups = {}
    for name, desc, gt, default in GROUPS:
        gid = new_id("grp")
        groups[name] = gid
        await db.conversations.insert_one({"id": gid, "workspace_id": wid, "type": "group", "group_type": gt, "name": name, "description": desc,
                                           "image": "", "location": "Jakarta HQ" if default else "", "member_ids": member_ids, "admin_ids": member_ids[:1],
                                           "created_by": member_ids[0] if member_ids else None, "created_at": now_iso(), "last_message_at": now_iso(),
                                           "last_message_preview": "", "reads": {}, "pinned_ids": [], "archived": False, "is_default": default})
    labels = {}
    for n, c in LABELS:
        lid = new_id("lbl")
        labels[n] = lid
        await db.labels.insert_one({"id": lid, "workspace_id": wid, "name": n, "color": c, "description": f"{n} brand / IP", "department": "Marketing",
                                    "project_id": None, "archived": False, "created_at": now_iso()})
    return groups, labels


async def seed_stickers():
    if await db.sticker_packs.find_one({"workspace_id": "global"}):
        return
    for i, (cat, items) in enumerate(STICKERS.items()):
        pid = f"pack_{cat.lower().replace(' ', '_')}"
        await db.sticker_packs.insert_one({"id": pid, "workspace_id": "global", "name": cat, "category": cat, "order": i, "builtin": True, "created_at": now_iso()})
        for name, emoji, bg in items:
            await db.stickers.insert_one({"id": new_id("stk"), "workspace_id": "global", "pack_id": pid, "name": name, "category": cat, "emoji": emoji,
                                          "bg": bg, "created_by": "system", "created_at": now_iso()})


async def seed_real():
    if await db.workspaces.find_one({"id": "ws_internal"}):
        return
    await db.workspaces.insert_one(base_ws("ws_internal", "Internal", False))
    await db.org_units.insert_one({"id": new_id("unit"), "workspace_id": "ws_internal", "name": "Company", "level": "Company", "parent_id": None,
                                   "head_id": None, "order": 0, "created_at": now_iso()})
    await seed_common("ws_internal", False, [])


DEMO_PEOPLE = [("Saeful Rohman", "Creative Lead", "Creative", "Hybrid", ["Art Direction", "Branding", "Team Leadership"], "department_manager"),
               ("Shellvy", "Marketing Lead", "Marketing", "Office", ["Campaign Strategy", "Brand Marketing", "Analytics"], "department_manager"),
               ("Shakti", "Senior Video Editor", "Creative", "Office", ["Premiere Pro", "After Effects", "Color Grading"], "employee"),
               ("Kiki", "Creative Designer", "Creative", "Hybrid", ["Figma", "Illustration", "Social Design"], "employee"),
               ("Nanda", "Junior Video Editor", "Creative", "Remote", ["CapCut", "Premiere Pro", "Motion"], "project_manager"),
               ("Yarra", "Social Media Specialist", "Marketing", "Hybrid", ["Content Calendar", "Copywriting", "Instagram"], "employee")]


async def seed_demo():
    if await db.workspaces.find_one({"id": "ws_demo"}):
        return
    w = "ws_demo"
    await db.workspaces.insert_one(base_ws(w, "Internal", True))
    units = {}
    root = new_id("unit")
    await db.org_units.insert_one({"id": root, "workspace_id": w, "name": "Asli Group", "level": "Company", "parent_id": None, "head_id": None, "order": 0, "created_at": now_iso()})
    for i, n in enumerate(["Management", "Creative", "Marketing"]):
        units[n] = new_id("unit")
        await db.org_units.insert_one({"id": units[n], "workspace_id": w, "name": n, "level": "Department", "parent_id": root, "head_id": None, "order": i, "created_at": now_iso()})
    ids = {}
    for i, (name, title, dept, mode, skills, role) in enumerate(DEMO_PEOPLE):
        uid = f"demo_{name.split(' ')[0].lower()}"
        ids[name.split(" ")[0]] = uid
        await db.users.insert_one({"user_id": uid, "email": f"{name.split(' ')[0].lower()}@demo.circle.local", "name": name, "picture": "",
                                   "role": role, "status": "active", "is_demo": True, "workspace_id": w, "job_title": title, "department": dept,
                                   "division": "", "team": "", "org_unit_id": units[dept], "manager_id": None, "employment_status": "Full-time",
                                   "join_date": f"202{2 + i % 3}-0{1 + i}-15", "work_mode": mode, "city": "Jakarta", "office": "Jakarta HQ",
                                   "custom_location": "", "location_status": "", "share_location": True, "timezone": "Asia/Jakarta",
                                   "bio": f"{title} di tim {dept}. Senang berkolaborasi!", "skills": skills, "phone": f"+62 812 0000 10{i}",
                                   "employee_id": f"EMP-00{i + 1}", "custom": {}, "created_at": now_iso()})
    for n in ["Shakti", "Kiki", "Nanda"]:
        await db.users.update_one({"user_id": ids[n]}, {"$set": {"manager_id": ids["Saeful"]}})
    await db.users.update_one({"user_id": ids["Yarra"]}, {"$set": {"manager_id": ids["Shellvy"]}})
    await db.org_units.update_one({"id": units["Creative"]}, {"$set": {"head_id": ids["Saeful"]}})
    await db.org_units.update_one({"id": units["Marketing"]}, {"$set": {"head_id": ids["Shellvy"]}})
    all_ids = list(ids.values())
    groups, labels = await seed_common(w, True, all_ids)
    creative = [ids[n] for n in ["Saeful", "Shakti", "Kiki", "Nanda"]]
    marketing = [ids["Shellvy"], ids["Yarra"]]
    await db.conversations.update_one({"id": groups["Creative Team"]}, {"$set": {"member_ids": creative}})
    await db.conversations.update_one({"id": groups["Marketing Team"]}, {"$set": {"member_ids": marketing + [ids["Saeful"]], "admin_ids": [ids["Shellvy"]]}})
    base = datetime.now(timezone.utc) - timedelta(hours=3)
    msgs = [("Saeful", "Halo team, jangan lupa update progress pekerjaan hari ini ya."), ("Shellvy", "Siap! Nanti aku share update campaign di group Marketing."),
            ("Kiki", "Untuk desain campaign terbaru sudah masuk tahap final."), ("Shakti", "Video draft pertama sudah bisa direview.")]
    for i, (who, text) in enumerate(msgs):
        ts = (base + timedelta(minutes=7 * i)).isoformat()
        await db.messages.insert_one({"id": new_id("msg"), "conversation_id": groups["Internal"], "workspace_id": w, "sender_id": ids[who], "type": "text",
                                      "text": text, "attachments": [], "reactions": {"👍": [ids["Yarra"]]} if i == 0 else {}, "edited": False,
                                      "deleted": False, "pinned": i == 0, "created_at": ts})
    first = await db.messages.find_one({"conversation_id": groups["Internal"], "pinned": True})
    poll_id = new_id("poll")
    pts = (base + timedelta(minutes=40)).isoformat()
    await db.polls.insert_one({"id": poll_id, "workspace_id": w, "conversation_id": groups["Internal"], "question": "Format weekly update yang paling nyaman buat tim?",
                               "options": [{"id": new_id("opt"), "text": t} for t in ["Update di group chat", "Update melalui task board", "Weekly meeting", "Kombinasi chat dan task board"]],
                               "multiple": False, "anonymous": False, "allow_change": True, "expires_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
                               "closed": False, "created_by": ids["Saeful"], "created_at": pts})
    poll = await db.polls.find_one({"id": poll_id})
    for who, oi in [("Kiki", 3), ("Shakti", 1), ("Yarra", 3)]:
        await db.poll_votes.insert_one({"poll_id": poll_id, "user_id": ids[who], "option_ids": [poll["options"][oi]["id"]], "voted_at": pts})
    await db.messages.insert_one({"id": new_id("msg"), "conversation_id": groups["Internal"], "workspace_id": w, "sender_id": ids["Saeful"], "type": "poll",
                                  "text": poll["question"], "poll_id": poll_id, "attachments": [], "reactions": {}, "deleted": False, "created_at": pts})
    await db.conversations.update_one({"id": groups["Internal"]}, {"$set": {"last_message_at": pts, "last_message_preview": "Saeful: Poll", "pinned_ids": [first["id"]]}})
    await db.messages.insert_one({"id": new_id("msg"), "conversation_id": groups["Marketing Team"], "workspace_id": w, "sender_id": ids["Shellvy"], "type": "text",
                                  "text": "Update campaign Beezy: draft strategi sudah aku upload di task board ya.", "attachments": [], "reactions": {}, "deleted": False, "created_at": pts})
    await db.conversations.update_one({"id": groups["Marketing Team"]}, {"$set": {"last_message_at": pts, "last_message_preview": "Shellvy: Update campaign Beezy..."}})
    dm = new_id("conv")
    await db.conversations.insert_one({"id": dm, "workspace_id": w, "type": "dm", "member_ids": sorted([ids["Saeful"], ids["Kiki"]]), "admin_ids": [],
                                       "created_by": ids["Saeful"], "created_at": pts, "last_message_at": pts, "last_message_preview": "Kiki: Siap kak, sore ini aku kirim ya!", "reads": {}, "pinned_ids": []})
    for who, text in [("Saeful", "Ki, file final desain campaign ASLI RI bisa dikirim hari ini?"), ("Kiki", "Siap kak, sore ini aku kirim ya!")]:
        await db.messages.insert_one({"id": new_id("msg"), "conversation_id": dm, "workspace_id": w, "sender_id": ids[who], "type": "text", "text": text,
                                      "attachments": [], "reactions": {}, "deleted": False, "created_at": pts})
    prj = new_id("prj")
    now = datetime.now(timezone.utc)
    await db.projects.insert_one({"id": prj, "workspace_id": w, "name": "Campaign Q4 2026", "description": "Kampanye terpadu Q4 untuk brand ASLI RI, TixFly dan Beezy.",
                                  "owner_id": ids["Shellvy"], "member_ids": all_ids, "start_date": (now - timedelta(days=10)).date().isoformat(),
                                  "deadline": (now + timedelta(days=30)).date().isoformat(), "status": "active", "label_ids": [labels["ASLI RI"], labels["TixFly"], labels["Beezy"]],
                                  "department": "Marketing", "location": "Jakarta HQ", "color": "#FF5364", "conversation_id": groups["Project Collaboration"], "created_at": now_iso()})
    tasks = [("Finalisasi desain campaign", "Kiki", "high", "in_progress", "ASLI RI", 1, "Creative"),
             ("Editing video campaign", "Shakti", "medium", "in_review", "TixFly", 2, "Creative"),
             ("Update content calendar", "Yarra", "high", "todo", "Tommy Fondy", 0, "Marketing"),
             ("Review strategi marketing", "Shellvy", "high", "in_progress", "Beezy", 4, "Marketing"),
             ("Finalisasi weekly creative report", "Saeful", "medium", "backlog", "Internal Asli Group", 6, "Creative"),
             ("Riset konten wellness bulanan", "Yarra", "low", "done", "Wellness", -2, "Marketing")]
    for i, (title, who, pr, st, lb, days, dept) in enumerate(tasks):
        dl = (now + timedelta(days=days)).replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
        done = st == "done"
        await db.tasks.insert_one({"id": new_id("task"), "number": i + 1, "number_str": f"T-{i + 1}", "workspace_id": w, "title": title,
                                   "description": f"<h3>Brief</h3><p>{title} untuk kebutuhan campaign.</p><ul><li>Cek referensi visual</li><li>Koordinasi dengan tim</li></ul>",
                                   "status": st, "priority": pr, "requestor_id": ids["Shellvy"] if who != "Shellvy" else ids["Saeful"], "assignee_id": ids[who],
                                   "created_by": ids["Shellvy"], "collaborator_ids": [], "label_ids": [labels[lb]], "card_color": None, "card_style": "badge",
                                   "checklist": [{"id": new_id("chk"), "text": "Draft", "done": True}, {"id": new_id("chk"), "text": "Final", "done": done}],
                                   "subtasks": [], "links": [], "attachments": [], "comment_count": 0, "start_date": (now - timedelta(days=3)).date().isoformat(),
                                   "deadline": dl, "deadline_has_time": True, "project_id": prj if i < 4 else None, "department": dept, "archived": False,
                                   "completed_at": now_iso() if done else None, "completed_by": ids[who] if done else None,
                                   "created_at": (now - timedelta(days=5)).isoformat(), "updated_at": now_iso()})
    await db.counters.update_one({"id": f"task_{w}"}, {"$set": {"seq": len(tasks)}}, upsert=True)


async def seed_all():
    await seed_stickers()
    await seed_real()
    await seed_demo()
    for coll, keys in {"users": ["user_id", "email", "workspace_id"], "user_sessions": ["session_token"], "messages": ["conversation_id", "created_at"],
                       "conversations": ["workspace_id", "member_ids"], "tasks": ["workspace_id", "status", "assignee_id", "project_id"],
                       "notifications": ["user_id"], "task_activity": ["task_id", "workspace_id"], "files": ["id"], "poll_votes": ["poll_id"]}.items():
        for k in keys:
            await db[coll].create_index(k)
