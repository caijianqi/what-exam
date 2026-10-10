import Database from "@tauri-apps/plugin-sql";
import { DB_NAME, CREATE_TABLES, CREATE_INDEXES } from "./schema";

let dbPromise: Promise<Database> | null = null;

/** 获取数据库连接（首次调用时建库建表） */
export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb(): Promise<Database> {
  const db = await Database.load(`sqlite:${DB_NAME}`);
  for (const sql of [...CREATE_TABLES, ...CREATE_INDEXES]) {
    await db.execute(sql);
  }
  return db;
}

/** 便捷查询：返回结果数组 */
export async function query<T = unknown>(
  sql: string,
  args: unknown[] = []
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, args);
}

/** 便捷执行：INSERT / UPDATE / DELETE */
export async function exec(sql: string, args: unknown[] = []): Promise<void> {
  const db = await getDb();
  await db.execute(sql, args);
}
