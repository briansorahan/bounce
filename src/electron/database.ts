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
    `);
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
