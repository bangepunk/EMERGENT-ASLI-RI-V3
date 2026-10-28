# Iteration 2 regression: task sheet fields (item_type/link_url/submit_date), item types, monthly stats RBAC, Beranda posts API
import io
import os
from datetime import datetime, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
MONTH = datetime.now(timezone.utc).strftime("%Y-%m")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
PNG = bytes.fromhex("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082")


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


# ---------- Task sheet fields + item types ----------
class TestSheetFields:
    created = []

    def test_create_with_sheet_fields_and_patch(self, admin):
        r = admin.post(f"{API}/tasks", json={"title": "TEST_sheet_task", "assignee_id": "test_emp_1", "item_type": "Article Asset",
                                             "link_url": "drive.google.com/x", "submit_date": TODAY})
        assert r.status_code == 200, r.text
        t = r.json()
        TestSheetFields.created.append(t["id"])
        assert t["item_type"] == "Article Asset" and t["link_url"] == "drive.google.com/x" and t["submit_date"] == TODAY
        r = admin.patch(f"{API}/tasks/{t['id']}", json={"item_type": "Video Storyline", "link_url": "https://ex.com/f", "submit_date": None})
        assert r.status_code == 200
        g = admin.get(f"{API}/tasks/{t['id']}").json()
        assert g["item_type"] == "Video Storyline" and g["link_url"] == "https://ex.com/f" and g["submit_date"] is None

    def test_default_item_types_present(self, admin):
        ws = admin.get(f"{API}/workspace").json()
        names = [i["name"] for i in ws.get("item_types", [])]
        for n in ["Article Asset", "Article Copywriting", "SocMed Asset", "SocMed Copywriting", "Video Storyline"]:
            assert n in names

    def test_employee_can_add_item_type_but_not_patch_ws(self, emp, admin):
        r = emp.post(f"{API}/item-types", json={"name": "TEST_ItemEmp"})
        assert r.status_code == 200, r.text
        assert any(i["name"] == "TEST_ItemEmp" for i in r.json())
        # dedupe case-insensitive
        r2 = emp.post(f"{API}/item-types", json={"name": "test_itememp"})
        assert sum(1 for i in r2.json() if i["name"].lower() == "test_itememp") == 1
        assert emp.post(f"{API}/item-types", json={"name": "  "}).status_code == 400
        assert emp.patch(f"{API}/workspace", json={"item_types": []}).status_code == 403
        # admin removes it via PATCH
        items = [i for i in admin.get(f"{API}/workspace").json()["item_types"] if i["name"] != "TEST_ItemEmp"]
        r = admin.patch(f"{API}/workspace", json={"item_types": items})
        assert r.status_code == 200
        assert not any(i["name"] == "TEST_ItemEmp" for i in r.json()["item_types"])

    def test_stats_monthly_rbac(self, admin, emp):
        tid = TestSheetFields.created[0]
        r = admin.get(f"{API}/stats/monthly", params={"month": MONTH})
        assert r.status_code == 200
        d = r.json()
        assert d["scope"] == "all" and any(t["id"] == tid for t in d["tasks"])
        r = admin.get(f"{API}/stats/monthly", params={"month": MONTH, "user_id": "test_emp_1"}).json()
        assert r["scope"] == "user" and all(t["assignee_id"] == "test_emp_1" for t in r["tasks"])
        e = emp.get(f"{API}/stats/monthly", params={"month": MONTH, "user_id": "test_admin_1"}).json()
        assert all(t["assignee_id"] == "test_emp_1" for t in e["tasks"])
        assert any(t["id"] == tid for t in e["tasks"])
        assert admin.get(f"{API}/stats/monthly", params={"month": "bad"}).status_code == 400
        # far past month should not contain the task
        old = admin.get(f"{API}/stats/monthly", params={"month": "2001-01"}).json()
        assert not any(t["id"] == tid for t in old["tasks"])

    def test_cleanup(self, admin):
        for tid in TestSheetFields.created:
            assert admin.patch(f"{API}/tasks/{tid}", json={"archived": True}).status_code == 200


# ---------- Beranda posts ----------
class TestPosts:
    ids = []

    def test_post_like_react_reply_delete(self, admin, emp):
        before = emp.get(f"{API}/notifications").json()
        r = admin.post(f"{API}/posts", json={"text": "TEST_post hello @Test Employee", "mention_ids": ["test_emp_1"]})
        assert r.status_code == 200, r.text
        p = r.json()
        TestPosts.ids.append(p["id"])
        assert p["mention_ids"] == ["test_emp_1"] and p["like_count"] == 0 and p["parent_id"] is None
        feed = admin.get(f"{API}/posts").json()
        assert feed[0]["id"] == p["id"]
        after = emp.get(f"{API}/notifications").json()
        n = [x for x in after["items"] if x.get("link") == f"/beranda/{p['id']}"]
        assert n and n[0]["category"] == "beranda"
        # like toggle
        assert emp.post(f"{API}/posts/{p['id']}/like").json()["like_count"] == 1
        assert emp.post(f"{API}/posts/{p['id']}/like").json()["like_count"] == 0
        # react
        rr = emp.post(f"{API}/posts/{p['id']}/react", json={"emoji": "🎉"}).json()
        assert "test_emp_1" in rr["reactions"]["🎉"]
        assert emp.post(f"{API}/posts/{p['id']}/react", json={"emoji": "x"}).status_code == 400
        # reply -> admin notified
        rep = emp.post(f"{API}/posts", json={"text": "TEST_reply", "parent_id": p["id"]})
        assert rep.status_code == 200
        th = admin.get(f"{API}/posts/{p['id']}").json()
        assert th["reply_count"] == 1 and th["replies"][0]["text"] == "TEST_reply"
        an = admin.get(f"{API}/notifications").json()["items"]
        assert any(x["type"] == "post_reply" and x["link"] == f"/beranda/{p['id']}" for x in an)
        # replies not in feed
        assert not any(x["id"] == rep.json()["id"] for x in admin.get(f"{API}/posts").json())
        # employee cannot delete admin post
        assert emp.delete(f"{API}/posts/{p['id']}").status_code == 403
        # admin can delete emp reply
        assert admin.delete(f"{API}/posts/{rep.json()['id']}").status_code == 200
        assert admin.get(f"{API}/posts/{p['id']}").json()["reply_count"] == 0

    def test_empty_and_image_post(self, emp):
        assert emp.post(f"{API}/posts", json={"text": "  "}).status_code == 400
        up = emp.post(f"{API}/upload", files={"file": ("t.png", io.BytesIO(PNG), "image/png")})
        assert up.status_code == 200, up.text
        fid = up.json()["id"]
        r = emp.post(f"{API}/posts", json={"text": "", "attachments": [{"id": fid}]})
        assert r.status_code == 200
        TestPosts.ids.append(r.json()["id"])
        assert r.json()["attachments"][0]["id"] == fid
        tx = emp.post(f"{API}/upload", files={"file": ("a.txt", io.BytesIO(b"hi"), "text/plain")}).json()["id"]
        r2 = emp.post(f"{API}/posts", json={"text": "TEST_txt", "attachments": [{"id": tx}]})
        TestPosts.ids.append(r2.json()["id"])
        assert r2.json()["attachments"] == []
        # author can delete own
        assert emp.delete(f"{API}/posts/{r.json()['id']}").status_code == 200
        assert emp.get(f"{API}/posts/{r.json()['id']}").status_code == 404

    def test_cleanup(self, admin):
        for pid in TestPosts.ids:
            admin.delete(f"{API}/posts/{pid}")
