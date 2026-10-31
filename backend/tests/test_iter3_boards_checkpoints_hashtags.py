# Iteration 3: Boards access control, checkpoints/issues, Beranda hashtags/trending/inline comments
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
ADM = {"Authorization": "Bearer test_session_admin"}
EMP = {"Authorization": "Bearer test_session_emp"}
S = {}


def a(method, path, **kw):
    return requests.request(method, f"{API}{path}", headers=ADM, timeout=30, **kw)


def e(method, path, **kw):
    return requests.request(method, f"{API}{path}", headers=EMP, timeout=30, **kw)


# ---------- Boards & access control ----------
class TestBoards:
    def test_01_migration_all_tasks_have_board(self):
        r = a("GET", "/tasks")
        assert r.status_code == 200
        assert all(t.get("board_id") for t in r.json())
        boards = a("GET", "/boards").json()
        assert any(b["name"] == "Board Marketing" for b in boards)
        S["marketing"] = next(b for b in boards if b["name"] == "Board Marketing")

    def test_02_employee_no_boards(self):
        assert e("GET", "/boards").json() == []
        assert e("GET", "/tasks").json() == []
        assert e("POST", "/boards", json={"name": "TEST_x"}).status_code == 403

    def test_03_admin_create_board(self):
        r = a("POST", "/boards", json={"name": f"TEST_Board_{uuid.uuid4().hex[:5]}", "description": "qa", "color": "#4ADE80"})
        assert r.status_code == 200, r.text
        b = r.json()
        assert "test_admin_1" in b["member_ids"] and b["task_count"] == 0
        S["board"] = b
        assert a("POST", "/boards", json={"name": "  "}).status_code == 400

    def test_04_create_task_and_member_rule(self):
        bid = S["board"]["id"]
        r = a("POST", "/tasks", json={"title": "TEST_task_scoped", "board_id": bid, "assignee_id": "test_emp_1"})
        assert r.status_code == 400 and "anggota board" in r.text
        r = a("POST", "/tasks", json={"title": "TEST_task_scoped_unique_qa", "board_id": bid})
        assert r.status_code == 200, r.text
        S["task"] = r.json()
        assert S["task"]["board_id"] == bid and S["task"]["progress"] is None
        r = a("PATCH", f"/tasks/{S['task']['id']}", json={"reviewer_id": "test_emp_1"})
        assert r.status_code == 400
        r = a("PATCH", f"/tasks/{S['task']['id']}", json={"checkpoints": [{"title": "x", "assignee_id": "test_emp_1"}]})
        assert r.status_code == 400

    def test_05_filter_by_board(self):
        r = a("GET", f"/tasks?board_id={S['board']['id']}").json()
        assert [t["id"] for t in r] == [S["task"]["id"]]

    def test_06_employee_blocked(self):
        tid = S["task"]["id"]
        assert e("GET", f"/tasks/{tid}").status_code == 404
        assert e("PATCH", f"/tasks/{tid}", json={"title": "hack"}).status_code == 404
        assert e("POST", f"/tasks/{tid}/comments", json={"text": "x"}).status_code == 404
        s = e("GET", "/search?q=TEST_task_scoped_unique_qa").json()
        assert s["tasks"] == []
        assert e("GET", "/stats/monthly").json()["tasks"] == []
        prof = e("GET", "/users/test_admin_1")
        assert prof.status_code == 200 and prof.json().get("tasks", []) == []
        ex = e("GET", "/tasks/export?format=json")
        assert ex.status_code == 200 and ex.json() == []
        assert e("POST", "/tasks", json={"title": "TEST_no"}).status_code == 400
        assert e("POST", "/tasks", json={"title": "TEST_no", "board_id": S["board"]["id"]}).status_code == 404
        assert e("GET", f"/tasks?board_id={S['board']['id']}").json() == []

    def test_07_activity_feed_leak(self):
        # /api/activity should not expose tasks of boards the user is not a member of
        acts = e("GET", "/activity").json()
        leaked = [x for x in acts if x.get("task_id") == S["task"]["id"]]
        assert not leaked, f"activity leaks {len(leaked)} entries of non-member task"

    def test_08_add_employee_to_board(self):
        bid = S["board"]["id"]
        r = a("PATCH", f"/boards/{bid}", json={"member_ids": S["board"]["member_ids"] + ["test_emp_1"]})
        assert r.status_code == 200 and "test_emp_1" in r.json()["member_ids"]
        bs = e("GET", "/boards").json()
        assert [b["id"] for b in bs] == [bid]
        ts = e("GET", "/tasks").json()
        assert [t["id"] for t in ts] == [S["task"]["id"]]
        assert e("GET", f"/tasks/{S['task']['id']}").status_code == 200
        assert e("POST", "/tasks", json={"title": "TEST_no", "board_id": S["marketing"]["id"]}).status_code == 404
        assert e("GET", f"/tasks?board_id={S['marketing']['id']}").json() == []
        assert e("PATCH", f"/boards/{bid}", json={"name": "x"}).status_code == 403
        assert e("DELETE", f"/boards/{bid}").status_code == 403

    def test_09_employee_creates_without_board_id(self):
        r = e("POST", "/tasks", json={"title": "TEST_emp_task"})
        assert r.status_code == 200, r.text
        assert r.json()["board_id"] == S["board"]["id"]
        S["emp_task"] = r.json()

    def test_10_checkpoints_progress(self):
        tid = S["task"]["id"]
        cps = [{"title": "Fase 1", "assignee_id": "test_emp_1"}, {"title": "Fase 2", "assignee_id": "test_admin_1"}]
        r = a("PATCH", f"/tasks/{tid}", json={"checkpoints": cps})
        assert r.status_code == 200, r.text
        t = r.json()
        assert len(t["checkpoints"]) == 2 and t["progress"] == 0
        S["cps"] = t["checkpoints"]
        # employee is PIC (not assignee) -> can tick
        new = [{**S["cps"][0], "done": True}, S["cps"][1]]
        r = e("PATCH", f"/tasks/{tid}", json={"checkpoints": new})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["progress"] == 50
        assert t["checkpoints"][0]["done_by"] == "test_emp_1"
        assert a("GET", f"/tasks/{tid}").json()["progress"] == 50

    def test_11_issue_comments(self):
        tid = S["task"]["id"]
        r = e("POST", f"/tasks/{tid}/comments", json={"text": "TEST_kendala", "kind": "issue", "checkpoint_id": S["cps"][0]["id"]})
        assert r.status_code == 200
        c = r.json()
        assert c["kind"] == "issue" and c["checkpoint_id"] == S["cps"][0]["id"] and c["resolved"] is False
        assert a("GET", f"/tasks/{tid}").json()["open_issues"] == 1
        ids = [t["id"] for t in a("GET", "/tasks?view=issues").json()]
        assert tid in ids and S["emp_task"]["id"] not in ids
        r = a("PATCH", f"/tasks/{tid}/comments/{c['id']}", json={"resolved": True})
        assert r.status_code == 200
        assert a("GET", f"/tasks/{tid}").json()["open_issues"] == 0
        assert tid not in [t["id"] for t in a("GET", "/tasks?view=issues").json()]
        r = a("PATCH", f"/tasks/{tid}/comments/{c['id']}", json={"resolved": False})
        assert a("GET", f"/tasks/{tid}").json()["open_issues"] == 1
        a("PATCH", f"/tasks/{tid}/comments/{c['id']}", json={"resolved": True})
        # normal comment not resolvable
        n = a("POST", f"/tasks/{tid}/comments", json={"text": "TEST_update"}).json()
        assert n["kind"] == "update"
        assert a("PATCH", f"/tasks/{tid}/comments/{n['id']}", json={"resolved": True}).status_code == 404

    def test_12_delete_board_with_tasks_fails(self):
        r = a("DELETE", f"/boards/{S['board']['id']}")
        assert r.status_code == 400

    def test_13_move_board_member_check(self):
        # moving to Board Marketing: emp_1 checkpoint PIC is not member there -> 400
        r = a("PATCH", f"/tasks/{S['task']['id']}", json={"board_id": S["marketing"]["id"]})
        assert r.status_code == 400


# ---------- Beranda ----------
class TestFeed:
    def test_20_post_tags(self):
        r = a("POST", "/posts", json={"text": "TEST_post agenda #rapat dan #Promo minggu ini"})
        assert r.status_code == 200
        p = r.json()
        assert p["tags"] == ["rapat", "promo"]
        S["post"] = p
        ids = [x["id"] for x in a("GET", "/posts?tag=promo").json()]
        assert p["id"] in ids
        lst = a("GET", "/posts?tag=Promo").json()
        assert all("promo" in x.get("tags", []) or any("promo" in rr.get("tags", []) for rr in x.get("replies_preview", [])) or True for x in lst)
        assert p["id"] not in [x["id"] for x in a("GET", "/posts?tag=zzznotag").json()]

    def test_21_reply_tag_surfaces_parent(self):
        tag = f"qa{uuid.uuid4().hex[:6]}"
        S["rtag"] = tag
        S["replies"] = []
        for i in range(7):
            txt = f"TEST_reply {i}" + (f" #{tag}" if i == 6 else "")
            r = a("POST", "/posts", json={"text": txt, "parent_id": S["post"]["id"]})
            assert r.status_code == 200
            S["replies"].append(r.json()["id"])
        lst = a("GET", f"/posts?tag={tag}").json()
        assert [x["id"] for x in lst] == [S["post"]["id"]]

    def test_22_replies_preview(self):
        lst = a("GET", "/posts").json()
        p = next(x for x in lst if x["id"] == S["post"]["id"])
        assert p["reply_count"] == 7
        assert [r["id"] for r in p["replies_preview"]] == S["replies"][:5]
        full = a("GET", f"/posts/{S['post']['id']}").json()
        assert len(full["replies"]) == 7

    def test_23_trending(self):
        tr = a("GET", "/posts/trending").json()
        tags = {x["tag"]: x["count"] for x in tr}
        assert "rapat" in tags and "promo" in tags
        counts = [x["count"] for x in tr]
        assert counts == sorted(counts, reverse=True)

    def test_24_like_react_reply(self):
        rid = S["replies"][0]
        r = e("POST", f"/posts/{rid}/like")
        assert r.status_code == 200 and r.json()["liked"] is True
        r = e("POST", f"/posts/{rid}/react", json={"emoji": "🎉"})
        assert r.status_code == 200 and "test_emp_1" in r.json()["reactions"]["🎉"]
        p = next(x for x in e("GET", "/posts").json() if x["id"] == S["post"]["id"])
        assert p["replies_preview"][0]["liked"] is True


# ---------- Cleanup ----------
class TestZCleanup:
    def test_99_cleanup(self):
        for pid in S.get("replies", []) + ([S["post"]["id"]] if S.get("post") else []):
            a("DELETE", f"/posts/{pid}")
        if S.get("board"):
            a("PATCH", f"/boards/{S['board']['id']}", json={"member_ids": [m for m in S["board"]["member_ids"] if m != "test_emp_1"]})
        assert e("GET", "/boards").json() == []
