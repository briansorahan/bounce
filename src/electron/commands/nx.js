"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nxCommand = void 0;
var logger_1 = require("../logger");
var BufNMFCross_1 = require("../BufNMFCross");
var BufNMF_1 = require("../BufNMF");
var crypto_1 = require("crypto");
exports.nxCommand = {
    name: "nx",
    description: "NMF cross-synthesis using source dictionary",
    usage: "nx <target-hash> <source-hash> [source-feature-hash]",
    help: "Apply NMF bases from a source sample to decompose a target sample.\n\nUsage: nx <target-hash> <source-hash> [source-feature-hash]\n\nUses the NMF bases (dictionary) learned from the source sample to analyze\nand resynthesize the target sample. If source-feature-hash is not provided,\nuses the most recent NMF analysis of the source sample.\n\nThis is useful for:\n- Applying a \"drum dictionary\" from one sample to separate drums in another\n- Transferring learned spectral templates across recordings\n- Style transfer and audio mosaicing\n\nExample:\n  # Analyze a drum loop to learn drum patterns\n  analyze-nmf drums.wav --components 10\n  \n  # Apply drum dictionary to a different recording\n  nx song.wav drums.wav\n  \n  # Use a specific source analysis\n  nx song.wav drums.wav a3f5e8b2\n  \n  # Play the resynthesized components\n  play-component song.wav 0",
    execute: function (args, mainWindow, dbManager) { return __awaiter(void 0, void 0, void 0, function () {
        var targetHash, sourceHash, sourceFeatureHash, targetSample, sourceSample, sourceFeature, sourceNMFData, sourceBases, sourceActivations, numComponents, sourceOptions, fftSize, hopSize, windowSize, targetAudioBuffer, targetAudioData, nmfCross, crossResult, featureData, featureHash, options, featureRecord, nmf, componentIds, i, componentAudio, componentBuffer, result;
        var _a, _b;
        return __generator(this, function (_c) {
            (0, logger_1.debugLog)("info", "[NX] Command executed", { args: args });
            if (args.length < 2) {
                return [2 /*return*/, {
                        success: false,
                        message: "Usage: nx <target-hash> <source-hash> [source-feature-hash]",
                    }];
            }
            targetHash = args[0];
            sourceHash = args[1];
            sourceFeatureHash = args[2];
            if (!dbManager) {
                return [2 /*return*/, { success: false, message: "Database not initialized" }];
            }
            try {
                targetSample = dbManager.getSampleByHash(targetHash);
                if (!targetSample) {
                    return [2 /*return*/, {
                            success: false,
                            message: "Target sample not found: ".concat(targetHash),
                        }];
                }
                sourceSample = dbManager.getSampleByHash(sourceHash);
                if (!sourceSample) {
                    return [2 /*return*/, {
                            success: false,
                            message: "Source sample not found: ".concat(sourceHash),
                        }];
                }
                (0, logger_1.debugLog)("info", "[NX] Samples found", {
                    target: targetSample.hash.substring(0, 8),
                    source: sourceSample.hash.substring(0, 8),
                });
                sourceFeature = void 0;
                if (sourceFeatureHash) {
                    sourceFeature = dbManager.getFeatureByHash(sourceSample.hash, sourceFeatureHash);
                    if (!sourceFeature) {
                        return [2 /*return*/, {
                                success: false,
                                message: "No NMF feature found for source with hash: ".concat(sourceFeatureHash),
                            }];
                    }
                }
                else {
                    sourceFeature = dbManager.getFeature(sourceSample.hash, "nmf");
                    if (!sourceFeature) {
                        return [2 /*return*/, {
                                success: false,
                                message: "No NMF analysis found for source ".concat(sourceHash, ". Run 'analyze-nmf ").concat(sourceHash, "' first."),
                            }];
                    }
                }
                (0, logger_1.debugLog)("info", "[NX] Source feature found", {
                    featureHash: sourceFeature.feature_hash.substring(0, 8),
                });
                sourceNMFData = JSON.parse(sourceFeature.feature_data);
                sourceBases = sourceNMFData.bases;
                sourceActivations = sourceNMFData.activations;
                numComponents = sourceBases.length;
                (0, logger_1.debugLog)("info", "[NX] Source NMF data parsed", {
                    numComponents: numComponents,
                    basisDims: [sourceBases.length, ((_a = sourceBases[0]) === null || _a === void 0 ? void 0 : _a.length) || 0],
                });
                sourceOptions = JSON.parse(sourceFeature.options || "{}");
                fftSize = sourceOptions.fftSize || 2048;
                hopSize = sourceOptions.hopSize || fftSize / 2;
                windowSize = sourceOptions.windowSize || fftSize;
                targetAudioBuffer = targetSample.audio_data;
                targetAudioData = new Float32Array(targetAudioBuffer.buffer, targetAudioBuffer.byteOffset, targetAudioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
                (0, logger_1.debugLog)("info", "[NX] Starting cross-synthesis", {
                    targetLength: targetAudioData.length,
                    targetSampleRate: targetSample.sample_rate,
                    numComponents: numComponents,
                });
                nmfCross = new BufNMFCross_1.BufNMFCross({
                    fftSize: fftSize,
                    hopSize: hopSize,
                    windowSize: windowSize,
                    iterations: 50,
                });
                crossResult = nmfCross.process(targetAudioData, targetSample.sample_rate, sourceBases, sourceActivations);
                (0, logger_1.debugLog)("info", "[NX] Cross-synthesis complete", {
                    targetActivationsShape: [
                        crossResult.activations.length,
                        ((_b = crossResult.activations[0]) === null || _b === void 0 ? void 0 : _b.length) || 0,
                    ],
                });
                featureData = JSON.stringify({
                    bases: crossResult.bases,
                    activations: crossResult.activations,
                    sourceSampleHash: sourceSample.hash,
                    sourceFeatureHash: sourceFeature.feature_hash,
                });
                featureHash = crypto_1.default
                    .createHash("sha256")
                    .update(featureData)
                    .digest("hex");
                options = JSON.stringify({ fftSize: fftSize, hopSize: hopSize, windowSize: windowSize });
                dbManager.db
                    .prepare("INSERT OR REPLACE INTO features (sample_hash, feature_type, feature_hash, feature_data, options, created_at)\n           VALUES (?, ?, ?, ?, ?, datetime('now'))")
                    .run(targetSample.hash, "nmf-cross", featureHash, featureData, options);
                (0, logger_1.debugLog)("info", "[NX] Cross-synthesis feature stored");
                featureRecord = dbManager.db
                    .prepare("SELECT id FROM features WHERE feature_hash = ?")
                    .get(featureHash);
                if (!featureRecord) {
                    return [2 /*return*/, { success: false, message: "Failed to retrieve feature ID" }];
                }
                // Now resynthesize components using the cross-synthesis result
                (0, logger_1.debugLog)("info", "[NX] Resynthesizing components");
                nmf = new BufNMF_1.BufNMF({ fftSize: fftSize, hopSize: hopSize, windowSize: windowSize });
                componentIds = [];
                for (i = 0; i < numComponents; i++) {
                    (0, logger_1.debugLog)("info", "[NX] Resynthesizing component ".concat(i, "/").concat(numComponents));
                    componentAudio = nmf.resynthesize(targetAudioData, targetSample.sample_rate, crossResult.bases, crossResult.activations, i);
                    componentBuffer = Buffer.from(componentAudio.buffer);
                    result = dbManager.db
                        .prepare("INSERT OR REPLACE INTO components (sample_hash, feature_id, component_index, audio_data) \n             VALUES (?, ?, ?, ?)")
                        .run(targetSample.hash, featureRecord.id, i, componentBuffer);
                    componentIds.push(result.lastInsertRowid);
                }
                (0, logger_1.debugLog)("info", "[NX] All components resynthesized", { componentIds: componentIds });
                return [2 /*return*/, {
                        success: true,
                        message: "NMF cross-synthesis complete\r\n" +
                            "Target: ".concat(targetSample.hash.substring(0, 8), "\r\n") +
                            "Source: ".concat(sourceSample.hash.substring(0, 8), " (feature: ").concat(sourceFeature.feature_hash.substring(0, 8), ")\r\n") +
                            "".concat(numComponents, " components resynthesized (indices: 0-").concat(numComponents - 1, ")\r\n") +
                            "Use 'play-component ".concat(targetHash.substring(0, 8), " <index>' to play components"),
                    }];
            }
            catch (error) {
                (0, logger_1.debugLog)("error", "[NX] Error during cross-synthesis", {
                    error: error.message,
                    stack: error.stack,
                });
                return [2 /*return*/, {
                        success: false,
                        message: "NX command failed: ".concat(error.message),
                    }];
            }
            return [2 /*return*/];
        });
    }); },
};
