#pragma once
#include "audio-processor.h"
#include <functional>
#include <string>
#include <vector>

class SamplePlaybackEngine : public AudioProcessor {
public:
    using EndedCallback = std::function<void(const std::string&)>;

    explicit SamplePlaybackEngine(std::string hash, bool loop,
                                  EndedCallback onEnded = nullptr,
                                  int loopStartSample = 0,
                                  int loopEndSample = -1);

    void prepare(const float* pcm, int numSamples,
                 double sampleRate, int maxBlockSize) override;
    void process(float** outputs, int numChannels, int numFrames) override;
    void reset() override;
    const std::string& hash() const override { return hash_; }
    int  positionInSamples() const override  { return readPos_; }
    bool isFinished() const override         { return finished_; }

private:
    std::string hash_;
    bool loop_;
    int loopStartSample_;
    int loopEndSample_;  // -1 means end of sample
    EndedCallback onEnded_;

    std::vector<float> pcm_;
    int readPos_     = 0;
    int numSamples_  = 0;
    int effectiveLoopEnd_ = 0;
    bool finished_   = false;
};
