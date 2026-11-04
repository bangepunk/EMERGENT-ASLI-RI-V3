# Iteration 6: /api/stats/team (Performa & Beban Kerja Tim + Kapasitas Personel)
import os
import uuid
from datetime import datetime, timezone, timedelta, date
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
ADMIN = {"Authorization": "Bearer test_session_admin"}
EMP = {"Authorization": "Bearer test_session_emp"}
WIB = timezone(timedelta(hours=7))
BOARD = "board_66d3f84ff6e1"
# isolated past week (Mon 2025-03-03 .. Sun 2025-03-09) for controlled TEST_ data
ANCHOR = "2025-03-05"


def _env(k):
    with open("/app/backend/.env") as fh:
        for line in fh:
            if line.startswith(k + "="):
                return line.split("=", 1)[1].strip().strip('"')


mdb = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]


def wib(s):
    if not s:
        return None
    d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(WIB)


def expected(anchor, rng="7d"):
    """Independent recomputation of series from DB (manager scope = all workspace)."""
    today = datetime.now(WIB).date()
    a = date.fromisoformat(anchor)
    w0 = a - timedelta(days=a.weekday())
    if rng == "4w":
        b = [(w0 - timedelta(weeks=3 - i), w0 - timedelta(weeks=3 - i) + timedelta(days=7)) for i in range(4)]
    else:
        b = [(w0 + timedelta(days=i), w0 + timedelta(days=i + 1)) for i in range(7)]
    tasks = list(mdb.tasks.find({"workspace_id": "ws_internal", "archived": {"$ne": True}, "assignee_id": {"$ne": None}}, {"_id": 0}))
    series = []
    for s0, s1 in b:
        done = over = 0
        for t in tasks:
            isdone = t["status"] == "done"
            c, dl = wib(t.get("completed_at")), wib(t.get("deadline"))
            if isdone and c and s0 <= c.date() < s1:
                done += 1
            if dl and s0 <= dl.date() < s1:
                if (isdone and c and c.date() > dl.date()) or (not isdone and dl.date() < today):
                    over += 1
        series.append({"start": s0.isoformat(), "done": done, "overdue": over})
    return series


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids
    if ids:
        mdb.tasks.delete_many({"id": {"$in": ids}})


def mk(ids, **kw):
    tid = f"task_TEST_{uuid.uuid4().hex[:10]}"
    doc = {"id": tid, "workspace_id": "ws_internal", "board_id": BOARD, "title": f"TEST_{tid}", "status": "todo",
           "priority": "medium", "assignee_id": "test_admin_1", "archived": False, "label_ids": [], "checkpoints": [],
           "created_at": "2025-03-01T00:00:00.000Z", "completed_at": None, "number_str": "T-TEST"}
    doc.update(kw)
    mdb.tasks.insert_one(dict(doc))
    ids.append(tid)
    return tid


# --- basic contract
class TestContract:
    def test_default_7d(self):
        r = requests.get(f"{BASE_URL}/api/stats/team", headers=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d["range"] == "7d" and d["anchor"] == d["today"]
        assert len(d["series"]) == 7 and len(d["week"]) == 7
        assert date.fromisoformat(d["week"][0]).weekday() == 0
        assert d["series"][0]["start"] == d["week"][0]
        assert d["summary"]["done"] == sum(s["done"] for s in d["series"])
        assert d["summary"]["overdue"] == sum(s["overdue"] for s in d["series"])

    def test_4w(self):
        d = requests.get(f"{BASE_URL}/api/stats/team", params={"range": "4w", "anchor": "2026-01-14"}, headers=ADMIN).json()
        assert d["range"] == "4w" and len(d["series"]) == 4
        assert [s["start"] for s in d["series"]] == ["2025-12-22", "2025-12-29", "2026-01-05", "2026-01-12"]

    def test_invalid_anchor(self):
        r = requests.get(f"{BASE_URL}/api/stats/team", params={"anchor": "2026-13-45"}, headers=ADMIN)
        assert r.status_code == 400

    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/api/stats/team").status_code == 401

    @pytest.mark.parametrize("anchor,rng", [(None, "7d"), (None, "4w"), ("2026-01-07", "7d"), ("2025-12-31", "4w")])
    def test_matches_db_recompute(self, anchor, rng):
        a = anchor or datetime.now(WIB).date().isoformat()
        d = requests.get(f"{BASE_URL}/api/stats/team", params={"range": rng, "anchor": a}, headers=ADMIN).json()
        assert d["series"] == expected(a, rng)

    def test_people_manager(self):
        d = requests.get(f"{BASE_URL}/api/stats/team", headers=ADMIN).json()
        n = mdb.users.count_documents({"workspace_id": "ws_internal", "status": "active"})
        assert len(d["people"]) == n
        for p in d["people"]:
            assert p["status"] == ("optimal" if p["day_deadlines"] <= 1 else "stabil" if p["day_deadlines"] <= 3 else "pressure")
            assert len(p["tasks"]) <= 3 and p["more"] == max(0, p["active"] - 3)

    def test_employee_scope(self):
        d = requests.get(f"{BASE_URL}/api/stats/team", headers=EMP).json()
        assert len(d["people"]) == 1 and d["people"][0]["user_id"] == "test_emp_1"


# --- controlled TEST_ data in isolated past week
class TestCounting:
    def test_counting_rules(self, created):
        before = requests.get(f"{BASE_URL}/api/stats/team", params={"anchor": ANCHOR}, headers=ADMIN).json()
        # done on time: deadline Wed 3/5 10:00 WIB, completed Tue 3/4 15:00 WIB
        mk(created, status="done", deadline="2025-03-05T03:00:00.000Z", completed_at="2025-03-04T08:00:00.000000+00:00")
        # done late: deadline Mon 3/3, completed Thu 3/6 (WIB 06:00 -> UTC 3/5 23:00, tests WIB conversion)
        mk(created, status="done", deadline="2025-03-03T03:00:00.000Z", completed_at="2025-03-05T23:00:00.000000+00:00")
        # still overdue: deadline Wed 3/5 not done
        mk(created, status="in_progress", deadline="2025-03-05T05:00:00.000Z")
        mk(created, status="todo", deadline="2025-03-05T06:00:00.000Z")
        mk(created, status="todo", deadline="2025-03-05T07:00:00.000Z")
        after = requests.get(f"{BASE_URL}/api/stats/team", params={"anchor": ANCHOR}, headers=ADMIN).json()
        delta = [(a["done"] - b["done"], a["overdue"] - b["overdue"]) for a, b in zip(after["series"], before["series"])]
        # Mon: +1 overdue (late), Tue: +1 done, Wed: +3 overdue, Thu: +1 done (WIB)
        assert delta == [(0, 1), (1, 0), (0, 3), (1, 0), (0, 0), (0, 0), (0, 0)], delta
        assert after["summary"]["due"] - before["summary"]["due"] == 5
        assert after["summary"]["on_time"] - before["summary"]["on_time"] == 1
        me = next(p for p in after["people"] if p["user_id"] == "test_admin_1")
        assert me["day_deadlines"] >= 4 and me["status"] == "pressure"  # 4 deadlines on 3/5

    def test_future_deadline_not_overdue(self, created):
        fut = (datetime.now(WIB).date() + timedelta(days=60))
        before = requests.get(f"{BASE_URL}/api/stats/team", params={"anchor": fut.isoformat()}, headers=ADMIN).json()
        mk(created, status="todo", deadline=f"{fut.isoformat()}T03:00:00.000Z")
        after = requests.get(f"{BASE_URL}/api/stats/team", params={"anchor": fut.isoformat()}, headers=ADMIN).json()
        assert after["summary"]["overdue"] == before["summary"]["overdue"]
        assert after["summary"]["due"] == before["summary"]["due"]
