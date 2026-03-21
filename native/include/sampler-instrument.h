#pragma once

#include "instrument.h"
#include "sample-playback-engine.h"

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

class SamplerInstrument : public Instrument {
public:
    explicit SamplerInstrument(std::string id, int polyphony = 16);

    void process(float** outputs, int numChannels, int numFrames) override;
    void noteOn(int note, float velocity) override;
    void noteOff(int note) override;
    void stopAll() override;
    void loadSample(int note, std::vector<float> pcm,
                    double sampleRate, const std::string& sampleHash,
                    bool loop = false,
                    double loopStartSec = 0.0, double loopEndSec = -1.0) override;
    void setParam(int paramId, float value) override;
    int activeVoiceCount() const override;

    enum class Param : int {
        Volume = 0,
    };

private:
    struct SampleData {
        std::vector<float> pcm;
        double sampleRate;
        std::string hash;
        bool loop = false;
        double loopStartSec = 0.0;
        double loopEndSec = -1.0;  // -1 means end of sample
    };
    std::unordered_map<int, SampleData> samples_;

    struct Voice {
        std::unique_ptr<SamplePlaybackEngine> processor;
        int note = -1;
        float velocity = 0.f;
        bool active = false;
    };
    std::vector<Voice> voices_;
    int nextVoiceIndex_ = 0;

    float volume_ = 1.0f;

    Voice* allocateVoice();
};
