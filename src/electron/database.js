"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var electron_1 = require("electron");
var path = require("path");
var crypto = require("crypto");
var DatabaseManager = /** @class */ (function () {
    function DatabaseManager() {
        var userDataPath = electron_1.app.getPath("userData");
        var dbPath = path.join(userDataPath, "bounce.db");
        this.db = new better_sqlite3_1.default(dbPath);
        this.initializeTables();
    }
    DatabaseManager.prototype.initializeTables = function () {
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS command_history (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        command TEXT NOT NULL,\n        timestamp INTEGER NOT NULL,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_command_history_timestamp \n      ON command_history(timestamp DESC);\n\n      CREATE TABLE IF NOT EXISTS debug_logs (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        level TEXT NOT NULL,\n        message TEXT NOT NULL,\n        data TEXT,\n        timestamp INTEGER NOT NULL,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp \n      ON debug_logs(timestamp DESC);\n\n      CREATE TABLE IF NOT EXISTS samples (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        hash TEXT NOT NULL UNIQUE,\n        file_path TEXT NOT NULL,\n        audio_data BLOB NOT NULL,\n        sample_rate INTEGER NOT NULL,\n        channels INTEGER NOT NULL,\n        duration REAL NOT NULL,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_samples_hash \n      ON samples(hash);\n\n      CREATE INDEX IF NOT EXISTS idx_samples_file_path \n      ON samples(file_path);\n\n      CREATE TABLE IF NOT EXISTS features (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        sample_hash TEXT NOT NULL,\n        feature_hash TEXT NOT NULL,\n        feature_type TEXT NOT NULL,\n        feature_data TEXT NOT NULL,\n        options TEXT,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n        UNIQUE(sample_hash, feature_hash),\n        FOREIGN KEY (sample_hash) REFERENCES samples(hash)\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_features_sample \n      ON features(sample_hash);\n\n      CREATE INDEX IF NOT EXISTS idx_features_type \n      ON features(feature_type);\n\n      CREATE INDEX IF NOT EXISTS idx_features_hash \n      ON features(feature_hash);\n\n      CREATE TABLE IF NOT EXISTS slices (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        sample_hash TEXT NOT NULL,\n        feature_id INTEGER NOT NULL,\n        slice_index INTEGER NOT NULL,\n        start_sample INTEGER NOT NULL,\n        end_sample INTEGER NOT NULL,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n        FOREIGN KEY (sample_hash) REFERENCES samples(hash),\n        FOREIGN KEY (feature_id) REFERENCES features(id)\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_slices_sample \n      ON slices(sample_hash);\n\n      CREATE INDEX IF NOT EXISTS idx_slices_feature \n      ON slices(feature_id);\n\n      CREATE TABLE IF NOT EXISTS components (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        sample_hash TEXT NOT NULL,\n        feature_id INTEGER NOT NULL,\n        component_index INTEGER NOT NULL,\n        audio_data BLOB NOT NULL,\n        created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n        FOREIGN KEY (sample_hash) REFERENCES samples(hash),\n        FOREIGN KEY (feature_id) REFERENCES features(id)\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_components_sample \n      ON components(sample_hash);\n\n      CREATE INDEX IF NOT EXISTS idx_components_feature \n      ON components(feature_id);\n    ");
    };
    DatabaseManager.prototype.addDebugLog = function (level, message, data) {
        var stmt = this.db.prepare("\n      INSERT INTO debug_logs (level, message, data, timestamp) \n      VALUES (?, ?, ?, ?)\n    ");
        var dataStr = data !== undefined ? JSON.stringify(data) : null;
        stmt.run(level, message, dataStr, Date.now());
    };
    DatabaseManager.prototype.getDebugLogs = function (limit) {
        if (limit === void 0) { limit = 100; }
        var stmt = this.db.prepare("\n      SELECT level, message, data, timestamp, created_at \n      FROM debug_logs \n      ORDER BY timestamp DESC \n      LIMIT ?\n    ");
        return stmt.all(limit);
    };
    DatabaseManager.prototype.clearDebugLogs = function () {
        this.db.prepare("DELETE FROM debug_logs").run();
    };
    DatabaseManager.prototype.addCommand = function (command) {
        var lastCommand = this.db
            .prepare("\n      SELECT command FROM command_history \n      ORDER BY timestamp DESC \n      LIMIT 1\n    ")
            .get();
        if ((lastCommand === null || lastCommand === void 0 ? void 0 : lastCommand.command) === command) {
            return;
        }
        var stmt = this.db.prepare("\n      INSERT INTO command_history (command, timestamp) \n      VALUES (?, ?)\n    ");
        stmt.run(command, Date.now());
    };
    DatabaseManager.prototype.getCommandHistory = function (limit) {
        if (limit === void 0) { limit = 1000; }
        var stmt = this.db.prepare("\n      SELECT command \n      FROM command_history \n      ORDER BY timestamp DESC \n      LIMIT ?\n    ");
        var rows = stmt.all(limit);
        return rows.map(function (row) { return row.command; }).reverse();
    };
    DatabaseManager.prototype.clearCommandHistory = function () {
        this.db.prepare("DELETE FROM command_history").run();
    };
    DatabaseManager.prototype.dedupeCommandHistory = function () {
        var stmt = this.db.prepare("\n      DELETE FROM command_history\n      WHERE id IN (\n        SELECT h1.id\n        FROM command_history h1\n        INNER JOIN command_history h2 \n          ON h1.command = h2.command \n          AND h1.timestamp > h2.timestamp\n        WHERE NOT EXISTS (\n          SELECT 1 FROM command_history h3\n          WHERE h3.timestamp > h2.timestamp \n            AND h3.timestamp < h1.timestamp\n        )\n      )\n    ");
        var result = stmt.run();
        return { removed: result.changes };
    };
    DatabaseManager.prototype.close = function () {
        this.db.close();
    };
    DatabaseManager.prototype.storeSample = function (hash, filePath, audioData, sampleRate, channels, duration) {
        var stmt = this.db.prepare("\n      INSERT OR REPLACE INTO samples (hash, file_path, audio_data, sample_rate, channels, duration) \n      VALUES (?, ?, ?, ?, ?, ?)\n    ");
        stmt.run(hash, filePath, audioData, sampleRate, channels, duration);
    };
    DatabaseManager.prototype.getSampleByHash = function (hash) {
        var stmt = this.db.prepare("\n      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration \n      FROM samples \n      WHERE hash LIKE ? || '%'\n      LIMIT 1\n    ");
        return stmt.get(hash);
    };
    DatabaseManager.prototype.getSampleByPath = function (filePath) {
        var stmt = this.db.prepare("\n      SELECT id, hash, file_path, audio_data, sample_rate, channels, duration \n      FROM samples \n      WHERE file_path = ? \n      ORDER BY id DESC \n      LIMIT 1\n    ");
        return stmt.get(filePath);
    };
    DatabaseManager.prototype.storeFeature = function (sampleHash, featureType, featureData, options) {
        // Compute hash of feature data and options
        var dataStr = JSON.stringify(featureData);
        var optionsStr = options ? JSON.stringify(options) : "";
        var featureContent = "".concat(featureType, ":").concat(dataStr, ":").concat(optionsStr);
        var featureHash = crypto
            .createHash("sha256")
            .update(featureContent)
            .digest("hex");
        var stmt = this.db.prepare("\n      INSERT OR IGNORE INTO features (sample_hash, feature_hash, feature_type, feature_data, options) \n      VALUES (?, ?, ?, ?, ?)\n    ");
        var optionsStrOrNull = options ? JSON.stringify(options) : null;
        var result = stmt.run(sampleHash, featureHash, featureType, dataStr, optionsStrOrNull);
        // If no rows were inserted (duplicate), get the existing ID
        if (result.changes === 0) {
            var existing = this.db
                .prepare("\n        SELECT id FROM features WHERE sample_hash = ? AND feature_hash = ?\n      ")
                .get(sampleHash, featureHash);
            return existing ? existing.id : 0;
        }
        return result.lastInsertRowid;
    };
    DatabaseManager.prototype.getMostRecentFeature = function (sampleHash, featureType) {
        var sql = "SELECT id, sample_hash, feature_hash, feature_type, feature_data, options FROM features";
        var conditions = [];
        var params = [];
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
        var stmt = this.db.prepare(sql);
        return stmt.get.apply(stmt, params);
    };
    DatabaseManager.prototype.createSlices = function (sampleHash, featureId, slicePositions) {
        var stmt = this.db.prepare("\n      INSERT INTO slices (sample_hash, feature_id, slice_index, start_sample, end_sample) \n      VALUES (?, ?, ?, ?, ?)\n    ");
        var sliceIds = [];
        for (var i = 0; i < slicePositions.length; i++) {
            var startSample = slicePositions[i];
            var endSample = i < slicePositions.length - 1 ? slicePositions[i + 1] : null;
            if (endSample !== null) {
                var result = stmt.run(sampleHash, featureId, i, startSample, endSample);
                sliceIds.push(result.lastInsertRowid);
            }
        }
        return sliceIds;
    };
    DatabaseManager.prototype.getSlicesByFeature = function (featureId) {
        var stmt = this.db.prepare("\n      SELECT id, sample_hash, feature_id, slice_index, start_sample, end_sample \n      FROM slices \n      WHERE feature_id = ? \n      ORDER BY slice_index ASC\n    ");
        return stmt.all(featureId);
    };
    DatabaseManager.prototype.getSlice = function (sliceId) {
        var stmt = this.db.prepare("\n      SELECT id, sample_hash, feature_id, slice_index, start_sample, end_sample \n      FROM slices \n      WHERE id = ?\n    ");
        return stmt.get(sliceId);
    };
    DatabaseManager.prototype.listSamples = function () {
        var stmt = this.db.prepare("\n      SELECT \n        id, \n        hash, \n        file_path, \n        sample_rate, \n        channels, \n        duration,\n        length(audio_data) as data_size,\n        created_at\n      FROM samples \n      ORDER BY id DESC\n    ");
        return stmt.all();
    };
    DatabaseManager.prototype.listFeatures = function () {
        var stmt = this.db.prepare("\n      SELECT \n        id,\n        sample_hash,\n        feature_hash,\n        feature_type,\n        json_array_length(feature_data) as slice_count,\n        options,\n        created_at\n      FROM features \n      ORDER BY id DESC\n    ");
        return stmt.all();
    };
    DatabaseManager.prototype.listSlicesSummary = function () {
        var stmt = this.db.prepare("\n      SELECT \n        s.sample_hash,\n        sa.file_path,\n        s.feature_id,\n        COUNT(*) as slice_count,\n        MIN(s.id) as min_slice_id,\n        MAX(s.id) as max_slice_id\n      FROM slices s\n      JOIN samples sa ON s.sample_hash = sa.hash\n      GROUP BY s.sample_hash, s.feature_id\n      ORDER BY s.sample_hash\n    ");
        return stmt.all();
    };
    DatabaseManager.prototype.getFeature = function (sampleHash, featureType) {
        var stmt = this.db.prepare("\nSELECT feature_type, feature_data, feature_hash, options\nFROM features\nWHERE sample_hash = ? AND feature_type = ?\nORDER BY created_at DESC\nLIMIT 1\n");
        return stmt.get(sampleHash, featureType);
    };
    DatabaseManager.prototype.getFeatureByHash = function (sampleHash, featureHashPrefix) {
        var stmt = this.db.prepare("\nSELECT feature_type, feature_data, feature_hash, options\nFROM features\nWHERE sample_hash = ? AND feature_hash LIKE ?\nLIMIT 1\n");
        return stmt.get(sampleHash, "".concat(featureHashPrefix, "%"));
    };
    DatabaseManager.prototype.createComponents = function (sampleHash, featureId, componentAudioData) {
        var stmt = this.db.prepare("\n      INSERT INTO components (sample_hash, feature_id, component_index, audio_data) \n      VALUES (?, ?, ?, ?)\n    ");
        var componentIds = [];
        for (var i = 0; i < componentAudioData.length; i++) {
            var result = stmt.run(sampleHash, featureId, i, componentAudioData[i]);
            componentIds.push(result.lastInsertRowid);
        }
        return componentIds;
    };
    DatabaseManager.prototype.getComponentsByFeature = function (featureId) {
        var stmt = this.db.prepare("\n      SELECT id, sample_hash, feature_id, component_index, audio_data \n      FROM components \n      WHERE feature_id = ? \n      ORDER BY component_index ASC\n    ");
        return stmt.all(featureId);
    };
    DatabaseManager.prototype.getComponent = function (componentId) {
        var stmt = this.db.prepare("\n      SELECT id, sample_hash, feature_id, component_index, audio_data \n      FROM components \n      WHERE id = ?\n    ");
        return stmt.get(componentId);
    };
    DatabaseManager.prototype.getComponentByIndex = function (sampleHash, featureId, componentIndex) {
        var stmt = this.db.prepare("\n      SELECT id, sample_hash, feature_id, component_index, audio_data \n      FROM components \n      WHERE sample_hash = ? AND feature_id = ? AND component_index = ?\n    ");
        return stmt.get(sampleHash, featureId, componentIndex);
    };
    DatabaseManager.prototype.listComponentsSummary = function () {
        var stmt = this.db.prepare("\n      SELECT \n        c.sample_hash,\n        sa.file_path,\n        c.feature_id,\n        COUNT(*) as component_count,\n        MIN(c.id) as min_component_id,\n        MAX(c.id) as max_component_id\n      FROM components c\n      JOIN samples sa ON c.sample_hash = sa.hash\n      GROUP BY c.sample_hash, c.feature_id\n      ORDER BY c.sample_hash\n    ");
        return stmt.all();
    };
    return DatabaseManager;
}());
exports.DatabaseManager = DatabaseManager;
