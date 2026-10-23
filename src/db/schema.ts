// 用户数据表结构（首次启动时执行）
export const DB_NAME = "records.db";

export const CREATE_TABLES: string[] = [
  // 做题记录
  `CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    chosen TEXT,
    is_correct INTEGER NOT NULL,
    duration_ms INTEGER,
    mode TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
  // 错题本
  `CREATE TABLE IF NOT EXISTS wrong_book (
    question_id TEXT PRIMARY KEY,
    wrong_count INTEGER DEFAULT 1,
    mastered INTEGER DEFAULT 0,
    last_wrong_at TEXT,
    next_review_at TEXT
  )`,
  // 收藏
  `CREATE TABLE IF NOT EXISTS favorites (
    question_id TEXT PRIMARY KEY,
    created_at TEXT
  )`,
  // 每日统计
  `CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    attempted INTEGER,
    correct INTEGER,
    duration_ms INTEGER
  )`,
  // 设置
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
  // AI 解析缓存
  `CREATE TABLE IF NOT EXISTS ai_explanations (
    question_id TEXT PRIMARY KEY,
    model TEXT,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`,
];

export const CREATE_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at)`,
];
