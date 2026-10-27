# Auth testing (CIRCLE)
Emergent Google OAuth cannot be automated. Use pre-seeded sessions from /app/memory/test_credentials.md:
- API: `Authorization: Bearer test_session_admin` (super admin, ws_internal) or `test_session_emp` (employee).
- Browser: add cookie `session_token=test_session_admin` (domain circle-team.preview.emergentagent.com, path /, secure, httpOnly, sameSite None) then open the app.
- Demo mode: on /login click a `demo-login-demo_<name>` button (isolated ws_demo data).
Clean up TEST_ records after testing.
