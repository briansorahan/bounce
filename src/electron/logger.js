"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDatabaseManager = setDatabaseManager;
exports.debugLog = debugLog;
var dbManagerInstance = null;
function setDatabaseManager(dbManager) {
    dbManagerInstance = dbManager;
}
function debugLog(level, message, data) {
    if (dbManagerInstance) {
        dbManagerInstance.addDebugLog(level, message, data);
    }
}
