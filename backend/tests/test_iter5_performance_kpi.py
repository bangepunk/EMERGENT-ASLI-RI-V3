# Iteration 5: Performance monitoring dashboard (/api/stats/performance) + workspace kpi_target
import os
from datetime import datetime, timezone, timedelta
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
MONTH = "2026-11"
BOARD = "board_66d3f84ff6e1"


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


def expected(month, assignee=None):
    """Independent recomputation from DB."""
    today = datetime.now(WIB).date()
    y, m = map(int, month.split("-"))
    q = {"workspace_id": "ws_internal", "archived": {"$ne": True}, "assignee_id": {"$ne": None}}
    if assignee:
        q["assignee_id"] = assignee
    out = []
    for t in mdb.tasks.find(q, {"_id": 0}):
        dl = wib(t.get("deadline"))
        if dl:
            if (dl.year, dl.month) != (y, m):
                continue
        else:
            c = wib(t.get("created_at"))
            if not c or (c.year, c.month) != (y, m):
                continue
        done = t["status"] == "done"
        comp = wib(t.get("completed_at"))
        if done:
            st = ("late" if comp and comp.date() > dl.date() else "on_time") if dl else "done"
        else:
            st = "overdue" if dl and dl.date() < today else "pending"
        out.append({"id": t["id"], "done": done, "state": st, "due": bool(dl) and (done or dl.date() < today), "uid": t["assignee_id"]})
    due = sum(x["due"] for x in out)
    on = sum(x["state"] == "on_time" for x in out)
    return {"total": len(out), "done": sum(x["done"] for x in out), "overdue": sum(x["state"] == "overdue" for x in out),
            "late": sum(x["state"] == "late" for x in out), "on_time": on, "due": due,
            "on_time_rate": round(100 * on / due) if due else None, "rows": out}


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids
    if ids:
        mdb.tasks.delete_many({"id": {"$in": ids}, "title": {"$regex": "^TEST_"}})


# --- Performance endpoint shape & math
class TestPerformance:
    def test_shape(self):
        r = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("summary", "employees", "days", "warnings", "day_tasks", "user_tasks", "trend", "kpi_target", "min_data", "day"):
            assert k in d, k
        assert len(d["days"]) == 30
        assert len(d["trend"]) == 6 and d["trend"][-1]["month"] == MONTH and d["trend"][0]["month"] == "2026-06"
        assert d["scope"] == "all" and d["user_tasks"] == []
        assert d["min_data"] == 3

    def test_summary_math(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN).json()
        e = expected(MONTH)
        s = d["summary"]
        for k in ("total", "done", "overdue", "late", "on_time", "due", "on_time_rate"):
            assert s[k] == e[k], (k, s[k], e[k])
        assert s["in_progress"] + s["not_started"] + s["done"] == s["total"]

    def test_employee_math(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN).json()
        for emp in d["employees"]:
            e = expected(MONTH, emp["user_id"])
            assert emp["total"] == e["total"] and emp["due"] == e["due"] and emp["on_time_rate"] == e["on_time_rate"], emp

    def test_days_consistency(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN).json()
        for day in d["days"]:
            assert day["done"] + day["pending"] == day["total"]
            if day["total"] == 0:
                assert day["status"] == "none"
            elif day["done"] == day["total"]:
                assert day["status"] == "done"

    def test_day_param(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH, "day": "2026-11-03"}, headers=ADMIN).json()
        assert d["day"] == "2026-11-03"
        assert all(t["day"] == "2026-11-03" for t in d["day_tasks"])
        cell = next(x for x in d["days"] if x["date"] == "2026-11-03")
        assert len(d["day_tasks"]) == cell["total"]

    def test_user_filter(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH, "user_id": "user_7b0ef5a1a94a"}, headers=ADMIN).json()
        assert d["scope"] == "user"
        assert all(t["assignee_id"] == "user_7b0ef5a1a94a" for t in d["user_tasks"])
        assert d["summary"]["total"] == expected(MONTH, "user_7b0ef5a1a94a")["total"] == len(d["user_tasks"])

    def test_employee_scope_own_only(self):
        r = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH, "user_id": "user_7b0ef5a1a94a"}, headers=EMP)
        assert r.status_code == 200
        d = r.json()
        assert d["scope"] == "user"
        assert all(e["user_id"] == "test_emp_1" for e in d["employees"])
        assert all(t["assignee_id"] == "test_emp_1" for t in d["user_tasks"] + d["day_tasks"])

    def test_invalid_month(self):
        r = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": "abc"}, headers=ADMIN)
        assert r.status_code == 400

    def test_january_trend_wraps(self):
        d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": "2026-01"}, headers=ADMIN).json()
        assert [t["month"] for t in d["trend"]] == ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]
        assert len(d["days"]) == 31

    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/api/stats/performance").status_code == 401

    def test_workload_warning(self, created):
        mdb.boards.update_one({"id": BOARD}, {"$addToSet": {"member_ids": "test_admin_1"}})
        try:
            for i in range(4):
                r = requests.post(f"{BASE_URL}/api/tasks", headers=ADMIN, json={"title": f"TEST_perf_load_{i}", "board_id": BOARD,
                                  "assignee_id": "test_admin_1", "deadline": "2026-11-20T03:00:00.000Z"})
                assert r.status_code in (200, 201), r.text
                created.append(r.json()["id"])
            d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH, "day": "2026-11-20"}, headers=ADMIN).json()
            w = [x for x in d["warnings"] if x["user_id"] == "test_admin_1" and x["date"] == "2026-11-20"]
            assert w and w[0]["count"] == 4
            emp = next(e for e in d["employees"] if e["user_id"] == "test_admin_1")
            assert emp["day_deadlines"] == 4 and emp["load"] == "padat"
            # future tasks not counted as due
            assert emp["due"] == 0 and emp["on_time_rate"] is None
            r = requests.post(f"{BASE_URL}/api/tasks", headers=ADMIN, json={"title": "TEST_perf_load_4", "board_id": BOARD,
                              "assignee_id": "test_admin_1", "deadline": "2026-11-20T03:00:00.000Z"})
            created.append(r.json()["id"])
            d = requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH, "day": "2026-11-20"}, headers=ADMIN).json()
            emp = next(e for e in d["employees"] if e["user_id"] == "test_admin_1")
            assert emp["load"] == "overload"
        finally:
            for tid in created:
                requests.patch(f"{BASE_URL}/api/tasks/{tid}", headers=ADMIN, json={"archived": True})
            mdb.boards.update_one({"id": BOARD}, {"$pull": {"member_ids": "test_admin_1"}})


# --- KPI target on workspace
class TestKpi:
    def test_admin_set_and_clamp(self):
        try:
            r = requests.patch(f"{BASE_URL}/api/workspace", headers=ADMIN, json={"kpi_target": 80})
            assert r.status_code == 200 and r.json()["kpi_target"] == 80
            assert requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN).json()["kpi_target"] == 80
            assert requests.patch(f"{BASE_URL}/api/workspace", headers=ADMIN, json={"kpi_target": 150}).json()["kpi_target"] == 100
            assert requests.patch(f"{BASE_URL}/api/workspace", headers=ADMIN, json={"kpi_target": 0}).json()["kpi_target"] == 1
            assert requests.patch(f"{BASE_URL}/api/workspace", headers=ADMIN, json={"kpi_target": "abc"}).status_code == 400
        finally:
            requests.patch(f"{BASE_URL}/api/workspace", headers=ADMIN, json={"kpi_target": 90})

    def test_employee_forbidden(self):
        assert requests.patch(f"{BASE_URL}/api/workspace", headers=EMP, json={"kpi_target": 50}).status_code == 403

    def test_restored(self):
        assert requests.get(f"{BASE_URL}/api/stats/performance", params={"month": MONTH}, headers=ADMIN).json()["kpi_target"] == 90
