import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';

export class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'bounce.db');
    
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_command_history_timestamp 
      ON command_history(timestamp DESC);

      CREATE TABLE IF NOT EXISTS debug_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp 
      ON debug_logs(timestamp DESC);
    `);
  }

  addDebugLog(level: string, message: string, data?: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO debug_logs (level, message, data, timestamp) 
      VALUES (?, ?, ?, ?)
    `);
    const dataStr = data !== undefined ? JSON.stringify(data) : null;
    stmt.run(level, message, dataStr, Date.now());
  }

  getDebugLogs(limit: number = 100): any[] {
    const stmt = this.db.prepare(`
      SELECT level, message, data, timestamp, created_at 
      FROM debug_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as any[];
  }

  clearDebugLogs(): void {
    this.db.prepare('DELETE FROM debug_logs').run();
  }

  addCommand(command: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO command_history (command, timestamp) 
      VALUES (?, ?)
    `);
    stmt.run(command, Date.now());
  }

  getCommandHistory(limit: number = 1000): string[] {
    const stmt = this.db.prepare(`
      SELECT command 
      FROM command_history 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as { command: string }[];
    return rows.map(row => row.command).reverse();
  }

  clearCommandHistory(): void {
    this.db.prepare('DELETE FROM command_history').run();
  }

  close(): void {
    this.db.close();
  }
}
