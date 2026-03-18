#pragma once
#include <string>

class AudioProcessor {
public:
    virtual void prepare(const float* pcm, int numSamples,
                         double sampleRate, int maxBlockSize) = 0;
    virtual void process(float** outputs, int numChannels,
                         int numFrames) = 0;
    virtual void reset() = 0;
    virtual const std::string& hash() const = 0;
    virtual int  positionInSamples() const { return 0; }
    virtual bool isFinished() const { return false; }
    virtual ~AudioProcessor() = default;
};
