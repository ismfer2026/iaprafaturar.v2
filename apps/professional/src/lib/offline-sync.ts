import { openDB, type IDBPDatabase } from "idb";

interface SyncJob {
  id: string;
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

const DB_NAME = "iaprafaturar-offline";
const DB_VERSION = 1;
const STORE_NAME = "sync_queue";

let db: IDBPDatabase | null = null;

async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
  return db;
}

export async function enqueueSync(job: Omit<SyncJob, "createdAt" | "attempts">) {
  const database = await getDB();
  await database.put(STORE_NAME, { ...job, createdAt: Date.now(), attempts: 0 });
}

export async function getPendingJobs(): Promise<SyncJob[]> {
  const database = await getDB();
  return database.getAll(STORE_NAME) as Promise<SyncJob[]>;
}

export async function removeJob(id: string) {
  const database = await getDB();
  await database.delete(STORE_NAME, id);
}
