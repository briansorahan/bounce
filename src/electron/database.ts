import Database from "better-sqlite3";
import { app } from "electron";
import * as path from "path";
import * as crypto from "crypto";

export interface DebugLogEntry {
  id: number;
  level: string;
  message: string;
  data: string | null;
  timestamp: number;
  created_at: string;
}

export interface SampleRecord {
  id: number;
  hash: string;
  file_path: string | null;
  audio_data: Buffer;
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface FeatureRecord {
  id: number;
  sample_hash: string;
  feature_hash: string;
  feature_type: string;
  feature_data: string;
  options: string | null;
}

export interface SampleListRecord {
  id: number;
  hash: string;
  file_path: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  data_size: number;
  created_at: string;
}

export interface FeatureListRecord {
  sample_hash: string;
  feature_type: string;
  file_path: string;
  options: string | null;
  feature_count: number;
  feature_hash: string;
}

export interface SampleFeatureLink {
  sample_hash: string;
  source_hash: string;
  feature_hash: string;
  index_order: number;
}

export interface DerivedSampleSummary {
  source_hash: string;
  source_file_path: string | null;
  feature_hash: string;
  feature_type: string;
  derived_count: number;
}

export interface FeatureOptions {
  threshold?: number;
  [key: string]: unknown;
}

export interface GranularizeOptions {
  grainSize?: number;
  hopSize?: number;
  jitter?: number;
  startTime?: number;
  endTime?: number;
  normalize?: boolean;
  silenceThreshold?: number;
}

export class DatabaseManager {
  public db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? path.join(app.getPath("userData"), "bounce.db");

    this.db = new Database(resolvedPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrations: Array<() => void> = [
      () => this.migrate001_baseTables(),
      () => this.migrate002_sampleFilePathNullable(),
      () => this.migrate003_samplesFeatures(),
      () => this.migrate004_repairFeaturesFK(),
    ];

    for (let version = 1; version <= migrations.length; version++) {
      const applied = this.db
        .prepare("SELECT 1 FROM schema_versions WHERE version = ?")
        .get(version);
      if (!applied) {
        migrations[version - 1]();
        this.db
          .prepare("INSERT INTO schema_versions (version) VALUES (?)")
          .run(version);
      }
    }
  }

  private migrate001_baseTables(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS slices;
      DROP TABLE IF EXISTS components;

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

      CREATE INDEX IF NOT EXISTS idx_features_sample ON features(sample_hash);
      CREATE INDEX IF NOT EXISTS idx_features_type ON features(feature_type);
      CREATE INDEX IF NOT EXISTS idx_features_hash ON features(feature_hash);
    `);
  }

  private migrate002_sampleFilePathNullable(): void {
    // All DDL in this migration runs with FK enforcement off.
    // SQLite's ALTER TABLE RENAME silently rewrites FK references in dependent
    // tables (since 3.37.0), which means after any rename the features table
    // may have a stale FK pointing to the old table name. We detect and fix
    // that at the end of this migration using PRAGMA foreign_key_list.
    this.db.exec("PRAGMA foreign_keys = OFF;");

    try {
      const samplesExists = !!this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='samples'",
        )
        .get();

      const samplesOldExists = !!this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='samples_old'",
        )
        .get();

      if (!samplesExists && !samplesOldExists) {
        // Fresh install: create samples with nullable file_path from scratch.
        this.db.exec(`
          CREATE TABLE samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            file_path TEXT,
            audio_data BLOB NOT NULL,
            sample_rate INTEGER NOT NULL,
            channels INTEGER NOT NULL,
            duration REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } else if (!samplesExists && samplesOldExists) {
        // Crashed after rename but before CREATE TABLE samples: restore from samples_old.
        this.db.exec(`
          CREATE TABLE samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            file_path TEXT,
            audio_data BLOB NOT NULL,
            sample_rate INTEGER NOT NULL,
            channels INTEGER NOT NULL,
            duration REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO samples
            SELECT id, hash, file_path, audio_data, sample_rate, channels, duration, created_at
            FROM samples_old;
          DROP TABLE samples_old;
        `);
      } else if (samplesExists) {
        const cols = this.db
          .prepare("PRAGMA table_info(samples)")
          .all() as Array<{ name: string; notnull: number }>;
        const filePathCol = cols.find((c) => c.name === "file_path");

        if (filePathCol && filePathCol.notnull === 1) {
          // samples.file_path is still NOT NULL — run the rename/recreate/drop.
          // Drop any pre-existing samples_old first so the rename can proceed.
          if (samplesOldExists) {
            this.db.exec("DROP TABLE samples_old;");
          }
          this.db.exec(`
            ALTER TABLE samples RENAME TO samples_old;
            CREATE TABLE samples (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              hash TEXT NOT NULL UNIQUE,
              file_path TEXT,
              audio_data BLOB NOT NULL,
              sample_rate INTEGER NOT NULL,
              channels INTEGER NOT NULL,
              duration REAL NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO samples
              SELECT id, hash, file_path, audio_data, sample_rate, channels, duration, created_at
              FROM samples_old;
            DROP TABLE samples_old;
          `);
        } else if (samplesOldExists) {
          // samples.file_path is already nullable but samples_old is still
          // around (DROP TABLE failed in a previous run). Clean it up.
          this.db.exec("DROP TABLE samples_old;");
        }
      }

      // After any rename operation SQLite may have rewritten the features FK to
      // point to a now-dropped table. Detect and repair it.
      const featuresFKs = this.db
        .prepare("PRAGMA foreign_key_list(features)")
        .all() as Array<{ table: string; from: string }>;
      const hasStaleFK = featuresFKs.some(
        (fk) => fk.from === "sample_hash" && fk.table !== "samples",
      );

      if (hasStaleFK) {
        this.db.exec(`
          ALTER TABLE features RENAME TO features_old;
          CREATE TABLE features (
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
          INSERT INTO features
            SELECT id, sample_hash, feature_hash, feature_type, feature_data, options, created_at
            FROM features_old;
          DROP TABLE features_old;
        `);
      }
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private migrate003_samplesFeatures(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_samples_hash ON samples(hash);
      CREATE INDEX IF NOT EXISTS idx_samples_file_path ON samples(file_path);

      CREATE TABLE IF NOT EXISTS samples_features (
        sample_hash TEXT NOT NULL PRIMARY KEY,
        source_hash TEXT NOT NULL,
        feature_hash TEXT NOT NULL,
        index_order INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sample_hash) REFERENCES samples(hash),
        FOREIGN KEY (source_hash) REFERENCES samples(hash)
      );

      CREATE INDEX IF NOT EXISTS idx_samples_features_source
      ON samples_features(source_hash);

      CREATE INDEX IF NOT EXISTS idx_samples_features_feature
      ON samples_features(source_hash, feature_hash);
    `);
  }

  private migrate004_repairFeaturesFK(): void {
    // Repair features FK if it still points to samples_old (from a failed
    // or pre-SQLite-3.26 migrate002 run).
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      const featuresFKs = this.db
        .prepare("PRAGMA foreign_key_list(features)")
        .all() as Array<{ table: string; from: string }>;
      const hasStaleFK = featuresFKs.some(
        (fk) => fk.from === "sample_hash" && fk.table !== "samples",
      );
      if (hasStaleFK) {
        this.db.exec(`
          ALTER TABLE features RENAME TO features_old;
          CREATE TABLE features (
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
          INSERT INTO features
            SELECT id, sample_hash, feature_hash, feature_type, feature_data, options, created_at
            FROM features_old;
          DROP TABLE features_old;
        `);
      }
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  addDebugLog(
    level: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO debug_logs (level, message, data, timestamp) 
      VALUES (?, ?, ?, ?)
    `);
    const dataStr = data !== undefined ? JSON.stringify(data) : null;
    stmt.run(level, message, dataStr, Date.now());
  }

  getDebugLogs(limit: number = 100): DebugLogEntry[] {
    const stmt = this.db.prepare(`
      SELECT level, message, data, timestamp, created_at 
      FROM debug_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    return stmt.all(limit) as DebugLogEntry[];
  }

  clearDebugLogs(): void {
    this.db.prepare("DELETE FROM debug_logs").run();
  }

  addCommand(command: string): void {
    const lastCommand = this.db
      .prepare(
        `
      SELECT command FROM command_history 
      ORDER BY timestamp DESC 
      LIMIT 1
    `,
      )
      .get() as { command: string } | undefined;

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
    return rows.map((row) => row.command).reverse();
  }

  clearCommandHistory(): void {
    this.db.prepare("DELETE FROM command_history").run();
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

  storeSample(
    hash: string,
    filePath: string,
    audioData: Buffer,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO samples (hash, file_path, audio_data, sample_rate, channels, duration) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(hash, filePath, audioData, sampleRate, channels, duration);
  }

  getSampleByHash(hash: string): SampleRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration 
      FROM samples 
      WHERE hash LIKE ? || '%'
      LIMIT 1
    `);
    return stmt.get(hash) as SampleRecord | undefined;
  }

  getSampleByPath(filePath: string): SampleRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration 
      FROM samples 
      WHERE file_path = ? 
      ORDER BY id DESC 
      LIMIT 1
    `);
    return stmt.get(filePath) as SampleRecord | undefined;
  }

  private computeFeatureHash(
    featureType: string,
    featureData: number[],
    options?: FeatureOptions,
  ): string {
    const dataStr = JSON.stringify(featureData);
    const optionsStr = options ? JSON.stringify(options) : "";
    const featureContent = `${featureType}:${dataStr}:${optionsStr}`;
    return crypto.createHash("sha256").update(featureContent).digest("hex");
  }

  storeFeature(
    sampleHash: string,
    featureType: string,
    featureData: number[],
    options?: FeatureOptions,
  ): number {
    const featureHash = this.computeFeatureHash(featureType, featureData, options);
    const dataStr = JSON.stringify(featureData);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO features (sample_hash, feature_hash, feature_type, feature_data, options) 
      VALUES (?, ?, ?, ?, ?)
    `);
    const optionsStrOrNull = options ? JSON.stringify(options) : null;
    const result = stmt.run(
      sampleHash,
      featureHash,
      featureType,
      dataStr,
      optionsStrOrNull,
    );

    // If no rows were inserted (duplicate), get the existing ID
    if (result.changes === 0) {
      const existing = this.db
        .prepare(
          `
        SELECT id FROM features WHERE sample_hash = ? AND feature_hash = ?
      `,
        )
        .get(sampleHash, featureHash) as { id: number } | undefined;

      return existing ? existing.id : 0;
    }

    return result.lastInsertRowid as number;
  }

  getMostRecentFeature(
    sampleHash?: string,
    featureType?: string,
  ): FeatureRecord | undefined {
    let sql =
      "SELECT id, sample_hash, feature_hash, feature_type, feature_data, options FROM features";
    const conditions: string[] = [];
    const params: string[] = [];

    if (sampleHash) {
      conditions.push("sample_hash = ?");
      params.push(sampleHash);
    }
    if (featureType) {
      conditions.push("feature_type = ?");
      params.push(featureType);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY id DESC LIMIT 1";

    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as FeatureRecord | undefined;
  }

  createDerivedSample(
    sourceHash: string,
    featureHash: string,
    index: number,
    audioData: Buffer,
    sampleRate: number,
    channels: number,
    duration: number,
  ): string {
    // Hash includes provenance to ensure uniqueness per derivation
    const hashInput = `${sourceHash}:${featureHash}:${index}:`;
    const hash = crypto
      .createHash("sha256")
      .update(hashInput)
      .update(audioData)
      .digest("hex");

    this.db
      .prepare(
        `INSERT OR IGNORE INTO samples (hash, file_path, audio_data, sample_rate, channels, duration)
         VALUES (?, NULL, ?, ?, ?, ?)`,
      )
      .run(hash, audioData, sampleRate, channels, duration);

    this.db
      .prepare(
        `INSERT OR REPLACE INTO samples_features (sample_hash, source_hash, feature_hash, index_order)
         VALUES (?, ?, ?, ?)`,
      )
      .run(hash, sourceHash, featureHash, index);

    return hash;
  }

  createSliceSamples(
    sourceHash: string,
    featureHash: string,
  ): { hash: string; index: number }[] {
    const sample = this.getSampleByHash(sourceHash);
    if (!sample) {
      throw new Error(`Source sample not found: ${sourceHash}`);
    }

    const feature = this.db
      .prepare(
        "SELECT feature_data, feature_hash FROM features WHERE sample_hash = ? AND feature_hash LIKE ?",
      )
      .get(sample.hash, `${featureHash}%`) as
      | { feature_data: string; feature_hash: string }
      | undefined;

    if (!feature) {
      throw new Error(`Feature not found: ${featureHash}`);
    }

    const positions = JSON.parse(feature.feature_data) as number[];
    const audioData = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );

    const results: { hash: string; index: number }[] = [];

    for (let i = 0; i < positions.length - 1; i++) {
      const start = positions[i];
      const end = positions[i + 1];
      const sliceAudio = audioData.slice(start, end);
      const sliceBuffer = Buffer.from(
        sliceAudio.buffer,
        sliceAudio.byteOffset,
        sliceAudio.byteLength,
      );
      const duration = sliceAudio.length / sample.sample_rate;
      const hash = this.createDerivedSample(
        sample.hash,
        feature.feature_hash,
        i,
        sliceBuffer,
        sample.sample_rate,
        sample.channels,
        duration,
      );
      results.push({ hash, index: i });
    }

    return results;
  }

  granularize(
    sourceHash: string,
    options: GranularizeOptions,
  ): { grainHashes: Array<string | null>; featureHash: string; sampleRate: number; grainDuration: number } {
    const sample = this.getSampleByHash(sourceHash);
    if (!sample) {
      throw new Error(`Sample not found: ${sourceHash}`);
    }

    const MAX_DURATION = 20;
    if (sample.duration > MAX_DURATION) {
      throw new Error(
        `Sample duration ${sample.duration.toFixed(2)}s exceeds the ${MAX_DURATION}s limit for granularize`,
      );
    }

    const grainSizeMs = options.grainSize ?? 20;
    const hopSizeMs = options.hopSize ?? grainSizeMs;
    const startTimeMs = options.startTime ?? 0;
    const endTimeMs = options.endTime ?? sample.duration * 1000;
    const jitter = options.jitter ?? 0;
    const silenceThresholdDb = options.silenceThreshold ?? -60;

    const { sample_rate: sampleRate, channels } = sample;

    const grainSizeSamples = Math.round((grainSizeMs * sampleRate) / 1000);
    const hopSizeSamples = Math.round((hopSizeMs * sampleRate) / 1000);
    const startSample = Math.round((startTimeMs * sampleRate) / 1000);
    const totalFrames =
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT;
    const endSample = Math.min(
      Math.round((endTimeMs * sampleRate) / 1000),
      totalFrames,
    );

    // Compute grain start positions (in samples/frames)
    const grainStartPositions: number[] = [];
    let pos = startSample;
    while (pos + grainSizeSamples <= endSample) {
      if (jitter > 0) {
        const maxOffset = Math.round(jitter * hopSizeSamples);
        const offset = Math.round((Math.random() * 2 - 1) * maxOffset);
        const jitteredPos = Math.max(
          startSample,
          Math.min(endSample - grainSizeSamples, pos + offset),
        );
        grainStartPositions.push(jitteredPos);
      } else {
        grainStartPositions.push(pos);
      }
      pos += hopSizeSamples;
    }

    // Store grain start positions as the feature, preserving all options for reproducibility
    this.storeFeature(
      sample.hash,
      "granularize",
      grainStartPositions,
      options as FeatureOptions,
    );
    const featureHash = this.computeFeatureHash(
      "granularize",
      grainStartPositions,
      options as FeatureOptions,
    );

    const audioData = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      totalFrames,
    );

    // Convert dBFS silence threshold to linear RMS
    const silenceThresholdLinear =
      silenceThresholdDb === -Infinity
        ? 0
        : Math.pow(10, silenceThresholdDb / 20);

    const grainDuration = grainSizeSamples / sampleRate;
    const grainHashes: Array<string | null> = [];

    for (let i = 0; i < grainStartPositions.length; i++) {
      const start = grainStartPositions[i];
      const grainAudio = audioData.slice(start, start + grainSizeSamples);

      // Compute RMS and skip silent grains
      let sumSq = 0;
      for (let j = 0; j < grainAudio.length; j++) {
        sumSq += grainAudio[j] * grainAudio[j];
      }
      const rms = Math.sqrt(sumSq / grainAudio.length);
      if (rms < silenceThresholdLinear) {
        grainHashes.push(null);
        continue;
      }

      const grainBuffer = Buffer.from(
        grainAudio.buffer,
        grainAudio.byteOffset,
        grainAudio.byteLength,
      );
      const hash = this.createDerivedSample(
        sample.hash,
        featureHash,
        i,
        grainBuffer,
        sampleRate,
        channels,
        grainDuration,
      );
      grainHashes.push(hash);
    }

    return { grainHashes, featureHash, sampleRate, grainDuration };
  }

  getDerivedSamples(
    sourceHash: string,
    featureHash: string,
  ): SampleFeatureLink[] {
    const stmt = this.db.prepare(`
      SELECT sample_hash, source_hash, feature_hash, index_order
      FROM samples_features
      WHERE source_hash = ? AND feature_hash LIKE ?
      ORDER BY index_order ASC
    `);
    return stmt.all(sourceHash, `${featureHash}%`) as SampleFeatureLink[];
  }

  getDerivedSampleByIndex(
    sourceHash: string,
    featureHash: string,
    index: number,
  ): SampleRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT s.id, s.hash, s.file_path, s.audio_data, s.sample_rate, s.channels, s.duration
      FROM samples s
      JOIN samples_features sf ON s.hash = sf.sample_hash
      WHERE sf.source_hash = ? AND sf.feature_hash LIKE ? AND sf.index_order = ?
    `);
    return stmt.get(sourceHash, `${featureHash}%`, index) as
      | SampleRecord
      | undefined;
  }

  listDerivedSamplesSummary(): DerivedSampleSummary[] {
    const stmt = this.db.prepare(`
      SELECT
        sf.source_hash,
        s.file_path as source_file_path,
        sf.feature_hash,
        f.feature_type,
        COUNT(*) as derived_count
      FROM samples_features sf
      JOIN samples s ON sf.source_hash = s.hash
      JOIN features f ON sf.source_hash = f.sample_hash AND sf.feature_hash = f.feature_hash
      GROUP BY sf.source_hash, sf.feature_hash
      ORDER BY sf.source_hash
    `);
    return stmt.all() as DerivedSampleSummary[];
  }

  listSamples(): SampleListRecord[] {
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
      WHERE file_path IS NOT NULL
      ORDER BY id DESC
    `);
    return stmt.all() as SampleListRecord[];
  }

  listFeatures(): FeatureListRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        f.sample_hash,
        f.feature_type,
        s.file_path,
        f.options,
        COUNT(*) as feature_count
      FROM features f
      JOIN samples s ON f.sample_hash = s.hash
      GROUP BY f.sample_hash, f.feature_type, f.options
      ORDER BY MAX(f.id) DESC
    `);
    return stmt.all() as FeatureListRecord[];
  }

  getFeature(
    sampleHash: string,
    featureType: string,
  ):
    | {
        feature_type: string;
        feature_data: string;
        feature_hash: string;
        options: string;
      }
    | undefined {
    const stmt = this.db.prepare(`
SELECT feature_type, feature_data, feature_hash, options
FROM features
WHERE sample_hash = ? AND feature_type = ?
ORDER BY created_at DESC
LIMIT 1
`);
    return stmt.get(sampleHash, featureType) as
      | {
          feature_type: string;
          feature_data: string;
          feature_hash: string;
          options: string;
        }
      | undefined;
  }

  getFeatureByHash(
    sampleHash: string,
    featureHashPrefix: string,
  ):
    | {
        feature_type: string;
        feature_data: string;
        feature_hash: string;
        options: string;
      }
    | undefined {
    const stmt = this.db.prepare(`
SELECT feature_type, feature_data, feature_hash, options
FROM features
WHERE sample_hash = ? AND feature_hash LIKE ?
LIMIT 1
`);
    return stmt.get(sampleHash, `${featureHashPrefix}%`) as
      | {
          feature_type: string;
          feature_data: string;
          feature_hash: string;
          options: string;
        }
      | undefined;
  }
}
