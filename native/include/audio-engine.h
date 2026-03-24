#pragma once
#include "audio-processor.h"
#include <array>
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// Forward declarations
struct ma_device;
class Instrument;

struct TelemetryEvent {
    enum class Kind { Position, Ended };
    Kind        kind;
    std::string hash;
    int         positionInSamples; // valid for Position events
};

class AudioEngine {
public:
    using PositionCallback = std::function<void(const std::string&, int)>;
    using EndedCallback    = std::function<void(const std::string&)>;

    static constexpr int kMaxProcessors    = 32;
    static constexpr int kNumUserChannels  = 8;
    static constexpr int kPreviewChannelIdx = 8; // index of the preview channel
    static constexpr int kNumChannels      = 9; // 8 user + 1 preview

    AudioEngine();
    ~AudioEngine();

    // Non-copyable / non-movable
    AudioEngine(const AudioEngine&)            = delete;
    AudioEngine& operator=(const AudioEngine&) = delete;

    bool start();
    void stop();

    // Legacy playback API (backward compat — routes through preview channel)
    void play(const std::string& hash, const float* pcm, int numSamples,
              double sampleRate, bool loop,
              double loopStartSec = 0.0, double loopEndSec = -1.0);
    void stopSample(const std::string& hash);
    void stopAll();

    // Instrument API
    void defineInstrument(const std::string& id, const std::string& kind,
                          int polyphony);
    void freeInstrument(const std::string& id);
    void loadInstrumentSample(const std::string& instrumentId, int note,
                              std::vector<float> pcm, double sampleRate,
                              const std::string& sampleHash, bool loop,
                              double loopStartSec = 0.0, double loopEndSec = -1.0);
    void instrumentNoteOn(const std::string& instrumentId,
                          int note, float velocity);
    void instrumentNoteOff(const std::string& instrumentId, int note);
    void instrumentStopAll(const std::string& instrumentId);
    void setInstrumentParam(const std::string& instrumentId,
                            int paramId, float value);
    void subscribeInstrumentTelemetry(const std::string& instrumentId);
    void unsubscribeInstrumentTelemetry(const std::string& instrumentId);

    // Mixer API
    // channelIndex: 0-7 for user channels, 8 for preview channel
    void mixerSetChannelGain(int channelIndex, float gainDb);
    void mixerSetChannelPan(int channelIndex, float pan);   // -1.0 .. +1.0
    void mixerSetChannelMute(int channelIndex, bool mute);
    void mixerSetChannelSolo(int channelIndex, bool solo);
    void mixerAttachInstrument(int channelIndex, const std::string& instrumentId);
    void mixerDetachChannel(int channelIndex);
    void mixerSetMasterGain(float gainDb);
    void mixerSetMasterMute(bool mute);

    void onPosition(PositionCallback cb);
    void onEnded(EndedCallback cb);

private:
    // Called on the miniaudio audio callback thread
    static void audioCallback(ma_device* device, void* output,
                              const void* input, unsigned int frameCount);
    void processBlock(float* output, unsigned int frameCount);

    // Per-channel mixer state (audio-thread-only after control queue drain)
    struct ChannelStrip {
        float       gainDb = -6.f;
        float       pan    = 0.f;   // -1.0 (L) .. +1.0 (R)
        bool        mute   = false;
        bool        solo   = false;
        std::string attachedInstrumentId; // empty = unattached
    };

    struct MasterBus {
        float gainDb = 0.f;
        bool  mute   = false;
    };

    // Control messages queued from JS thread, applied at top of each audio block
    struct ControlMsg {
        enum class Op {
            Add, Remove, RemoveAll,
            DefineInstrument, FreeInstrument,
            InstrumentNoteOn, InstrumentNoteOff, InstrumentStopAll,
            InstrumentLoadSample, InstrumentSetParam,
            SubscribeTelemetry, UnsubscribeTelemetry,
            // Mixer ops
            MixerSetChannelGain,
            MixerSetChannelPan,
            MixerSetChannelMute,
            MixerSetChannelSolo,
            MixerAttachInstrument,
            MixerDetachChannel,
            MixerSetMasterGain,
            MixerSetMasterMute,
        } op;

        // Legacy
        std::shared_ptr<AudioProcessor> processor; // for Add
        std::string hash;                          // for Remove

        // Instrument fields
        std::shared_ptr<Instrument> instrument;
        std::string instrumentId;
        int note = 0;
        float velocity = 0.f;
        int paramId = 0;
        float paramValue = 0.f;
        std::vector<float> pcm;
        double sampleRate = 0.0;
        std::string sampleHash;
        bool loop = false;
        double loopStartSec = 0.0;
        double loopEndSec = -1.0;

        // Mixer fields
        int channelIndex = 0;
    };

    // Simple lock-based queues (not audio-thread-safe for the control queue,
    // but control messages are rare and only applied at block boundaries)
    std::mutex                              controlMutex_;
    std::vector<ControlMsg>                 controlQueue_;

    // Lock-free telemetry ring buffer (power-of-two, written by audio thread)
    static constexpr int kRingSize = 1024;
    std::array<TelemetryEvent, kRingSize>   ring_;
    std::atomic<int>                        ringWritePos_{0};
    std::atomic<int>                        ringReadPos_{0};

    // Active processors (accessed only on audio thread after swap-in)
    std::vector<std::shared_ptr<AudioProcessor>> processors_;

    // Active instruments (accessed only on audio thread after swap-in)
    std::vector<std::shared_ptr<Instrument>> instruments_;
    Instrument* findInstrument(const std::string& id);
    void setupInstrumentTelemetry(Instrument* inst);

    // Mixer state (audio-thread-only)
    std::array<ChannelStrip, kNumChannels> channels_;
    MasterBus                              master_;

    // Per-channel scratch buffers for de-interleaved processing (audio-thread-only)
    std::array<std::vector<float>, kNumChannels> chanBufL_;
    std::array<std::vector<float>, kNumChannels> chanBufR_;
    std::vector<float> masterBufL_;
    std::vector<float> masterBufR_;

    // Telemetry delivery thread
    std::thread   telemetryThread_;
    std::atomic<bool> telemetryRunning_{false};
    void telemetryLoop();

    PositionCallback positionCb_;
    EndedCallback    endedCb_;
    std::mutex       cbMutex_;

    // miniaudio device (heap-allocated to avoid including miniaudio.h here)
    struct DeviceDeleter { void operator()(ma_device*) const; };
    std::unique_ptr<ma_device, DeviceDeleter> device_;
    bool deviceRunning_ = false;

    int sampleRate_ = 44100;
};
