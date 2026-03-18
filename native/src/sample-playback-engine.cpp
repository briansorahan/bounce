#include "sample-playback-engine.h"
#include <algorithm>
#include <cstring>

SamplePlaybackEngine::SamplePlaybackEngine(std::string hash, bool loop,
                                           EndedCallback onEnded)
    : hash_(std::move(hash)), loop_(loop), onEnded_(std::move(onEnded)) {}

void SamplePlaybackEngine::prepare(const float* pcm, int numSamples,
                                   double /*sampleRate*/, int /*maxBlockSize*/) {
    pcm_.assign(pcm, pcm + numSamples);
    numSamples_ = numSamples;
    readPos_    = 0;
    finished_   = false;
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
        if (readPos_ >= numSamples_) {
            if (loop_) {
                readPos_ = 0;
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
