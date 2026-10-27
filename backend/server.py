from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import os  # noqa: E402
import logging  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
from core import client, init_storage  # noqa: E402
import routes_auth  # noqa: E402
import routes_people  # noqa: E402
import routes_chat  # noqa: E402
import routes_tasks  # noqa: E402
import routes_misc  # noqa: E402
from seed import seed_all  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("circle")
app = FastAPI(title="CIRCLE")
for r in (routes_auth, routes_people, routes_chat, routes_tasks, routes_misc):
    app.include_router(r.router)

origins = os.environ.get("CORS_ORIGINS", "").split(",")
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
                   **({"allow_origin_regex": ".*"} if origins == ["*"] else {"allow_origins": origins}))


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.on_event("startup")
async def startup():
    await seed_all()
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
