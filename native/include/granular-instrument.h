#pragma once

#include "instrument.h"

#include <algorithm>
#include <array>
#include <random>
#include <string>
#include <vector>

class GranularInstrument : public Instrument {
public:
    enum class Param : int {
        Position  = 0,
        GrainSize = 1,
        Density   = 2,
        Scatter   = 3,
        Envelope  = 4,
        Pitch     = 5,
        Volume    = 6,
    };

    explicit GranularInstrument(std::string id,
                                int polyphony = 4,
                                double sampleRate = 44100.0);

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

private:
    struct Grain {
        double readPos         = 0.0;
        int    grainLength     = 0;
        float  envelopePhase   = 0.0f;
        float  envelopePhaseInc = 0.0f;
        float  playbackRate    = 1.0f;
        bool   active          = false;
    };

    struct GrainStream {
        std::array<Grain, 128> grains{};
        double samplesUntilNextGrain = 0.0;
        float  velocity              = 0.0f;
        int    triggerNote           = -1;
        bool   active                = false;
        bool   draining              = false;
    };

    void trySpawnGrain(GrainStream& stream);

    std::vector<float>       sourcePcm_;
    double                   sourceSampleRate_ = 44100.0;
    std::string              sourceHash_;

    std::vector<GrainStream> streams_;

    float position_    = 0.5f;
    float grainSizeMs_ = 80.0f;
    float density_     = 20.0f;
    float scatter_     = 0.1f;
    int   envelopeType_ = 0;
    float pitch_       = 1.0f;
    float volume_      = 1.0f;

    double engineSampleRate_;

    std::vector<float> windowLut_;

    std::default_random_engine rng_;
    std::uniform_real_distribution<float> scatterDist_{ -0.5f, 0.5f };
};
