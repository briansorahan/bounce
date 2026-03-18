#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

#include "audio-engine.h"
#include "sample-playback-engine.h"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <thread>

// ---------------------------------------------------------------------------
// DeviceDeleter (pimpl cleanup)
// ---------------------------------------------------------------------------
void AudioEngine::DeviceDeleter::operator()(ma_device* d) const {
    if (d) {
        ma_device_uninit(d);
        delete d;
    }
}

// ---------------------------------------------------------------------------
// Construction / destruction
// ---------------------------------------------------------------------------
AudioEngine::AudioEngine() : device_(nullptr) {
    processors_.reserve(kMaxProcessors);
}

AudioEngine::~AudioEngine() {
    stop();
}

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------
bool AudioEngine::start() {
    device_.reset(new ma_device());

    ma_device_config cfg = ma_device_config_init(ma_device_type_playback);
    cfg.playback.format   = ma_format_f32;
    cfg.playback.channels = 2;
    cfg.sampleRate        = 0; // use device default
    cfg.dataCallback      = AudioEngine::audioCallback;
    cfg.pUserData         = this;

    if (ma_device_init(nullptr, &cfg, device_.get()) != MA_SUCCESS) {
        device_.reset();
        return false;
    }

    sampleRate_ = static_cast<int>(device_->sampleRate);

    telemetryRunning_.store(true);
    telemetryThread_ = std::thread(&AudioEngine::telemetryLoop, this);

    if (ma_device_start(device_.get()) != MA_SUCCESS) {
        telemetryRunning_.store(false);
        if (telemetryThread_.joinable()) telemetryThread_.join();
        device_.reset();
        return false;
    }

    deviceRunning_ = true;
    return true;
}

void AudioEngine::stop() {
    if (deviceRunning_) {
        ma_device_stop(device_.get());
        deviceRunning_ = false;
    }
    device_.reset();

    telemetryRunning_.store(false);
    if (telemetryThread_.joinable()) telemetryThread_.join();
}

// ---------------------------------------------------------------------------
// Control API (called from JS / utility-process thread)
// ---------------------------------------------------------------------------
void AudioEngine::play(const std::string& hash, const float* pcm,
                       int numSamples, double sampleRate, bool loop) {
    auto proc = std::make_shared<SamplePlaybackEngine>(
        hash, loop,
        [this](const std::string& h) {
            // Called from audio thread — push ended event into ring
            TelemetryEvent ev;
            ev.kind             = TelemetryEvent::Kind::Ended;
            ev.hash             = h;
            ev.positionInSamples = 0;
            int w = ringWritePos_.load(std::memory_order_relaxed);
            ring_[w % kRingSize] = std::move(ev);
            ringWritePos_.store(w + 1, std::memory_order_release);
        });

    proc->prepare(pcm, numSamples, sampleRate, 512);

    {
        std::lock_guard<std::mutex> lk(controlMutex_);
        controlQueue_.push_back({ControlMsg::Op::Add, proc, ""});
    }
}

void AudioEngine::stopSample(const std::string& hash) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    controlQueue_.push_back({ControlMsg::Op::Remove, nullptr, hash});
}

void AudioEngine::stopAll() {
    std::lock_guard<std::mutex> lk(controlMutex_);
    controlQueue_.push_back({ControlMsg::Op::RemoveAll, nullptr, ""});
}

void AudioEngine::onPosition(PositionCallback cb) {
    std::lock_guard<std::mutex> lk(cbMutex_);
    positionCb_ = std::move(cb);
}

void AudioEngine::onEnded(EndedCallback cb) {
    std::lock_guard<std::mutex> lk(cbMutex_);
    endedCb_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// Audio callback (miniaudio audio thread)
// ---------------------------------------------------------------------------
void AudioEngine::audioCallback(ma_device* device, void* output,
                                const void* /*input*/, unsigned int frameCount) {
    auto* self = static_cast<AudioEngine*>(device->pUserData);
    self->processBlock(static_cast<float*>(output), frameCount);
}

void AudioEngine::processBlock(float* output, unsigned int frameCount) {
    // Apply pending control messages
    {
        std::lock_guard<std::mutex> lk(controlMutex_);
        for (auto& msg : controlQueue_) {
            switch (msg.op) {
            case ControlMsg::Op::Add:
                if (static_cast<int>(processors_.size()) < kMaxProcessors)
                    processors_.push_back(msg.processor);
                break;
            case ControlMsg::Op::Remove:
                processors_.erase(
                    std::remove_if(processors_.begin(), processors_.end(),
                                   [&](const auto& p) { return p->hash() == msg.hash; }),
                    processors_.end());
                break;
            case ControlMsg::Op::RemoveAll:
                processors_.clear();
                break;
            }
        }
        controlQueue_.clear();
    }

    // Zero output buffer
    const int numChannels = 2;
    std::memset(output, 0, frameCount * numChannels * sizeof(float));

    // Build per-channel pointers into the interleaved output buffer
    // We use a temporary de-interleaved buffer then mix back
    static thread_local std::vector<float> ch0, ch1;
    ch0.assign(frameCount, 0.f);
    ch1.assign(frameCount, 0.f);
    float* chPtrs[2] = { ch0.data(), ch1.data() };

    // Process each active processor
    for (auto it = processors_.begin(); it != processors_.end(); ) {
        (*it)->process(chPtrs, numChannels, static_cast<int>(frameCount));

        // Emit position telemetry once per block
        {
            TelemetryEvent ev;
            ev.kind              = TelemetryEvent::Kind::Position;
            ev.hash              = (*it)->hash();
            ev.positionInSamples = (*it)->positionInSamples();
            int w = ringWritePos_.load(std::memory_order_relaxed);
            ring_[w % kRingSize] = std::move(ev);
            ringWritePos_.store(w + 1, std::memory_order_release);
        }

        if ((*it)->isFinished()) {
            it = processors_.erase(it);
        } else {
            ++it;
        }
    }

    // Mix de-interleaved back to interleaved output
    float* out = output;
    for (unsigned int f = 0; f < frameCount; ++f) {
        *out++ = ch0[f];
        *out++ = ch1[f];
    }
}

// ---------------------------------------------------------------------------
// Telemetry delivery thread (~60 Hz drain)
// ---------------------------------------------------------------------------
void AudioEngine::telemetryLoop() {
    using namespace std::chrono_literals;
    while (telemetryRunning_.load()) {
        std::this_thread::sleep_for(16ms); // ~60 Hz

        int r = ringReadPos_.load(std::memory_order_acquire);
        int w = ringWritePos_.load(std::memory_order_acquire);

        PositionCallback posCb;
        EndedCallback    endCb;
        {
            std::lock_guard<std::mutex> lk(cbMutex_);
            posCb = positionCb_;
            endCb = endedCb_;
        }

        while (r != w) {
            const TelemetryEvent& ev = ring_[r % kRingSize];
            if (ev.kind == TelemetryEvent::Kind::Position) {
                if (posCb) posCb(ev.hash, ev.positionInSamples);
            } else {
                if (endCb) endCb(ev.hash);
            }
            ++r;
        }
        ringReadPos_.store(r, std::memory_order_release);
    }
}
