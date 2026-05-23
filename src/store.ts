import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(__dirname, '..', 'data');
const DB_FILE = join(DATA_DIR, 'bot.db');

let db: Database.Database;

export function initStore(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT NOT NULL,
      key      TEXT NOT NULL,
      value    TEXT NOT NULL,
      PRIMARY KEY (guild_id, key)
    );
    CREATE TABLE IF NOT EXISTS verification_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      username   TEXT NOT NULL,
      content    TEXT NOT NULL,
      timestamp  TEXT NOT NULL,
      success    INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function getSetting(guildId: string, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE guild_id = ? AND key = ?').get(guildId, key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(guildId: string, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (guild_id, key, value) VALUES (?, ?, ?)').run(guildId, key, value);
}

export interface VerificationEntry {
  id:        number;
  discordId: string;
  username:  string;
  content:   string;
  timestamp: string;
  success:   boolean;
}

const MAX_LOG = 1000;

export function logVerificationAttempt(guildId: string, discordId: string, username: string, content: string, success: boolean): void {
  db.prepare('INSERT INTO verification_log (guild_id, discord_id, username, content, timestamp, success) VALUES (?, ?, ?, ?, ?, ?)')
    .run(guildId, discordId, username, content, new Date().toISOString(), success ? 1 : 0);
  db.prepare(`
    DELETE FROM verification_log WHERE guild_id = ? AND id NOT IN (
      SELECT id FROM verification_log WHERE guild_id = ? ORDER BY id DESC LIMIT ${MAX_LOG}
    )
  `).run(guildId, guildId);
}

export function getVerificationLog(guildId: string): VerificationEntry[] {
  return (db.prepare('SELECT id, discord_id, username, content, timestamp, success FROM verification_log WHERE guild_id = ? ORDER BY id DESC').all(guildId) as any[])
    .map(r => ({
      id:        r.id,
      discordId: r.discord_id,
      username:  r.username,
      content:   r.content,
      timestamp: r.timestamp,
      success:   r.success === 1,
    }));
}
