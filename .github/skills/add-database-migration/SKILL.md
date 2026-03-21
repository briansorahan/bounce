---
name: add-database-migration
description: Guide for adding a new versioned SQLite migration to the Bounce database. Use whenever the database schema needs to change (add/remove tables, change column constraints, add indexes). Covers the migration runner pattern, SQLite FK pitfalls, partial migration recovery, and how to test.
license: ISC
metadata:
  author: briansorahan
  version: "1.0"
  created: "2026-02-27"
---

# Skill: Add Database Migration

## Purpose

Bounce uses a versioned migration system in `src/electron/database.ts`. Every schema change is a numbered migration method that runs exactly once per database. This skill covers how to add a new migration correctly, avoid SQLite pitfalls, and verify the result.

## When to Use

- Adding or dropping a table
- Adding or dropping a column
- Changing a column's constraints (e.g. `NOT NULL` → nullable)
- Adding or removing indexes
- Any other schema change to `bounce.db`

## Key Files

- `src/electron/database.ts` — migration runner + all migration methods
- `~/Library/Application Support/bounce/bounce.db` — macOS live database

---

## How the Migration System Works

### `schema_versions` table

Created on first startup. Tracks which migrations have been applied:

```sql
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Migration runner (in `initializeTables()`)

```typescript
const migrations: Array<() => void> = [
  () => this.migrate001_initialSchema(),
  // add new migrations here
];

for (let version = 1; version <= migrations.length; version++) {
  const applied = this.db
    .prepare("SELECT 1 FROM schema_versions WHERE version = ?")
    .get(version);
  if (!applied) {
    migrations[version - 1]();
    this.db.prepare("INSERT INTO schema_versions (version) VALUES (?)").run(version);
  }
}
```

Each migration runs **once** and is then recorded. On subsequent startups all migrations are skipped.

---

## Step-by-Step: Adding a New Migration

### Step 1: Write the migration method

Add a new private method to `DatabaseManager`. Name it `migrate00N_shortDescription`:

```typescript
private migrate002_addMyNewTable(): void {
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS my_new_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
```

### Step 2: Register it in the migration runner

Append to the `migrations` array in `initializeTables()`:

```typescript
const migrations: Array<() => void> = [
  () => this.migrate001_initialSchema(),
  () => this.migrate002_addMyNewTable(), // ← add here
];
```

The version number is derived from the array index (1-based), so order is the version.

### Step 3: Build and test

```bash
npm run build:electron
npm run start:electron
```

Verify via sqlite3:

```bash
sqlite3 ~/Library/Application\ Support/bounce/bounce.db \
  "SELECT * FROM schema_versions ORDER BY version;"
```

---

## Critical: SQLite Silently Rewrites FK References on Rename

### The Hidden Problem

SQLite 3.37.0+ **silently rewrites FK definitions in dependent tables** when you rename a table — even with `PRAGMA foreign_keys = OFF`. This is a DDL-level behavior, not a runtime enforcement behavior, so the pragma doesn't prevent it.

Example: if `features` has `FOREIGN KEY (sample_hash) REFERENCES samples(hash)` and you run `ALTER TABLE samples RENAME TO samples_old`, SQLite rewrites `features` to have `FOREIGN KEY (sample_hash) REFERENCES samples_old(hash)`. After you `DROP TABLE samples_old`, `features` now has a **broken FK pointing to a non-existent table**.

This causes failures like:
```
Error: Failed to store feature: no such table: main.samples_old
```

### The Fix: Detect and Repair Stale FKs After Any Rename

After any rename/recreate/drop migration, use `PRAGMA foreign_key_list` to detect whether dependent tables have stale FK references, and recreate them if so:

```typescript
const fks = this.db
  .prepare("PRAGMA foreign_key_list(features)")
  .all() as Array<{ table: string; from: string }>;
const hasStaleFK = fks.some(
  (fk) => fk.from === "sample_hash" && fk.table !== "samples",
);

if (hasStaleFK) {
  this.db.exec(`
    ALTER TABLE features RENAME TO features_old;
    CREATE TABLE features (
      -- correct schema with FK to samples
      FOREIGN KEY (sample_hash) REFERENCES samples(hash)
    );
    INSERT INTO features SELECT ... FROM features_old;
    DROP TABLE features_old;
  `);
}
```

**Rule:** Any migration that renames a table must check all dependent tables for stale FK references and repair them.

## Critical: SQLite FK Pitfall

### The Problem

SQLite's `ALTER TABLE ... RENAME TO` on newer versions **rewrites FK references** in dependent tables to point to the renamed table. If you then try to `DROP TABLE the_old_table`, it fails with:

```
SqliteError: FOREIGN KEY constraint failed
```

This is the exact bug that caused the original `file_path` nullable migration to crash.

### The Fix: Always wrap rename/drop DDL in FK pragma

Any migration that renames or drops a table **referenced by a foreign key** must disable FK enforcement for the duration:

```typescript
private migrate00N_example(): void {
  this.db.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE samples RENAME TO samples_old;
    CREATE TABLE samples ( ... );
    INSERT INTO samples SELECT ... FROM samples_old;
    DROP TABLE samples_old;
    PRAGMA foreign_keys = ON;
  `);
}
```

**Rule of thumb:** If your migration does `ALTER TABLE ... RENAME TO` or `DROP TABLE` on any table that has an FK pointing to it, wrap the whole block in `PRAGMA foreign_keys = OFF/ON`.

---

## Critical: SQLite ALTER TABLE Limitations

SQLite's `ALTER TABLE` cannot modify column constraints. You **cannot** do:

```sql
ALTER TABLE samples ALTER COLUMN file_path DROP NOT NULL; -- ❌ not supported
```

To change a column's type or constraints, you must use the rename/recreate/drop pattern:

```sql
PRAGMA foreign_keys = OFF;
ALTER TABLE my_table RENAME TO my_table_old;
CREATE TABLE my_table ( ... new schema ... );
INSERT INTO my_table SELECT ... FROM my_table_old;
DROP TABLE my_table_old;
PRAGMA foreign_keys = ON;
```

---

## Partial Migration Recovery

If a migration crashes partway through (e.g. the process is killed), the database may be in a broken intermediate state — for example, a `_old` table left behind after the rename succeeded but before the drop.

Design migrations to detect and recover from partial runs. Example:

```typescript
private migrate002_sampleFilePathNullable(): void {
  // Detect partial previous run: rename succeeded but DROP failed
  const samplesOldExists = this.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='samples_old'")
    .get();

  if (samplesOldExists) {
    // Data is already in 'samples'; just clean up the leftover
    this.db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE samples_old;
      PRAGMA foreign_keys = ON;
    `);
    return;
  }

  // ... rest of migration
}
```

**Pattern:** At the top of any rename/recreate migration, check whether the `_old` table exists and handle it before proceeding.

---

## Testing a Migration

### Reset the database to a known broken state

To test that a migration handles an existing database correctly, reset the relevant parts of the schema via sqlite3, then start the app:

```bash
# Example: test that migration 2 handles partial state
sqlite3 ~/Library/Application\ Support/bounce/bounce.db "
  DROP TABLE IF EXISTS schema_versions;
  DROP TABLE IF EXISTS samples_features;
  -- recreate the broken pre-migration state as needed
"
npm run start:electron
```

**Principle:** Never apply fixes manually via sqlite3 in production. The migration code is the fix. Use sqlite3 only to set up test conditions. After testing, start the app and let migrations run.

### Verify after startup

```bash
sqlite3 ~/Library/Application\ Support/bounce/bounce.db \
  "SELECT * FROM schema_versions ORDER BY version;"
sqlite3 ~/Library/Application\ Support/bounce/bounce.db ".tables"
```

---

## `dbPath` Constructor Override

`DatabaseManager` accepts an optional `dbPath` to make it usable outside Electron (e.g. scripts, future tests):

```typescript
// Normal (Electron): uses app.getPath("userData")/bounce.db
const mgr = new DatabaseManager();

// Override (scripts/tests): uses the provided path
const mgr = new DatabaseManager('/path/to/test.db');
```

Note: `better-sqlite3` is compiled against Electron's Node version, so running outside Electron requires the Electron binary.

---

## Checklist

Before merging a migration:

- [ ] Method named `migrate00N_shortDescription` (N = next number in sequence)
- [ ] Added to `migrations` array at the correct position
- [ ] Uses `PRAGMA foreign_keys = OFF/ON` if renaming or dropping any FK-referenced table
- [ ] Handles partial migration recovery if using rename/recreate/drop pattern
- [ ] All SQL uses `IF NOT EXISTS` / `IF EXISTS` where applicable for idempotency
- [ ] Tested by resetting DB to pre-migration state and starting the app
- [ ] `schema_versions` shows new version applied after startup
- [ ] `npm run build:electron` passes with no TypeScript errors
