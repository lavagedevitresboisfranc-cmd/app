"""
Migration script: Local MongoDB -> MongoDB Atlas
Copies all collections from local test_database to the new Atlas cluster.
Idempotent: uses upsert on _id so running multiple times is safe.
"""
import asyncio
import os
import sys
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

LOCAL_URI = "mongodb://localhost:27017"
LOCAL_DB = "test_database"

ATLAS_URI = "mongodb+srv://lavagedevitresboisfranc_db_user:atOjp7ubW5vnRLXd@cluster0.fxwtoht.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
ATLAS_DB = "test_database"

COLLECTIONS_TO_MIGRATE = [
    "clients",
    "appointments",
    "appointment_requests",
    "expenses",
    "revenues",
    "employees",
    "scheduled_campaigns",
    "reviews",
    "backups",
]


async def migrate():
    print("🔌 Connexion à la base locale...")
    local_client = AsyncIOMotorClient(LOCAL_URI, serverSelectionTimeoutMS=10000)
    local_db = local_client[LOCAL_DB]
    try:
        await local_client.admin.command("ping")
        print("✅ Connexion locale OK")
    except Exception as e:
        print(f"❌ Erreur connexion locale: {e}")
        sys.exit(1)

    print("🔌 Connexion à MongoDB Atlas...")
    atlas_client = AsyncIOMotorClient(
        ATLAS_URI,
        serverSelectionTimeoutMS=30000,
        tls=True,
        tlsCAFile=certifi.where(),
    )
    atlas_db = atlas_client[ATLAS_DB]
    try:
        await atlas_client.admin.command("ping")
        print("✅ Connexion Atlas OK")
    except Exception as e:
        print(f"❌ Erreur connexion Atlas: {e}")
        print("   ⚠️  Vérifie que l'accès réseau est configuré à 0.0.0.0/0")
        sys.exit(2)

    # Détection automatique de toutes les collections locales (au cas où il y en a d'autres)
    all_local_collections = await local_db.list_collection_names()
    print(f"📦 Collections locales détectées: {all_local_collections}")

    collections = list(set(COLLECTIONS_TO_MIGRATE) | set(all_local_collections))

    grand_total_src = 0
    grand_total_dst = 0

    for coll_name in collections:
        src = local_db[coll_name]
        dst = atlas_db[coll_name]

        src_count = await src.count_documents({})
        grand_total_src += src_count

        if src_count == 0:
            print(f"   ⏭️  {coll_name}: vide, skip")
            continue

        print(f"   ➡️  {coll_name}: {src_count} documents à copier...")
        copied = 0
        batch = []
        async for doc in src.find({}):
            batch.append(doc)
            if len(batch) >= 100:
                # upsert chaque doc sur son _id pour être idempotent
                from pymongo import ReplaceOne
                ops = [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in batch]
                await dst.bulk_write(ops, ordered=False)
                copied += len(batch)
                batch = []
        if batch:
            from pymongo import ReplaceOne
            ops = [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in batch]
            await dst.bulk_write(ops, ordered=False)
            copied += len(batch)

        dst_count = await dst.count_documents({})
        grand_total_dst += dst_count
        status = "✅" if dst_count >= src_count else "⚠️"
        print(f"   {status} {coll_name}: {copied} copiés → {dst_count} total dans Atlas")

    print("\n==============================================")
    print(f"🏁 Migration terminée")
    print(f"   Source (local):  {grand_total_src} documents")
    print(f"   Atlas (cloud):   {grand_total_dst} documents")
    print("==============================================")

    local_client.close()
    atlas_client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
