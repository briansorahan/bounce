#include "sample-playback-engine.h"
#include <algorithm>
#include <cstring>

SamplePlaybackEngine::SamplePlaybackEngine(std::string hash, bool loop,
                                           EndedCallback onEnded,
                                           int loopStartSample,
                                           int loopEndSample)
    : hash_(std::move(hash)), loop_(loop),
      loopStartSample_(loopStartSample), loopEndSample_(loopEndSample),
      onEnded_(std::move(onEnded)) {}

void SamplePlaybackEngine::prepare(const float* pcm, int numSamples,
                                   double /*sampleRate*/, int /*maxBlockSize*/) {
    pcm_.assign(pcm, pcm + numSamples);
    numSamples_ = numSamples;
    readPos_    = loop_ ? std::max(0, loopStartSample_) : 0;
    finished_   = false;
    effectiveLoopEnd_ = (loopEndSample_ >= 0 && loopEndSample_ <= numSamples)
                        ? loopEndSample_ : numSamples;
}

void SamplePlaybackEngine::process(float** outputs, int numChannels,
                                   int numFrames) {
    if (finished_ || numSamples_ == 0) return;

    for (int frame = 0; frame < numFrames; ++frame) {
        float sample = pcm_[readPos_];
        for (int ch = 0; ch < numChannels; ++ch) {
            outputs[ch][frame] += sample;
        }
        ++readPos_;
        if (readPos_ >= effectiveLoopEnd_) {
            if (loop_) {
                readPos_ = std::max(0, std::min(loopStartSample_, effectiveLoopEnd_ - 1));
            } else {
                finished_ = true;
                if (onEnded_) onEnded_(hash_);
                return;
            }
        }
    }
}

void SamplePlaybackEngine::reset() {
    readPos_  = 0;
    finished_ = false;
}
