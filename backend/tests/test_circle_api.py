# CIRCLE backend regression tests: RBAC, demo isolation, tasks, export, chat, groups, polls, org, profiles, prefs, notifications, search
import os
import csv
import io
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return client("test_session_admin")


@pytest.fixture(scope="module")
def emp():
    return client("test_session_emp")


@pytest.fixture(scope="module")
def demo():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo", json={"user_id": "demo_saeful"})
    assert r.status_code == 200
    tok = s.cookies.get("session_token")
    return client(tok)


@pytest.fixture(scope="module")
def created():
    data = {"tasks": [], "groups": [], "labels": [], "units": []}
    yield data
    a = client("test_session_admin")
    for t in data["tasks"]:
        # no task delete endpoint -> archive
        a.patch(f"{API}/tasks/{t}", json={"archived": True})
    for g in data["groups"]:
        a.delete(f"{API}/groups/{g}")
    for u in data["units"]:
        a.delete(f"{API}/org/units/{u}")


# --- Auth / RBAC ---
class TestRBAC:
    def test_me(self, admin, emp):
        assert admin.get(f"{API}/auth/me").json()["user"]["role"] == "super_admin"
        assert emp.get(f"{API}/auth/me").json()["user"]["role"] == "employee"

    def test_unauth(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    @pytest.mark.parametrize("method,path", [("get", "/admin/stats"), ("get", "/admin/users"), ("post", "/org/units")])
    def test_employee_forbidden(self, emp, method, path):
        r = getattr(emp, method)(f"{API}{path}", **({"json": {"name": "TEST_x"}} if method == "post" else {}))
        assert r.status_code == 403

    def test_admin_allowed(self, admin):
        assert admin.get(f"{API}/admin/stats").status_code == 200
        r = admin.get(f"{API}/admin/users")
        assert r.status_code == 200 and isinstance(r.json(), list)


# --- Demo isolation ---
class TestDemo:
    def test_demo_isolated(self, admin, demo):
        me = demo.get(f"{API}/auth/me").json()
        assert me["user"]["workspace_id"] == "ws_demo"
        assert me["user"]["role"] not in ("super_admin", "workspace_admin")
        real_users = {u["user_id"] for u in admin.get(f"{API}/users").json()}
        assert not any(x.startswith("demo_") for x in real_users)
        demo_task_ids = {t["id"] for t in demo.get(f"{API}/tasks").json()}
        real_task_ids = {t["id"] for t in admin.get(f"{API}/tasks").json()}
        assert len(demo_task_ids) > 0
        assert not (demo_task_ids & real_task_ids)

    def test_demo_no_admin(self, demo):
        assert demo.get(f"{API}/admin/stats").status_code == 403


# --- Tasks ---
class TestTasks:
    def test_create_title_only(self, admin, created):
        r = admin.post(f"{API}/tasks", json={"title": "TEST_title only"})
        assert r.status_code == 200
        t = r.json()
        created["tasks"].append(t["id"])
        assert t["status"] == "todo" and t["priority"] == "medium" and t["number_str"].startswith("T-")
        g = admin.get(f"{API}/tasks/{t['id']}").json()
        assert g["title"] == "TEST_title only"

    def test_create_empty_title(self, admin):
        assert admin.post(f"{API}/tasks", json={"title": "  "}).status_code == 400

    def test_full_flow(self, admin, emp, created):
        lb = admin.post(f"{API}/labels", json={"name": "TEST_Label_A", "color": "#123456"})
        assert lb.status_code in (200, 409)
        labels = admin.get(f"{API}/labels").json()
        lid = next(x["id"] for x in labels if x["name"] == "TEST_Label_A")
        created["labels"].append(lid)
        r = admin.post(f"{API}/tasks", json={"title": 'TEST_full, "quoted"\nnewline', "assignee_id": "test_emp_1", "priority": "high",
                                             "deadline": "2020-01-01T10:00:00+00:00", "label_ids": [lid]})
        t = r.json()
        created["tasks"].append(t["id"])
        assert t["assignee_id"] == "test_emp_1" and t["priority"] == "high" and t["label_ids"] == [lid]
        # status change persists
        p = admin.patch(f"{API}/tasks/{t['id']}", json={"status": "in_progress"})
        assert p.status_code == 200 and p.json()["status"] == "in_progress"
        # overdue view
        ov = {x["id"] for x in admin.get(f"{API}/tasks", params={"view": "overdue"}).json()}
        assert t["id"] in ov
        # label filter + export
        lf = admin.get(f"{API}/tasks", params={"label": lid}).json()
        assert [x["id"] for x in lf] == [t["id"]]
        ex = admin.get(f"{API}/tasks/export", params={"label": lid, "format": "csv"})
        assert ex.status_code == 200 and "text/csv" in ex.headers["content-type"]
        rows = list(csv.DictReader(io.StringIO(ex.content.decode("utf-8-sig"))))
        assert len(rows) == 1 and rows[0]["Task Name"] == 'TEST_full, "quoted"\nnewline'
        assert rows[0]["IP / Brand Labels"] == "TEST_Label_A"
        js = admin.get(f"{API}/tasks/export", params={"label": lid, "format": "json"})
        assert json.loads(js.content)[0]["Task ID"] == t["number_str"]
        # done records completed
        d = admin.patch(f"{API}/tasks/{t['id']}", json={"status": "done"}).json()
        assert d["completed_at"] and d["completed_by"] == "test_admin_1"
        assert any(a["action"] == "completed" for a in d["activity"])
        comp = {x["id"] for x in admin.get(f"{API}/tasks", params={"view": "completed"}).json()}
        assert t["id"] in comp
        # archive keeps record
        admin.patch(f"{API}/tasks/{t['id']}", json={"archived": True})
        arch = {x["id"] for x in admin.get(f"{API}/tasks", params={"view": "archived"}).json()}
        assert t["id"] in arch
        assert t["id"] not in {x["id"] for x in admin.get(f"{API}/tasks").json()}
        assert admin.get(f"{API}/tasks/{t['id']}").status_code == 200

    def test_comment_checklist_subtask_color(self, admin, created):
        t = admin.post(f"{API}/tasks", json={"title": "TEST_detail"}).json()
        created["tasks"].append(t["id"])
        c = admin.post(f"{API}/tasks/{t['id']}/comments", json={"text": "@Test Employee hi", "mention_ids": ["test_emp_1"]})
        assert c.status_code == 200
        p = admin.patch(f"{API}/tasks/{t['id']}", json={"checklist": [{"id": "c1", "text": "a", "done": True}],
                                                         "subtasks": [{"id": "s1", "title": "sub", "done": False}], "card_color": "#FF5364"}).json()
        assert p["checklist"][0]["done"] is True and p["subtasks"][0]["title"] == "sub" and p["card_color"] == "#FF5364"
        assert p["comments"][0]["text"].startswith("@Test")

    def test_employee_cannot_edit_others_task(self, admin, emp, created):
        t = admin.post(f"{API}/tasks", json={"title": "TEST_noedit"}).json()
        created["tasks"].append(t["id"])
        assert emp.patch(f"{API}/tasks/{t['id']}", json={"title": "hack"}).status_code == 403

    def test_upload_attachment(self, admin, created):
        up = admin.post(f"{API}/upload", files={"file": ("test.txt", b"hello circle", "text/plain")})
        assert up.status_code == 200, up.text
        f = up.json()
        t = admin.post(f"{API}/tasks", json={"title": "TEST_attach"}).json()
        created["tasks"].append(t["id"])
        p = admin.patch(f"{API}/tasks/{t['id']}", json={"attachments": [f]}).json()
        assert p["attachments"][0]["id"] == f["id"]
        dl = admin.get(f"{API}/files/{f['id']}")
        assert dl.status_code == 200 and dl.content == b"hello circle"


# --- Chat ---
class TestChat:
    def internal(self, s):
        return next(c for c in s.get(f"{API}/conversations").json() if c.get("name") == "Internal")

    def test_message_lifecycle(self, admin, emp):
        c = self.internal(admin)
        m = admin.post(f"{API}/conversations/{c['id']}/messages", json={"text": "TEST_hello"}).json()
        r = admin.post(f"{API}/conversations/{c['id']}/messages", json={"text": "TEST_reply", "reply_to": m["id"]}).json()
        assert r["reply_to"]["id"] == m["id"]
        assert "👍" in admin.post(f"{API}/messages/{m['id']}/react", json={"emoji": "👍"}).json()["reactions"]
        assert admin.patch(f"{API}/messages/{m['id']}", json={"text": "TEST_edited"}).json()["edited"] is True
        assert emp.patch(f"{API}/messages/{m['id']}", json={"text": "x"}).status_code == 403
        assert admin.post(f"{API}/messages/{m['id']}/pin").json()["pinned"] is True
        det = admin.get(f"{API}/conversations/{c['id']}").json()
        assert m["id"] in [x["id"] for x in det["pinned"]]
        admin.post(f"{API}/messages/{m['id']}/pin")
        assert admin.delete(f"{API}/messages/{m['id']}").status_code == 200
        assert admin.delete(f"{API}/messages/{r['id']}").status_code == 200
        msgs = admin.get(f"{API}/conversations/{c['id']}/messages").json()
        assert next(x for x in msgs if x["id"] == m["id"])["deleted"] is True

    def test_dm_and_sticker(self, admin):
        dm = admin.post(f"{API}/conversations/dm", json={"user_id": "test_emp_1"}).json()
        st = admin.get(f"{API}/stickers").json()
        assert len(st["stickers"]) > 0
        m = admin.post(f"{API}/conversations/{dm['id']}/messages", json={"type": "sticker", "sticker_id": st["stickers"][0]["id"]})
        assert m.status_code == 200 and m.json()["sticker"]["id"] == st["stickers"][0]["id"]

    def test_poll(self, admin, emp):
        c = self.internal(admin)
        p = admin.post(f"{API}/conversations/{c['id']}/polls", json={"question": "TEST_poll?", "options": ["A", "B"]}).json()
        v = emp.post(f"{API}/polls/{p['id']}/vote", json={"option_ids": [p["options"][0]["id"]]}).json()
        assert v["total_votes"] == 1 and v["my_vote"] == [p["options"][0]["id"]]
        assert admin.post(f"{API}/conversations/{c['id']}/polls", json={"question": "x", "options": ["A"]}).status_code == 400

    def test_private_group_hidden(self, admin, emp, created):
        g = admin.post(f"{API}/groups", json={"name": "TEST_private", "group_type": "private"}).json()
        created["groups"].append(g["id"])
        assert emp.get(f"{API}/conversations/{g['id']}").status_code == 404
        assert emp.get(f"{API}/conversations/{g['id']}/messages").status_code == 404
        assert g["id"] not in [x["id"] for x in emp.get(f"{API}/groups/browse").json()]

    def test_public_group_join_edit_archive(self, admin, emp, created):
        g = admin.post(f"{API}/groups", json={"name": "TEST_public", "group_type": "public"}).json()
        created["groups"].append(g["id"])
        assert emp.post(f"{API}/groups/{g['id']}/join").status_code == 200
        assert emp.get(f"{API}/conversations/{g['id']}").json()["is_member"] is True
        assert emp.patch(f"{API}/groups/{g['id']}", json={"name": "hack"}).status_code == 403
        assert admin.patch(f"{API}/groups/{g['id']}", json={"name": "TEST_public2", "archived": True}).status_code == 200
        d = admin.get(f"{API}/conversations/{g['id']}").json()
        assert d["name"] == "TEST_public2" and d["archived"] is True
        assert admin.post(f"{API}/conversations/{g['id']}/messages", json={"text": "x"}).status_code == 400

    def test_call_start(self, admin):
        dm = admin.post(f"{API}/conversations/dm", json={"user_id": "test_emp_1"}).json()
        call = admin.post(f"{API}/calls", json={"conversation_id": dm["id"], "media": "audio"})
        assert call.status_code == 200 and call.json()["status"] == "active"
        assert admin.post(f"{API}/calls/{call.json()['id']}/leave", json={}).status_code == 200


# --- People / Org ---
class TestPeople:
    def test_profile_self_edit_and_phone_visibility(self, admin, emp):
        r = emp.patch(f"{API}/users/test_emp_1", json={"phone": "+62 811 0000", "bio": "TEST_bio"})
        assert r.status_code == 200 and r.json()["bio"] == "TEST_bio"
        assert emp.patch(f"{API}/users/test_emp_1", json={"job_title": "CEO"}).json().get("job_title") != "CEO"
        assert admin.get(f"{API}/users/test_emp_1").json().get("phone") == "+62 811 0000"
        admin.patch(f"{API}/users/test_admin_1", json={"phone": "+62 822 1111"})
        assert "phone" not in emp.get(f"{API}/users/test_admin_1").json()
        assert emp.patch(f"{API}/users/test_admin_1", json={"bio": "x"}).status_code == 403

    def test_org_units(self, admin, created):
        a = admin.post(f"{API}/org/units", json={"name": "TEST_UnitA", "level": "Department"}).json()
        b = admin.post(f"{API}/org/units", json={"name": "TEST_UnitB", "level": "Department"}).json()
        created["units"].append(b["id"])
        assert admin.patch(f"{API}/org/units/{a['id']}", json={"name": "TEST_UnitA2"}).json()["name"] == "TEST_UnitA2"
        mv = admin.patch(f"{API}/org/members/test_emp_1", json={"org_unit_id": a["id"]}).json()
        assert mv["org_unit_id"] == a["id"] and mv["department"] == "TEST_UnitA2"
        assert admin.delete(f"{API}/org/units/{a['id']}").status_code == 409
        assert admin.delete(f"{API}/org/units/{a['id']}", params={"reassign_to": b["id"]}).status_code == 200
        assert admin.get(f"{API}/users/test_emp_1").json()["org_unit_id"] == b["id"]
        ex = admin.get(f"{API}/org/export")
        assert ex.status_code == 200 and "TEST_UnitB" in ex.text
        admin.patch(f"{API}/org/members/test_emp_1", json={"org_unit_id": None})


# --- Prefs / Notifications / Search ---
class TestMisc:
    def test_prefs(self, emp):
        r = emp.put(f"{API}/prefs", json={"theme_mode": "dark"})
        assert r.json()["theme_mode"] == "dark"
        assert emp.get(f"{API}/prefs").json()["theme_mode"] == "dark"
        assert emp.put(f"{API}/prefs", json={"theme_mode": "neon"}).status_code == 400
        emp.put(f"{API}/prefs", json={"theme_mode": "light"})

    def test_notifications(self, emp):
        n = emp.get(f"{API}/notifications").json()
        assert "items" in n and "unread" in n
        emp.post(f"{API}/notifications/read-all")
        assert emp.get(f"{API}/notifications").json()["unread"] == 0

    def test_search(self, admin):
        r = admin.get(f"{API}/search", params={"q": "Test"}).json()
        assert any(e["user_id"] == "test_emp_1" for e in r["employees"])
        assert isinstance(r["tasks"], list)


# --- Regex-special search input must not 500 ---
class TestSearchEscaping:
    def test_task_search_special_chars(self, admin):
        assert admin.get(f"{API}/tasks", params={"q": "("}).status_code == 200
        assert admin.get(f"{API}/tasks/export", params={"q": "(["}).status_code == 200

    def test_message_search_special_chars(self, admin):
        c = next(c for c in admin.get(f"{API}/conversations").json() if c.get("name") == "Internal")
        assert admin.get(f"{API}/conversations/{c['id']}/messages", params={"q": "(*"}).status_code == 200
