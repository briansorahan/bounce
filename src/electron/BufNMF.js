"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufNMF = void 0;
// eslint-disable-next-line @typescript-eslint/no-require-imports
var flucoma = require("../../build/Release/flucoma_native.node");
var BufNMF = /** @class */ (function () {
    function BufNMF(options) {
        if (options === void 0) { options = {}; }
        this.native = new flucoma.BufNMF(options);
    }
    BufNMF.prototype.process = function (audioData, sampleRate) {
        return this.native.process(audioData, sampleRate);
    };
    BufNMF.prototype.resynthesize = function (audioData, sampleRate, bases, activations, componentIndex) {
        return this.native.resynthesize(audioData, sampleRate, bases, activations, componentIndex);
    };
    return BufNMF;
}());
exports.BufNMF = BufNMF;
