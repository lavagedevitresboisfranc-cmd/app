"""
Merge script: Emergent production MongoDB -> MongoDB Atlas
Pulls any data that exists in production but is missing (or newer) in Atlas.
Safe: uses upsert on _id — existing Atlas docs are preserved.
"""
import asyncio
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReplaceOne

PROD_URI = "mongodb+srv://booking-hub-406:d7g5gir6p6ps73b7muf0@customer-apps.ctvmfk.mongodb.net/?appName=booking-hub-406&retryWrites=true&w=majority"
PROD_DB = "test_database"

ATLAS_URI = "mongodb+srv://lavagedevitresboisfranc_db_user:atOjp7ubW5vnRLXd@cluster0.fxwtoht.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
ATLAS_DB = "test_database"


async def merge():
    print("🔌 Connexion à la production Emergent...")
    prod_client = AsyncIOMotorClient(PROD_URI, tls=True, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=30000)
    prod_db = prod_client[PROD_DB]
    try:
        await prod_client.admin.command("ping")
        print("✅ Connexion production OK")
    except Exception as e:
        print(f"❌ Erreur production: {e}")
        return

    # Try the default database too, in case data is in 'prod' or another
    prod_dbs = await prod_client.list_database_names()
    print(f"📦 Bases trouvées en production: {prod_dbs}")

    print("🔌 Connexion à MongoDB Atlas...")
    atlas_client = AsyncIOMotorClient(ATLAS_URI, tls=True, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=30000)
    atlas_db = atlas_client[ATLAS_DB]
    await atlas_client.admin.command("ping")
    print("✅ Connexion Atlas OK")

    # Try each DB that might have our collections
    candidate_dbs = [d for d in prod_dbs if d not in ("admin", "local", "config")]
    print(f"🔎 Bases à examiner: {candidate_dbs}")

    for dbname in candidate_dbs:
        pdb = prod_client[dbname]
        collections = await pdb.list_collection_names()
        if not collections:
            continue
        print(f"\n📂 Base '{dbname}' — collections: {collections}")

        for coll_name in collections:
            src = pdb[coll_name]
            dst = atlas_db[coll_name]

            src_count = await src.count_documents({})
            dst_count_before = await dst.count_documents({})

            if src_count == 0:
                print(f"   ⏭️  {coll_name}: vide en production")
                continue

            print(f"   ➡️  {coll_name}: {src_count} en prod | {dst_count_before} déjà dans Atlas")

            # Find IDs missing from Atlas (only copy those, no overwrite)
            atlas_ids = set()
            async for d in dst.find({}, {"_id": 1}):
                atlas_ids.add(d["_id"])

            new_docs = []
            async for d in src.find({}):
                if d["_id"] not in atlas_ids:
                    new_docs.append(d)

            if not new_docs:
                print(f"   ✅ {coll_name}: rien à ajouter, tout est déjà dans Atlas")
                continue

            # Bulk insert missing docs
            ops = [ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in new_docs]
            # chunk by 100
            for i in range(0, len(ops), 100):
                await dst.bulk_write(ops[i:i+100], ordered=False)

            dst_count_after = await dst.count_documents({})
            print(f"   🎯 {coll_name}: {len(new_docs)} NOUVEAUX documents ajoutés → {dst_count_after} total dans Atlas")

            # Show new docs briefly
            for d in new_docs[:5]:
                name = d.get("customer_name") or d.get("client_name") or d.get("name") or d.get("vendor") or "?"
                date = d.get("preferred_date") or d.get("date") or d.get("created_at") or ""
                print(f"      • {name} — {date}")

    print("\n==============================================")
    print("🏁 Fusion terminée")
    print("==============================================")

    prod_client.close()
    atlas_client.close()


if __name__ == "__main__":
    asyncio.run(merge())
