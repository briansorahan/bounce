import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';

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

      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        audio_data BLOB NOT NULL,
        sample_rate INTEGER NOT NULL,
        channels INTEGER NOT NULL,
        duration REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_samples_hash 
      ON samples(hash);

      CREATE INDEX IF NOT EXISTS idx_samples_file_path 
      ON samples(file_path);

      CREATE TABLE IF NOT EXISTS features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_hash TEXT NOT NULL,
        feature_hash TEXT NOT NULL,
        feature_type TEXT NOT NULL,
        feature_data TEXT NOT NULL,
        options TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sample_hash, feature_hash),
        FOREIGN KEY (sample_hash) REFERENCES samples(hash)
      );

      CREATE INDEX IF NOT EXISTS idx_features_sample 
      ON features(sample_hash);

      CREATE INDEX IF NOT EXISTS idx_features_type 
      ON features(feature_type);

      CREATE INDEX IF NOT EXISTS idx_features_hash 
      ON features(feature_hash);

      CREATE TABLE IF NOT EXISTS slices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_hash TEXT NOT NULL,
        feature_id INTEGER NOT NULL,
        slice_index INTEGER NOT NULL,
        start_sample INTEGER NOT NULL,
        end_sample INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sample_hash) REFERENCES samples(hash),
        FOREIGN KEY (feature_id) REFERENCES features(id)
      );

      CREATE INDEX IF NOT EXISTS idx_slices_sample 
      ON slices(sample_hash);

      CREATE INDEX IF NOT EXISTS idx_slices_feature 
      ON slices(feature_id);
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
    const lastCommand = this.db.prepare(`
      SELECT command FROM command_history 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get() as { command: string } | undefined;

    if (lastCommand?.command === command) {
      return;
    }

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

  dedupeCommandHistory(): { removed: number } {
    const stmt = this.db.prepare(`
      DELETE FROM command_history
      WHERE id IN (
        SELECT h1.id
        FROM command_history h1
        INNER JOIN command_history h2 
          ON h1.command = h2.command 
          AND h1.timestamp > h2.timestamp
        WHERE NOT EXISTS (
          SELECT 1 FROM command_history h3
          WHERE h3.timestamp > h2.timestamp 
            AND h3.timestamp < h1.timestamp
        )
      )
    `);
    const result = stmt.run();
    return { removed: result.changes };
  }

  close(): void {
    this.db.close();
  }

  storeSample(hash: string, filePath: string, audioData: Buffer, sampleRate: number, channels: number, duration: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO samples (hash, file_path, audio_data, sample_rate, channels, duration) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(hash, filePath, audioData, sampleRate, channels, duration);
  }

  getSampleByHash(hash: string): { id: number; hash: string; file_path: string; audio_data: Buffer; sample_rate: number; channels: number; duration: number } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration 
      FROM samples 
      WHERE hash = ? 
      LIMIT 1
    `);
    return stmt.get(hash) as any;
  }

  getSampleByPath(filePath: string): { id: number; hash: string; file_path: string; audio_data: Buffer; sample_rate: number; channels: number; duration: number } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration 
      FROM samples 
      WHERE file_path = ? 
      ORDER BY id DESC 
      LIMIT 1
    `);
    return stmt.get(filePath) as any;
  }

  storeFeature(sampleHash: string, featureType: string, featureData: number[], options?: any): number {
    // Compute hash of feature data and options
    const dataStr = JSON.stringify(featureData);
    const optionsStr = options ? JSON.stringify(options) : '';
    const featureContent = `${featureType}:${dataStr}:${optionsStr}`;
    const featureHash = crypto.createHash('sha256').update(featureContent).digest('hex');
    
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO features (sample_hash, feature_hash, feature_type, feature_data, options) 
      VALUES (?, ?, ?, ?, ?)
    `);
    const optionsStrOrNull = options ? JSON.stringify(options) : null;
    const result = stmt.run(sampleHash, featureHash, featureType, dataStr, optionsStrOrNull);
    
    // If no rows were inserted (duplicate), get the existing ID
    if (result.changes === 0) {
      const existing = this.db.prepare(`
        SELECT id FROM features WHERE sample_hash = ? AND feature_hash = ?
      `).get(sampleHash, featureHash) as { id: number } | undefined;
      
      return existing ? existing.id : 0;
    }
    
    return result.lastInsertRowid as number;
  }

  getMostRecentFeature(sampleHash?: string, featureType?: string): { id: number; sample_hash: string; feature_hash: string; feature_type: string; feature_data: string; options: string | null } | undefined {
    let sql = 'SELECT id, sample_hash, feature_hash, feature_type, feature_data, options FROM features';
    const conditions: string[] = [];
    const params: any[] = [];

    if (sampleHash) {
      conditions.push('sample_hash = ?');
      params.push(sampleHash);
    }
    if (featureType) {
      conditions.push('feature_type = ?');
      params.push(featureType);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id DESC LIMIT 1';

    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as any;
  }

  createSlices(sampleHash: string, featureId: number, slicePositions: number[]): number[] {
    const stmt = this.db.prepare(`
      INSERT INTO slices (sample_hash, feature_id, slice_index, start_sample, end_sample) 
      VALUES (?, ?, ?, ?, ?)
    `);

    const sliceIds: number[] = [];
    
    for (let i = 0; i < slicePositions.length; i++) {
      const startSample = slicePositions[i];
      const endSample = i < slicePositions.length - 1 ? slicePositions[i + 1] : null;
      
      if (endSample !== null) {
        const result = stmt.run(sampleHash, featureId, i, startSample, endSample);
        sliceIds.push(result.lastInsertRowid as number);
      }
    }

    return sliceIds;
  }

  getSlicesByFeature(featureId: number): Array<{ id: number; sample_hash: string; feature_id: number; slice_index: number; start_sample: number; end_sample: number }> {
    const stmt = this.db.prepare(`
      SELECT id, sample_hash, feature_id, slice_index, start_sample, end_sample 
      FROM slices 
      WHERE feature_id = ? 
      ORDER BY slice_index ASC
    `);
    return stmt.all(featureId) as any;
  }

  getSlice(sliceId: number): { id: number; sample_hash: string; feature_id: number; slice_index: number; start_sample: number; end_sample: number } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, sample_hash, feature_id, slice_index, start_sample, end_sample 
      FROM slices 
      WHERE id = ?
    `);
    return stmt.get(sliceId) as any;
  }

  listSamples(): Array<{ id: number; hash: string; file_path: string; sample_rate: number; channels: number; duration: number; data_size: number; created_at: string }> {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        hash, 
        file_path, 
        sample_rate, 
        channels, 
        duration,
        length(audio_data) as data_size,
        created_at
      FROM samples 
      ORDER BY id DESC
    `);
    return stmt.all() as any;
  }

  listFeatures(): Array<{ id: number; sample_hash: string; feature_hash: string; feature_type: string; slice_count: number; options: string | null; created_at: string }> {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        sample_hash,
        feature_hash,
        feature_type,
        json_array_length(feature_data) as slice_count,
        options,
        created_at
      FROM features 
      ORDER BY id DESC
    `);
    return stmt.all() as any;
  }

  listSlicesSummary(): Array<{ sample_hash: string; file_path: string; feature_id: number; slice_count: number; min_slice_id: number; max_slice_id: number }> {
    const stmt = this.db.prepare(`
      SELECT 
        s.sample_hash,
        sa.file_path,
        s.feature_id,
        COUNT(*) as slice_count,
        MIN(s.id) as min_slice_id,
        MAX(s.id) as max_slice_id
      FROM slices s
      JOIN samples sa ON s.sample_hash = sa.hash
      GROUP BY s.sample_hash, s.feature_id
      ORDER BY s.sample_hash
    `);
    return stmt.all() as any;
  }
}
