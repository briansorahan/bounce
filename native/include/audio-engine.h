#pragma once
#include "audio-processor.h"
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// Forward declaration — miniaudio is included only in the .cpp
struct ma_device;

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

    static constexpr int kMaxProcessors = 32;

    AudioEngine();
    ~AudioEngine();

    // Non-copyable / non-movable
    AudioEngine(const AudioEngine&)            = delete;
    AudioEngine& operator=(const AudioEngine&) = delete;

    bool start();
    void stop();

    void play(const std::string& hash, const float* pcm, int numSamples,
              double sampleRate, bool loop);
    void stopSample(const std::string& hash);
    void stopAll();

    void onPosition(PositionCallback cb);
    void onEnded(EndedCallback cb);

private:
    // Called on the miniaudio audio callback thread
    static void audioCallback(ma_device* device, void* output,
                              const void* input, unsigned int frameCount);
    void processBlock(float* output, unsigned int frameCount);

    // Control messages queued from JS thread, applied at top of each audio block
    struct ControlMsg {
        enum class Op { Add, Remove, RemoveAll } op;
        std::shared_ptr<AudioProcessor> processor; // for Add
        std::string hash;                          // for Remove
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
