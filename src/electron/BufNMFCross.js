"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufNMFCross = void 0;
// eslint-disable-next-line @typescript-eslint/no-require-imports
var flucoma = require("../../build/Release/flucoma_native.node");
var BufNMFCross = /** @class */ (function () {
    function BufNMFCross(options) {
        if (options === void 0) { options = {}; }
        this.native = new flucoma.BufNMFCross(options);
    }
    BufNMFCross.prototype.process = function (targetAudio, sampleRate, sourceBases, sourceActivations) {
        return this.native.process(targetAudio, sampleRate, sourceBases, sourceActivations);
    };
    return BufNMFCross;
}());
exports.BufNMFCross = BufNMFCross;
