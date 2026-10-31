# Iteration 4: weekly report cron auth, login image branding, group photo permissions
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
ADMIN = {"Authorization": "Bearer test_session_admin"}
EMP = {"Authorization": "Bearer test_session_emp"}

PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082")


# --- Weekly report cron / test endpoint (never call with real secret)
class TestWeeklyReport:
    def test_cron_no_token(self):
        r = requests.post(f"{BASE_URL}/api/cron/weekly-report", json={"run_id": "TEST_x"})
        assert r.status_code == 401

    def test_cron_wrong_token(self):
        r = requests.post(f"{BASE_URL}/api/cron/weekly-report", json={"run_id": "TEST_x"}, headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401

    def test_cron_non_bearer(self):
        r = requests.post(f"{BASE_URL}/api/cron/weekly-report", headers={"Authorization": "Basic abc"})
        assert r.status_code == 401

    def test_weekly_test_employee_forbidden(self):
        r = requests.post(f"{BASE_URL}/api/reports/weekly/test", headers=EMP)
        assert r.status_code == 403

    def test_weekly_test_unauth(self):
        r = requests.post(f"{BASE_URL}/api/reports/weekly/test")
        assert r.status_code == 401


# --- Login image branding
class TestLoginImage:
    def test_employee_cannot_patch_workspace(self):
        r = requests.patch(f"{BASE_URL}/api/workspace", json={"login_image_file_id": None}, headers=EMP)
        assert r.status_code == 403

    def test_public_login_image_unknown_404(self):
        r = requests.get(f"{BASE_URL}/api/public/login-image/file_doesnotexist")
        assert r.status_code == 404

    def test_upload_set_public_and_reset(self):
        up = requests.post(f"{BASE_URL}/api/upload", headers=ADMIN, files={"file": ("TEST_login.png", io.BytesIO(PNG), "image/png")})
        assert up.status_code == 200, up.text
        fid = up.json()["id"]
        try:
            # file not yet configured -> public 404
            assert requests.get(f"{BASE_URL}/api/public/login-image/{fid}").status_code == 404
            p = requests.patch(f"{BASE_URL}/api/workspace", json={"login_image_file_id": fid}, headers=ADMIN)
            assert p.status_code == 200
            assert p.json()["login_image_file_id"] == fid
            b = requests.get(f"{BASE_URL}/api/public/branding").json()
            assert b["login_image_file_id"] == fid
            img = requests.get(f"{BASE_URL}/api/public/login-image/{fid}")
            assert img.status_code == 200
            assert img.headers["content-type"].startswith("image/png")
            assert img.content == PNG
        finally:
            requests.patch(f"{BASE_URL}/api/workspace", json={"login_image_file_id": None}, headers=ADMIN)
        assert requests.get(f"{BASE_URL}/api/public/branding").json().get("login_image_file_id") is None
        assert requests.get(f"{BASE_URL}/api/public/login-image/{fid}").status_code == 404

    def test_non_image_file_not_served(self):
        up = requests.post(f"{BASE_URL}/api/upload", headers=ADMIN, files={"file": ("TEST_x.txt", io.BytesIO(b"hello"), "text/plain")})
        assert up.status_code == 200
        fid = up.json()["id"]
        try:
            p = requests.patch(f"{BASE_URL}/api/workspace", json={"login_image_file_id": fid}, headers=ADMIN)
            print("PATCH non-image login_image status:", p.status_code)
            assert requests.get(f"{BASE_URL}/api/public/login-image/{fid}").status_code == 404
        finally:
            requests.patch(f"{BASE_URL}/api/workspace", json={"login_image_file_id": None}, headers=ADMIN)


# --- Group photo permissions
@pytest.fixture(scope="module")
def img_id():
    up = requests.post(f"{BASE_URL}/api/upload", headers=ADMIN, files={"file": ("TEST_grp.png", io.BytesIO(PNG), "image/png")})
    return up.json()["id"]


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids
    for cid, h in ids:
        requests.delete(f"{BASE_URL}/api/groups/{cid}", headers=h)


class TestGroupPhoto:
    def test_emp_create_with_image_ignored(self, img_id, created):
        r = requests.post(f"{BASE_URL}/api/groups", json={"name": "TEST_emp_grp", "image": img_id, "group_type": "public"}, headers=EMP)
        assert r.status_code == 200
        created.append((r.json()["id"], EMP))
        assert r.json()["image"] == ""

    def test_emp_patch_image_forbidden(self, img_id, created):
        cid = created[0][0]
        r = requests.patch(f"{BASE_URL}/api/groups/{cid}", json={"image": img_id}, headers=EMP)
        assert r.status_code == 403
        assert "Hanya Super Admin" in r.json().get("detail", "")

    def test_emp_patch_other_fields_with_same_image_ok(self, created):
        cid = created[0][0]
        r = requests.patch(f"{BASE_URL}/api/groups/{cid}", json={"name": "TEST_emp_grp2", "image": "", "description": "d"}, headers=EMP)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/conversations/{cid}", headers=EMP).json()
        assert g["name"] == "TEST_emp_grp2" and g["image"] == ""

    def test_super_admin_create_with_image(self, img_id, created):
        r = requests.post(f"{BASE_URL}/api/groups", json={"name": "TEST_admin_grp", "image": img_id, "group_type": "private"}, headers=ADMIN)
        assert r.status_code == 200
        created.append((r.json()["id"], ADMIN))
        assert r.json()["image"] == img_id

    def test_super_admin_change_image(self, img_id, created):
        cid = created[1][0]
        r = requests.patch(f"{BASE_URL}/api/groups/{cid}", json={"image": ""}, headers=ADMIN)
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/conversations/{cid}", headers=ADMIN).json()["image"] == ""
        r = requests.patch(f"{BASE_URL}/api/groups/{cid}", json={"image": img_id}, headers=ADMIN)
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/conversations/{cid}", headers=ADMIN).json()["image"] == img_id

    def test_super_admin_change_image_on_emp_group(self, img_id, created):
        cid = created[0][0]
        r = requests.patch(f"{BASE_URL}/api/groups/{cid}", json={"image": img_id}, headers=ADMIN)
        print("super admin patch on emp private group:", r.status_code, r.text[:200])
        assert r.status_code == 200
