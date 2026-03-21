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

export type SampleType = "raw" | "derived" | "recorded" | "freesound";

export interface SampleRecord {
  id: number;
  hash: string;
  sample_type: SampleType;
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface RawSampleMetadata {
  project_id: number;
  sample_hash: string;
  file_path: string;
}

export interface RecordedSampleMetadata {
  project_id: number;
  sample_hash: string;
  name: string;
  audio_data: Buffer;
}

export interface FreesoundSampleMetadata {
  project_id: number;
  sample_hash: string;
  url: string;
  audio_data: Buffer;
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
  sample_type: SampleType;
  display_name: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  created_at: string;
}

export interface FeatureListRecord {
  sample_hash: string;
  feature_type: string;
  display_name: string | null;
  options: string | null;
  feature_count: number;
  feature_hash: string;
}

export interface SampleFeatureLink {
  project_id: number;
  sample_hash: string;
  source_hash: string;
  feature_hash: string;
  index_order: number;
}

export interface DerivedSampleSummary {
  project_id: number;
  source_hash: string;
  source_display_name: string | null;
  feature_hash: string;
  feature_type: string;
  derived_count: number;
}

export interface ProjectRecord {
  id: number;
  name: string;
  created_at: string;
}

export interface ReplEnvRecord {
  project_id: number;
  name: string;
  kind: "json" | "function";
  value: string;
  created_at: string;
}

export interface ProjectListRecord extends ProjectRecord {
  sample_count: number;
  feature_count: number;
  command_count: number;
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

export interface InstrumentRecord {
  id: number;
  project_id: number;
  name: string;
  kind: string;
  config_json: string | null;
  created_at: string;
}

export interface InstrumentSampleRecord {
  instrument_id: number;
  sample_hash: string;
  note_number: number;
  loop: number;
  loop_start: number;
  loop_end: number;
}

export interface BackgroundErrorRecord {
  id: number;
  source: string;
  code: string;
  message: string;
  dismissed: number;
  created_at: string;
}

export class DatabaseManager {
  public db: Database.Database;
  private currentProjectId: number | null = null;
  private currentProjectName: string | null = null;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? path.join(app.getPath("userData"), "bounce.db");

    this.db = new Database(resolvedPath);
    this.initializeTables();
    const defaultProject = this.ensureDefaultProject();
    this.setCurrentProjectByName(defaultProject.name);
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
      () => this.migrate005_projects(),
      () => this.migrate006_replEnv(),
      () => this.migrate007_instruments(),
      () => this.migrate008_backgroundErrors(),
      () => this.migrate009_samplesDataModelRefactor(),
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

  private migrate005_projects(): void {
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.db.exec(`
        DROP TABLE IF EXISTS samples_features;
        DROP TABLE IF EXISTS features;
        DROP TABLE IF EXISTS command_history;
        DROP TABLE IF EXISTS samples;

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          hash TEXT NOT NULL,
          file_path TEXT,
          audio_data BLOB NOT NULL,
          sample_rate INTEGER NOT NULL,
          channels INTEGER NOT NULL,
          duration REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_project_hash
        ON samples(project_id, hash);

        CREATE INDEX idx_samples_project_file_path
        ON samples(project_id, file_path);

        CREATE TABLE features (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          feature_hash TEXT NOT NULL,
          feature_type TEXT NOT NULL,
          feature_data TEXT NOT NULL,
          options TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, sample_hash, feature_hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_features_project_sample
        ON features(project_id, sample_hash);

        CREATE INDEX idx_features_project_type
        ON features(project_id, feature_type);

        CREATE INDEX idx_features_project_hash
        ON features(project_id, feature_hash);

        CREATE TABLE command_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          command TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_command_history_project_timestamp
        ON command_history(project_id, timestamp DESC);

        CREATE TABLE samples_features (
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          feature_hash TEXT NOT NULL,
          index_order INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (project_id, sample_hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE,
          FOREIGN KEY (project_id, source_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE,
          FOREIGN KEY (project_id, source_hash, feature_hash) REFERENCES features(project_id, sample_hash, feature_hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_features_project_source
        ON samples_features(project_id, source_hash);

        CREATE INDEX idx_samples_features_project_feature
        ON samples_features(project_id, source_hash, feature_hash);
      `);
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private migrate006_replEnv(): void {
    this.db.exec(`
      CREATE TABLE repl_env (
        project_id INTEGER NOT NULL,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL CHECK(kind IN ('json', 'function')),
        value      TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, name),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_repl_env_project ON repl_env(project_id);
    `);
  }

  private migrate007_instruments(): void {
    this.db.exec(`
      CREATE TABLE instruments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        config_json TEXT,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, name),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_instruments_project ON instruments(project_id);

      CREATE TABLE instrument_samples (
        instrument_id INTEGER NOT NULL,
        sample_hash   TEXT NOT NULL,
        note_number   INTEGER NOT NULL,
        loop          INTEGER NOT NULL DEFAULT 0,
        loop_start    REAL NOT NULL DEFAULT 0.0,
        loop_end      REAL NOT NULL DEFAULT -1.0,
        PRIMARY KEY (instrument_id, sample_hash, note_number),
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_instrument_samples_instrument ON instrument_samples(instrument_id);
    `);
  }

  private migrate008_backgroundErrors(): void {
    this.db.exec(`
      CREATE TABLE background_errors (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT NOT NULL,
        code       TEXT NOT NULL,
        message    TEXT NOT NULL,
        dismissed  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_background_errors_dismissed
      ON background_errors(dismissed);
    `);
  }

  private migrate009_samplesDataModelRefactor(): void {
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.db.exec(`
        DROP TABLE IF EXISTS samples_features;
        DROP TABLE IF EXISTS features;
        DROP TABLE IF EXISTS samples;

        CREATE TABLE samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          hash TEXT NOT NULL,
          sample_type TEXT NOT NULL CHECK(sample_type IN ('raw', 'derived', 'recorded', 'freesound')),
          sample_rate INTEGER NOT NULL,
          channels INTEGER NOT NULL,
          duration REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_project_hash ON samples(project_id, hash);
        CREATE INDEX idx_samples_project_type ON samples(project_id, sample_type);

        CREATE TABLE samples_raw_metadata (
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          file_path TEXT NOT NULL,
          PRIMARY KEY (project_id, sample_hash),
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_raw_metadata_file_path
        ON samples_raw_metadata(project_id, file_path);

        CREATE TABLE samples_recorded_metadata (
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          audio_data BLOB NOT NULL,
          PRIMARY KEY (project_id, sample_hash),
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_recorded_metadata_name
        ON samples_recorded_metadata(project_id, name);

        CREATE TABLE samples_freesound_metadata (
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          url TEXT NOT NULL,
          audio_data BLOB NOT NULL,
          PRIMARY KEY (project_id, sample_hash),
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
        );

        CREATE TABLE features (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          feature_hash TEXT NOT NULL,
          feature_type TEXT NOT NULL,
          feature_data TEXT NOT NULL,
          options TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(project_id, sample_hash, feature_hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_features_project_sample ON features(project_id, sample_hash);
        CREATE INDEX idx_features_project_type ON features(project_id, feature_type);
        CREATE INDEX idx_features_project_hash ON features(project_id, feature_hash);

        CREATE TABLE samples_features (
          project_id INTEGER NOT NULL,
          sample_hash TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          feature_hash TEXT NOT NULL,
          index_order INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (project_id, sample_hash),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id, sample_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE,
          FOREIGN KEY (project_id, source_hash) REFERENCES samples(project_id, hash) ON DELETE CASCADE,
          FOREIGN KEY (project_id, source_hash, feature_hash) REFERENCES features(project_id, sample_hash, feature_hash) ON DELETE CASCADE
        );

        CREATE INDEX idx_samples_features_project_source
        ON samples_features(project_id, source_hash);

        CREATE INDEX idx_samples_features_project_feature
        ON samples_features(project_id, source_hash, feature_hash);

        DELETE FROM instrument_samples;
      `);
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private normalizeProjectName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new Error("Project name cannot be empty.");
    }
    return normalized;
  }

  private requireCurrentProjectId(): number {
    if (this.currentProjectId === null) {
      throw new Error("No current project selected.");
    }
    return this.currentProjectId;
  }

  private selectProjectSummaries(whereClause = "", ...params: unknown[]): ProjectListRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        p.id,
        p.name,
        p.created_at,
        COALESCE(sample_counts.sample_count, 0) AS sample_count,
        COALESCE(feature_counts.feature_count, 0) AS feature_count,
        COALESCE(command_counts.command_count, 0) AS command_count
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS sample_count
        FROM samples
        GROUP BY project_id
      ) sample_counts ON sample_counts.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS feature_count
        FROM features
        GROUP BY project_id
      ) feature_counts ON feature_counts.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS command_count
        FROM command_history
        GROUP BY project_id
      ) command_counts ON command_counts.project_id = p.id
      ${whereClause}
      ORDER BY p.name COLLATE NOCASE ASC
    `);

    return stmt.all(...params) as ProjectListRecord[];
  }

  private getProjectSummaryById(projectId: number): ProjectListRecord | undefined {
    const rows = this.selectProjectSummaries("WHERE p.id = ?", projectId);
    return rows[0];
  }

  private projectExists(projectId: number): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM projects WHERE id = ?")
      .get(projectId);
    return !!row;
  }

  getCurrentProjectName(): string | null {
    return this.currentProjectName;
  }

  ensureDefaultProject(): ProjectRecord {
    this.db
      .prepare("INSERT OR IGNORE INTO projects (name) VALUES (?)")
      .run("default");

    const project = this.getProjectByName("default");
    if (!project) {
      throw new Error("Failed to ensure default project.");
    }
    return project;
  }

  getProjectByName(name: string): ProjectRecord | undefined {
    const normalized = this.normalizeProjectName(name);
    return this.db
      .prepare(`
        SELECT id, name, created_at
        FROM projects
        WHERE name = ?
        LIMIT 1
      `)
      .get(normalized) as ProjectRecord | undefined;
  }

  listProjects(): ProjectListRecord[] {
    return this.selectProjectSummaries();
  }

  getCurrentProject(): ProjectListRecord {
    const projectId = this.requireCurrentProjectId();
    const project = this.getProjectSummaryById(projectId);
    if (!project) {
      throw new Error("Current project could not be loaded.");
    }
    return project;
  }

  setCurrentProjectByName(name: string): ProjectListRecord {
    const normalized = this.normalizeProjectName(name);
    const project = this.getProjectByName(normalized);
    if (!project) {
      throw new Error(`Project "${normalized}" does not exist.`);
    }

    this.currentProjectId = project.id;
    this.currentProjectName = project.name;
    return this.getCurrentProject();
  }

  loadOrCreateProject(name: string): ProjectListRecord {
    const normalized = this.normalizeProjectName(name);
    this.db
      .prepare("INSERT OR IGNORE INTO projects (name) VALUES (?)")
      .run(normalized);
    return this.setCurrentProjectByName(normalized);
  }

  removeProject(name: string): ProjectListRecord {
    const normalized = this.normalizeProjectName(name);
    const target = this.getProjectByName(normalized);
    if (!target) {
      throw new Error(`Project "${normalized}" does not exist.`);
    }

    if (this.currentProjectId === target.id) {
      throw new Error(
        `Cannot remove the current project "${normalized}". Load a different project first.`,
      );
    }

    this.db.prepare("DELETE FROM projects WHERE id = ?").run(target.id);
    return this.getCurrentProject();
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
    const projectId = this.requireCurrentProjectId();
    const lastCommand = this.db
      .prepare(
        `
       SELECT command FROM command_history 
       WHERE project_id = ?
       ORDER BY timestamp DESC 
       LIMIT 1
     `,
      )
      .get(projectId) as { command: string } | undefined;

    if (lastCommand?.command === command) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO command_history (project_id, command, timestamp) 
      VALUES (?, ?, ?)
    `);
    stmt.run(projectId, command, Date.now());
  }

  getCommandHistory(limit: number = 1000): string[] {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT command 
      FROM command_history 
      WHERE project_id = ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(projectId, limit) as { command: string }[];
    return rows.map((row) => row.command).reverse();
  }

  clearCommandHistory(): void {
    const projectId = this.requireCurrentProjectId();
    this.db
      .prepare("DELETE FROM command_history WHERE project_id = ?")
      .run(projectId);
  }

  dedupeCommandHistory(): { removed: number } {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      DELETE FROM command_history
      WHERE id IN (
        SELECT h1.id
        FROM command_history h1
        INNER JOIN command_history h2 
          ON h1.command = h2.command 
          AND h1.timestamp > h2.timestamp
          AND h1.project_id = h2.project_id
        WHERE NOT EXISTS (
          SELECT 1 FROM command_history h3
          WHERE h3.timestamp > h2.timestamp 
            AND h3.timestamp < h1.timestamp
            AND h3.project_id = h1.project_id
        )
        AND h1.project_id = ?
      )
    `);
    const result = stmt.run(projectId);
    return { removed: result.changes };
  }

  close(): void {
    this.db.close();
  }

  storeRawSample(
    hash: string,
    filePath: string,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    const projectId = this.requireCurrentProjectId();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO samples (project_id, hash, sample_type, sample_rate, channels, duration)
           VALUES (?, ?, 'raw', ?, ?, ?)
           ON CONFLICT(project_id, hash) DO UPDATE SET
             sample_rate = excluded.sample_rate,
             channels = excluded.channels,
             duration = excluded.duration`,
        )
        .run(projectId, hash, sampleRate, channels, duration);
      this.db
        .prepare(
          `INSERT INTO samples_raw_metadata (project_id, sample_hash, file_path)
           VALUES (?, ?, ?)
           ON CONFLICT(project_id, sample_hash) DO UPDATE SET
             file_path = excluded.file_path`,
        )
        .run(projectId, hash, filePath);
    })();
  }

  storeRecordedSample(
    hash: string,
    name: string,
    audioData: Buffer,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    const projectId = this.requireCurrentProjectId();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO samples (project_id, hash, sample_type, sample_rate, channels, duration)
           VALUES (?, ?, 'recorded', ?, ?, ?)
           ON CONFLICT(project_id, hash) DO UPDATE SET
             sample_rate = excluded.sample_rate,
             channels = excluded.channels,
             duration = excluded.duration`,
        )
        .run(projectId, hash, sampleRate, channels, duration);
      this.db
        .prepare(
          `INSERT INTO samples_recorded_metadata (project_id, sample_hash, name, audio_data)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, sample_hash) DO UPDATE SET
             name = excluded.name,
             audio_data = excluded.audio_data`,
        )
        .run(projectId, hash, name, audioData);
    })();
  }

  storeFreesoundSample(
    hash: string,
    url: string,
    audioData: Buffer,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    const projectId = this.requireCurrentProjectId();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO samples (project_id, hash, sample_type, sample_rate, channels, duration)
           VALUES (?, ?, 'freesound', ?, ?, ?)
           ON CONFLICT(project_id, hash) DO UPDATE SET
             sample_rate = excluded.sample_rate,
             channels = excluded.channels,
             duration = excluded.duration`,
        )
        .run(projectId, hash, sampleRate, channels, duration);
      this.db
        .prepare(
          `INSERT INTO samples_freesound_metadata (project_id, sample_hash, url, audio_data)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, sample_hash) DO UPDATE SET
             url = excluded.url,
             audio_data = excluded.audio_data`,
        )
        .run(projectId, hash, url, audioData);
    })();
  }

  getSampleByHash(hash: string): SampleRecord | undefined {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT id, hash, sample_type, sample_rate, channels, duration
      FROM samples
      WHERE project_id = ? AND hash LIKE ? || '%'
      LIMIT 1
    `);
    return stmt.get(projectId, hash) as SampleRecord | undefined;
  }

  getSampleByFilePath(filePath: string): SampleRecord | undefined {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT s.id, s.hash, s.sample_type, s.sample_rate, s.channels, s.duration
      FROM samples s
      JOIN samples_raw_metadata rm ON s.project_id = rm.project_id AND s.hash = rm.sample_hash
      WHERE s.project_id = ? AND rm.file_path = ?
      ORDER BY s.id DESC
      LIMIT 1
    `);
    return stmt.get(projectId, filePath) as SampleRecord | undefined;
  }

  getSampleByRecordingName(name: string): SampleRecord | undefined {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT s.id, s.hash, s.sample_type, s.sample_rate, s.channels, s.duration
      FROM samples s
      JOIN samples_recorded_metadata rm ON s.project_id = rm.project_id AND s.hash = rm.sample_hash
      WHERE s.project_id = ? AND rm.name = ?
      ORDER BY s.id DESC
      LIMIT 1
    `);
    return stmt.get(projectId, name) as SampleRecord | undefined;
  }

  getRawMetadata(hash: string): RawSampleMetadata | undefined {
    const projectId = this.requireCurrentProjectId();
    return this.db
      .prepare(
        `SELECT project_id, sample_hash, file_path
         FROM samples_raw_metadata
         WHERE project_id = ? AND sample_hash = ?`,
      )
      .get(projectId, hash) as RawSampleMetadata | undefined;
  }

  getRecordedMetadata(hash: string): RecordedSampleMetadata | undefined {
    const projectId = this.requireCurrentProjectId();
    return this.db
      .prepare(
        `SELECT project_id, sample_hash, name, audio_data
         FROM samples_recorded_metadata
         WHERE project_id = ? AND sample_hash = ?`,
      )
      .get(projectId, hash) as RecordedSampleMetadata | undefined;
  }

  getFreesoundMetadata(hash: string): FreesoundSampleMetadata | undefined {
    const projectId = this.requireCurrentProjectId();
    return this.db
      .prepare(
        `SELECT project_id, sample_hash, url, audio_data
         FROM samples_freesound_metadata
         WHERE project_id = ? AND sample_hash = ?`,
      )
      .get(projectId, hash) as FreesoundSampleMetadata | undefined;
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
    const projectId = this.requireCurrentProjectId();
    const featureHash = this.computeFeatureHash(featureType, featureData, options);
    const dataStr = JSON.stringify(featureData);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO features (project_id, sample_hash, feature_hash, feature_type, feature_data, options) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const optionsStrOrNull = options ? JSON.stringify(options) : null;
    const result = stmt.run(
      projectId,
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
        SELECT id FROM features WHERE project_id = ? AND sample_hash = ? AND feature_hash = ?
      `,
        )
        .get(projectId, sampleHash, featureHash) as { id: number } | undefined;

      return existing ? existing.id : 0;
    }

    return result.lastInsertRowid as number;
  }

  getMostRecentFeature(
    sampleHash?: string,
    featureType?: string,
  ): FeatureRecord | undefined {
    const projectId = this.requireCurrentProjectId();
    let sql =
      "SELECT id, sample_hash, feature_hash, feature_type, feature_data, options FROM features";
    const conditions: string[] = ["project_id = ?"];
    const params: string[] = [String(projectId)];

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
    sampleRate: number,
    channels: number,
    duration: number,
  ): string {
    const projectId = this.requireCurrentProjectId();
    const hashInput = `${sourceHash}:${featureHash}:${index}`;
    const hash = crypto
      .createHash("sha256")
      .update(hashInput)
      .digest("hex");

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO samples (project_id, hash, sample_type, sample_rate, channels, duration)
           VALUES (?, ?, 'derived', ?, ?, ?)`,
        )
        .run(projectId, hash, sampleRate, channels, duration);

      this.db
        .prepare(
          `INSERT OR REPLACE INTO samples_features (project_id, sample_hash, source_hash, feature_hash, index_order)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(projectId, hash, sourceHash, featureHash, index);
    })();

    return hash;
  }

  createSliceSamples(
    sourceHash: string,
    featureHash: string,
    _sourceAudio: Float32Array,
  ): { hash: string; index: number }[] {
    const projectId = this.requireCurrentProjectId();
    const sample = this.getSampleByHash(sourceHash);
    if (!sample) {
      throw new Error(`Source sample not found: ${sourceHash}`);
    }

    const feature = this.db
        .prepare(
          `SELECT feature_data, feature_hash
           FROM features
           WHERE project_id = ? AND sample_hash = ? AND feature_hash LIKE ?`,
        )
        .get(projectId, sample.hash, `${featureHash}%`) as
      | { feature_data: string; feature_hash: string }
      | undefined;

    if (!feature) {
      throw new Error(`Feature not found: ${featureHash}`);
    }

    const positions = JSON.parse(feature.feature_data) as number[];

    const results: { hash: string; index: number }[] = [];

    for (let i = 0; i < positions.length - 1; i++) {
      const start = positions[i];
      const end = positions[i + 1];
      const sliceLength = end - start;
      const duration = sliceLength / sample.sample_rate;
      const hash = this.createDerivedSample(
        sample.hash,
        feature.feature_hash,
        i,
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
    sourceAudio: Float32Array,
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
    const totalFrames = sourceAudio.length;
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

    // Convert dBFS silence threshold to linear RMS
    const silenceThresholdLinear =
      silenceThresholdDb === -Infinity
        ? 0
        : Math.pow(10, silenceThresholdDb / 20);

    const grainDuration = grainSizeSamples / sampleRate;
    const grainHashes: Array<string | null> = [];

    for (let i = 0; i < grainStartPositions.length; i++) {
      const start = grainStartPositions[i];
      const grainAudio = sourceAudio.slice(start, start + grainSizeSamples);

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

      const hash = this.createDerivedSample(
        sample.hash,
        featureHash,
        i,
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
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT project_id, sample_hash, source_hash, feature_hash, index_order
      FROM samples_features
      WHERE project_id = ? AND source_hash = ? AND feature_hash LIKE ?
      ORDER BY index_order ASC
    `);
    return stmt.all(projectId, sourceHash, `${featureHash}%`) as SampleFeatureLink[];
  }

  getDerivedSampleLink(sampleHash: string): SampleFeatureLink | undefined {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT project_id, sample_hash, source_hash, feature_hash, index_order
      FROM samples_features
      WHERE project_id = ? AND sample_hash = ?
    `);
    return stmt.get(projectId, sampleHash) as SampleFeatureLink | undefined;
  }

  getDerivedSampleByIndex(
    sourceHash: string,
    featureHash: string,
    index: number,
  ): SampleRecord | undefined {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT s.id, s.hash, s.sample_type, s.sample_rate, s.channels, s.duration
      FROM samples s
      JOIN samples_features sf ON s.project_id = sf.project_id AND s.hash = sf.sample_hash
      WHERE sf.project_id = ? AND sf.source_hash = ? AND sf.feature_hash LIKE ? AND sf.index_order = ?
    `);
    return stmt.get(projectId, sourceHash, `${featureHash}%`, index) as
      | SampleRecord
      | undefined;
  }

  listDerivedSamplesSummary(): DerivedSampleSummary[] {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT
        sf.project_id,
        sf.source_hash,
        COALESCE(rm.file_path, rec.name) as source_display_name,
        sf.feature_hash,
        f.feature_type,
        COUNT(*) as derived_count
      FROM samples_features sf
      JOIN samples s ON sf.project_id = s.project_id AND sf.source_hash = s.hash
      JOIN features f
        ON sf.project_id = f.project_id
       AND sf.source_hash = f.sample_hash
       AND sf.feature_hash = f.feature_hash
      LEFT JOIN samples_raw_metadata rm ON s.project_id = rm.project_id AND s.hash = rm.sample_hash
      LEFT JOIN samples_recorded_metadata rec ON s.project_id = rec.project_id AND s.hash = rec.sample_hash
      WHERE sf.project_id = ?
      GROUP BY sf.project_id, sf.source_hash, sf.feature_hash
      ORDER BY sf.source_hash
    `);
    return stmt.all(projectId) as DerivedSampleSummary[];
  }

  listSamples(): SampleListRecord[] {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT
        s.id,
        s.hash,
        s.sample_type,
        COALESCE(rm.file_path, rec.name, fm.url) as display_name,
        s.sample_rate,
        s.channels,
        s.duration,
        s.created_at
      FROM samples s
      LEFT JOIN samples_raw_metadata rm ON s.project_id = rm.project_id AND s.hash = rm.sample_hash
      LEFT JOIN samples_recorded_metadata rec ON s.project_id = rec.project_id AND s.hash = rec.sample_hash
      LEFT JOIN samples_freesound_metadata fm ON s.project_id = fm.project_id AND s.hash = fm.sample_hash
      WHERE s.project_id = ? AND s.sample_type != 'derived'
      ORDER BY s.id DESC
    `);
    return stmt.all(projectId) as SampleListRecord[];
  }

  listFeatures(): FeatureListRecord[] {
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
      SELECT
        f.sample_hash,
        f.feature_type,
        COALESCE(rm.file_path, rec.name, fm.url) as display_name,
        f.options,
        COUNT(*) as feature_count,
        MAX(f.feature_hash) as feature_hash
      FROM features f
      JOIN samples s ON f.project_id = s.project_id AND f.sample_hash = s.hash
      LEFT JOIN samples_raw_metadata rm ON s.project_id = rm.project_id AND s.hash = rm.sample_hash
      LEFT JOIN samples_recorded_metadata rec ON s.project_id = rec.project_id AND s.hash = rec.sample_hash
      LEFT JOIN samples_freesound_metadata fm ON s.project_id = fm.project_id AND s.hash = fm.sample_hash
      WHERE f.project_id = ?
      GROUP BY f.sample_hash, f.feature_type, display_name, f.options
      ORDER BY MAX(f.id) DESC
    `);
    return stmt.all(projectId) as FeatureListRecord[];
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
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
SELECT feature_type, feature_data, feature_hash, options
FROM features
WHERE project_id = ? AND sample_hash = ? AND feature_type = ?
ORDER BY created_at DESC
LIMIT 1
`);
    return stmt.get(projectId, sampleHash, featureType) as
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
    const projectId = this.requireCurrentProjectId();
    const stmt = this.db.prepare(`
SELECT feature_type, feature_data, feature_hash, options
FROM features
WHERE project_id = ? AND sample_hash = ? AND feature_hash LIKE ?
LIMIT 1
`);
    return stmt.get(projectId, sampleHash, `${featureHashPrefix}%`) as
      | {
          feature_type: string;
          feature_data: string;
          feature_hash: string;
          options: string;
        }
      | undefined;
  }

  saveReplEnv(entries: Array<{ name: string; kind: "json" | "function"; value: string }>): void {
    const projectId = this.requireCurrentProjectId();
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM repl_env WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare(
        "INSERT INTO repl_env (project_id, name, kind, value) VALUES (?, ?, ?, ?)",
      );
      for (const entry of entries) {
        insert.run(projectId, entry.name, entry.kind, entry.value);
      }
    })();
  }

  getReplEnv(): ReplEnvRecord[] {
    const projectId = this.requireCurrentProjectId();
    return this.db
      .prepare("SELECT * FROM repl_env WHERE project_id = ? ORDER BY name ASC")
      .all(projectId) as ReplEnvRecord[];
  }

  // ---- Instrument CRUD ----

  createInstrument(name: string, kind: string, config?: Record<string, unknown>): InstrumentRecord {
    const projectId = this.requireCurrentProjectId();
    const configJson = config ? JSON.stringify(config) : null;
    const stmt = this.db.prepare(
      "INSERT INTO instruments (project_id, name, kind, config_json) VALUES (?, ?, ?, ?)",
    );
    const result = stmt.run(projectId, name, kind, configJson);
    return this.db.prepare("SELECT * FROM instruments WHERE id = ?")
      .get(result.lastInsertRowid) as InstrumentRecord;
  }

  getInstrument(name: string): InstrumentRecord | null {
    const projectId = this.requireCurrentProjectId();
    return (this.db
      .prepare("SELECT * FROM instruments WHERE project_id = ? AND name = ?")
      .get(projectId, name) ?? null) as InstrumentRecord | null;
  }

  getInstrumentById(id: number): InstrumentRecord | null {
    return (this.db.prepare("SELECT * FROM instruments WHERE id = ?")
      .get(id) ?? null) as InstrumentRecord | null;
  }

  listInstruments(): InstrumentRecord[] {
    const projectId = this.requireCurrentProjectId();
    return this.db
      .prepare("SELECT * FROM instruments WHERE project_id = ? ORDER BY name ASC")
      .all(projectId) as InstrumentRecord[];
  }

  deleteInstrument(name: string): boolean {
    const projectId = this.requireCurrentProjectId();
    const result = this.db
      .prepare("DELETE FROM instruments WHERE project_id = ? AND name = ?")
      .run(projectId, name);
    return result.changes > 0;
  }

  addInstrumentSample(instrumentId: number, sampleHash: string, noteNumber: number, loop: boolean = false, loopStart: number = 0, loopEnd: number = -1): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO instrument_samples (instrument_id, sample_hash, note_number, loop, loop_start, loop_end) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(instrumentId, sampleHash, noteNumber, loop ? 1 : 0, loopStart, loopEnd);
  }

  getInstrumentSamples(instrumentId: number): InstrumentSampleRecord[] {
    return this.db
      .prepare("SELECT * FROM instrument_samples WHERE instrument_id = ? ORDER BY note_number ASC")
      .all(instrumentId) as InstrumentSampleRecord[];
  }

  removeInstrumentSample(instrumentId: number, sampleHash: string, noteNumber: number): boolean {
    const result = this.db
      .prepare("DELETE FROM instrument_samples WHERE instrument_id = ? AND sample_hash = ? AND note_number = ?")
      .run(instrumentId, sampleHash, noteNumber);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Background errors
  // ---------------------------------------------------------------------------

  addBackgroundError(source: string, code: string, message: string): number {
    const result = this.db
      .prepare("INSERT INTO background_errors (source, code, message) VALUES (?, ?, ?)")
      .run(source, code, message);
    return Number(result.lastInsertRowid);
  }

  getActiveBackgroundErrors(): BackgroundErrorRecord[] {
    return this.db
      .prepare("SELECT * FROM background_errors WHERE dismissed = 0 ORDER BY created_at DESC")
      .all() as BackgroundErrorRecord[];
  }

  dismissBackgroundError(id: number): boolean {
    const result = this.db
      .prepare("UPDATE background_errors SET dismissed = 1 WHERE id = ? AND dismissed = 0")
      .run(id);
    return result.changes > 0;
  }

  dismissAllBackgroundErrors(): number {
    const result = this.db
      .prepare("UPDATE background_errors SET dismissed = 1 WHERE dismissed = 0")
      .run();
    return result.changes;
  }
}
