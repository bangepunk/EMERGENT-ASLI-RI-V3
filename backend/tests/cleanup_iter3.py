# Cleanup of TEST_ data created by iteration 3 tests (tasks/comments/activity in TEST_ boards, TEST_ boards, TEST_ posts)
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    boards = [b["id"] async for b in db.boards.find({"name": {"$regex": "^TEST_"}}, {"id": 1})]
    tids = [t["id"] async for t in db.tasks.find({"board_id": {"$in": boards}}, {"id": 1})]
    print("boards", boards, "tasks", tids)
    await db.task_comments.delete_many({"task_id": {"$in": tids}})
    await db.task_activity.delete_many({"task_id": {"$in": tids}})
    await db.tasks.delete_many({"id": {"$in": tids}})
    await db.boards.delete_many({"id": {"$in": boards}})
    r = await db.posts.update_many({"text": {"$regex": "^TEST_"}, "deleted": {"$ne": True}}, {"$set": {"deleted": True}})
    print("posts soft-deleted", r.modified_count)

asyncio.run(main())
