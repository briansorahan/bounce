#pragma once

#include <functional>
#include <string>
#include <vector>

class Instrument {
public:
    using TelemetryWriter = std::function<void(const std::string& hash, int pos)>;
    using EndedWriter = std::function<void(const std::string& hash)>;

    explicit Instrument(std::string id, int polyphony = 16)
        : id_(std::move(id)), polyphony_(polyphony) {}
    virtual ~Instrument() = default;

    virtual void process(float** outputs, int numChannels, int numFrames) = 0;

    virtual void noteOn(int note, float velocity) = 0;
    virtual void noteOff(int note) = 0;
    virtual void stopAll() = 0;

    // Takes pcm by value so callers can move data in (avoids copy on audio thread)
    virtual void loadSample(int note, std::vector<float> pcm,
                            double sampleRate, const std::string& sampleHash,
                            bool loop = false) = 0;

    virtual void setParam(int paramId, float value) = 0;
    virtual int activeVoiceCount() const = 0;

    void setTelemetryEnabled(bool enabled) { telemetryEnabled_ = enabled; }
    bool telemetryEnabled() const { return telemetryEnabled_; }

    const std::string& id() const { return id_; }
    int polyphony() const { return polyphony_; }

    void setTelemetryWriters(TelemetryWriter posWriter, EndedWriter endWriter) {
        posWriter_ = std::move(posWriter);
        endWriter_ = std::move(endWriter);
    }

protected:
    std::string id_;
    int polyphony_;
    bool telemetryEnabled_ = false;
    TelemetryWriter posWriter_;
    EndedWriter endWriter_;
};
