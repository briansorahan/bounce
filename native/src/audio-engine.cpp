#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

#include "audio-engine.h"
#include "sample-playback-engine.h"
#include "sampler-instrument.h"

#include <algorithm>
#include <chrono>
#include <cmath>
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

    schedulerRunning_.store(true, std::memory_order_release);
    schedulerThread_ = std::thread([this] { schedulerLoop(); });

    if (deviceInfoCb_)
        deviceInfoCb_(static_cast<int>(device_->sampleRate),
                      static_cast<int>(device_->playback.internalPeriodSizeInFrames));

    return true;
}

void AudioEngine::stop() {
    schedulerRunning_.store(false, std::memory_order_release);
    if (schedulerThread_.joinable()) schedulerThread_.join();

    if (deviceRunning_) {
        ma_device_stop(device_.get());
        deviceRunning_ = false;
    }
    device_.reset();

    telemetryRunning_.store(false);
    // Detach rather than join — avoids blocking if the process is exiting
    // and the thread hasn't woken from its sleep yet.
    if (telemetryThread_.joinable()) telemetryThread_.detach();
}

// ---------------------------------------------------------------------------
// Control API (called from JS / utility-process thread)
// ---------------------------------------------------------------------------
void AudioEngine::play(const std::string& hash, const float* pcm,
                       int numSamples, double sampleRate, bool loop,
                       double loopStartSec, double loopEndSec) {
    int loopStartSample = static_cast<int>(loopStartSec * sampleRate);
    int loopEndSample   = loopEndSec < 0.0
                          ? -1
                          : static_cast<int>(loopEndSec * sampleRate);
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
        },
        loopStartSample, loopEndSample);

    proc->prepare(pcm, numSamples, sampleRate, 512);

    {
        std::lock_guard<std::mutex> lk(controlMutex_);
        ControlMsg msg;
        msg.op = ControlMsg::Op::Add;
        msg.processor = proc;
        controlQueue_.push_back(std::move(msg));
    }
}

void AudioEngine::stopSample(const std::string& hash) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::Remove;
    msg.hash = hash;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::stopAll() {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::RemoveAll;
    controlQueue_.push_back(std::move(msg));
}

// ---------------------------------------------------------------------------
// Instrument API (called from JS / utility-process thread)
// ---------------------------------------------------------------------------
void AudioEngine::defineInstrument(const std::string& id,
                                   const std::string& kind, int polyphony) {
    std::shared_ptr<Instrument> inst;
    if (kind == "sampler") {
        inst = std::make_shared<SamplerInstrument>(id, polyphony);
    }
    if (!inst) return;

    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::DefineInstrument;
    msg.instrument = std::move(inst);
    msg.instrumentId = id;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::freeInstrument(const std::string& id) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::FreeInstrument;
    msg.instrumentId = id;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::loadInstrumentSample(const std::string& instrumentId,
                                       int note, std::vector<float> pcm,
                                       double sampleRate,
                                       const std::string& sampleHash,
                                       bool loop,
                                       double loopStartSec, double loopEndSec) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::InstrumentLoadSample;
    msg.instrumentId = instrumentId;
    msg.note = note;
    msg.pcm = std::move(pcm);
    msg.sampleRate = sampleRate;
    msg.sampleHash = sampleHash;
    msg.loop = loop;
    msg.loopStartSec = loopStartSec;
    msg.loopEndSec = loopEndSec;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::instrumentNoteOn(const std::string& instrumentId,
                                   int note, float velocity) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::InstrumentNoteOn;
    msg.instrumentId = instrumentId;
    msg.note = note;
    msg.velocity = velocity;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::instrumentNoteOff(const std::string& instrumentId,
                                    int note) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::InstrumentNoteOff;
    msg.instrumentId = instrumentId;
    msg.note = note;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::instrumentStopAll(const std::string& instrumentId) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::InstrumentStopAll;
    msg.instrumentId = instrumentId;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::setInstrumentParam(const std::string& instrumentId,
                                     int paramId, float value) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::InstrumentSetParam;
    msg.instrumentId = instrumentId;
    msg.paramId = paramId;
    msg.paramValue = value;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::subscribeInstrumentTelemetry(const std::string& instrumentId) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::SubscribeTelemetry;
    msg.instrumentId = instrumentId;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::unsubscribeInstrumentTelemetry(const std::string& instrumentId) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::UnsubscribeTelemetry;
    msg.instrumentId = instrumentId;
    controlQueue_.push_back(std::move(msg));
}

// ---------------------------------------------------------------------------
// Mixer API (called from JS / utility-process thread)
// ---------------------------------------------------------------------------
void AudioEngine::mixerSetChannelGain(int channelIndex, float gainDb) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetChannelGain;
    msg.channelIndex = channelIndex;
    msg.paramValue = gainDb;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerSetChannelPan(int channelIndex, float pan) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetChannelPan;
    msg.channelIndex = channelIndex;
    msg.paramValue = pan;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerSetChannelMute(int channelIndex, bool mute) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetChannelMute;
    msg.channelIndex = channelIndex;
    msg.paramValue = mute ? 1.f : 0.f;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerSetChannelSolo(int channelIndex, bool solo) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetChannelSolo;
    msg.channelIndex = channelIndex;
    msg.paramValue = solo ? 1.f : 0.f;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerAttachInstrument(int channelIndex,
                                         const std::string& instrumentId) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerAttachInstrument;
    msg.channelIndex = channelIndex;
    msg.instrumentId = instrumentId;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerDetachChannel(int channelIndex) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerDetachChannel;
    msg.channelIndex = channelIndex;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerSetMasterGain(float gainDb) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetMasterGain;
    msg.paramValue = gainDb;
    controlQueue_.push_back(std::move(msg));
}

void AudioEngine::mixerSetMasterMute(bool mute) {
    std::lock_guard<std::mutex> lk(controlMutex_);
    ControlMsg msg;
    msg.op = ControlMsg::Op::MixerSetMasterMute;
    msg.paramValue = mute ? 1.f : 0.f;
    controlQueue_.push_back(std::move(msg));
}

Instrument* AudioEngine::findInstrument(const std::string& id) {
    for (auto& inst : instruments_) {
        if (inst->id() == id) return inst.get();
    }
    return nullptr;
}

void AudioEngine::setupInstrumentTelemetry(Instrument* inst) {
    inst->setTelemetryWriters(
        [this](const std::string& hash, int pos) {
            TelemetryEvent ev;
            ev.kind = TelemetryEvent::Kind::Position;
            ev.hash = hash;
            ev.positionInSamples = pos;
            int w = ringWritePos_.load(std::memory_order_relaxed);
            ring_[w % kRingSize] = std::move(ev);
            ringWritePos_.store(w + 1, std::memory_order_release);
        },
        [this](const std::string& hash) {
            TelemetryEvent ev;
            ev.kind = TelemetryEvent::Kind::Ended;
            ev.hash = hash;
            ev.positionInSamples = 0;
            int w = ringWritePos_.load(std::memory_order_relaxed);
            ring_[w % kRingSize] = std::move(ev);
            ringWritePos_.store(w + 1, std::memory_order_release);
        }
    );
}

void AudioEngine::onPosition(PositionCallback cb) {
    std::lock_guard<std::mutex> lk(cbMutex_);
    positionCb_ = std::move(cb);
}

void AudioEngine::onEnded(EndedCallback cb) {
    std::lock_guard<std::mutex> lk(cbMutex_);
    endedCb_ = std::move(cb);
}

void AudioEngine::onMixerLevels(MeterLevelsCallback cb) {
    std::lock_guard<std::mutex> lk(cbMutex_);
    meterLevelsCb_ = std::move(cb);
}

// ---------------------------------------------------------------------------
// Transport API (called from JS / utility-process thread)
// ---------------------------------------------------------------------------
void AudioEngine::transportStart() {
    ControlMsg msg; msg.op = ControlMsg::Op::TransportStart;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}

void AudioEngine::transportStop() {
    ControlMsg msg; msg.op = ControlMsg::Op::TransportStop;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}

void AudioEngine::transportSetBpm(double bpm) {
    ControlMsg msg; msg.op = ControlMsg::Op::TransportSetBpm; msg.transportBpm = bpm;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}

void AudioEngine::transportSetPattern(std::shared_ptr<PatternData> pattern) {
    ControlMsg msg; msg.op = ControlMsg::Op::TransportSetPattern; msg.patternData = std::move(pattern);
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}

void AudioEngine::transportClearPattern(int channelIndex) {
    ControlMsg msg; msg.op = ControlMsg::Op::TransportClearPattern; msg.channelIndex = channelIndex;
    std::lock_guard<std::mutex> lk(transportMutex_);
    transportControlQueue_.push_back(std::move(msg));
}

void AudioEngine::onTransportTick(std::function<void(int, int, int, int)> cb) {
    tickCb_ = std::move(cb);
}

void AudioEngine::onDeviceInfo(std::function<void(int, int)> cb) {
    deviceInfoCb_ = std::move(cb);
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
            case ControlMsg::Op::DefineInstrument:
                if (msg.instrument) {
                    setupInstrumentTelemetry(msg.instrument.get());
                    instruments_.push_back(std::move(msg.instrument));
                }
                break;
            case ControlMsg::Op::FreeInstrument:
                // Also clear any channel attachment pointing at this instrument
                for (auto& ch : channels_) {
                    if (ch.attachedInstrumentId == msg.instrumentId)
                        ch.attachedInstrumentId.clear();
                }
                instruments_.erase(
                    std::remove_if(instruments_.begin(), instruments_.end(),
                                   [&](const auto& i) { return i->id() == msg.instrumentId; }),
                    instruments_.end());
                break;
            case ControlMsg::Op::InstrumentNoteOn:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->noteOn(msg.note, msg.velocity);
                break;
            case ControlMsg::Op::InstrumentNoteOff:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->noteOff(msg.note);
                break;
            case ControlMsg::Op::InstrumentStopAll:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->stopAll();
                break;
            case ControlMsg::Op::InstrumentLoadSample:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->loadSample(msg.note, std::move(msg.pcm),
                                     msg.sampleRate, msg.sampleHash,
                                     msg.loop, msg.loopStartSec, msg.loopEndSec);
                break;
            case ControlMsg::Op::InstrumentSetParam:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->setParam(msg.paramId, msg.paramValue);
                break;
            case ControlMsg::Op::SubscribeTelemetry:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->setTelemetryEnabled(true);
                break;
            case ControlMsg::Op::UnsubscribeTelemetry:
                if (auto* inst = findInstrument(msg.instrumentId))
                    inst->setTelemetryEnabled(false);
                break;
            // Mixer ops
            case ControlMsg::Op::MixerSetChannelGain:
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumChannels)
                    channels_[msg.channelIndex].gainDb = msg.paramValue;
                break;
            case ControlMsg::Op::MixerSetChannelPan:
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumUserChannels)
                    channels_[msg.channelIndex].pan = msg.paramValue;
                break;
            case ControlMsg::Op::MixerSetChannelMute:
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumChannels)
                    channels_[msg.channelIndex].mute = (msg.paramValue != 0.f);
                break;
            case ControlMsg::Op::MixerSetChannelSolo:
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumUserChannels)
                    channels_[msg.channelIndex].solo = (msg.paramValue != 0.f);
                break;
            case ControlMsg::Op::MixerAttachInstrument:
                // Clear any prior channel attachment for this instrument
                for (auto& ch : channels_)
                    if (ch.attachedInstrumentId == msg.instrumentId)
                        ch.attachedInstrumentId.clear();
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumUserChannels)
                    channels_[msg.channelIndex].attachedInstrumentId = msg.instrumentId;
                break;
            case ControlMsg::Op::MixerDetachChannel:
                if (msg.channelIndex >= 0 && msg.channelIndex < kNumUserChannels)
                    channels_[msg.channelIndex].attachedInstrumentId.clear();
                break;
            case ControlMsg::Op::MixerSetMasterGain:
                master_.gainDb = msg.paramValue;
                break;
            case ControlMsg::Op::MixerSetMasterMute:
                master_.mute = (msg.paramValue != 0.f);
                break;
            }
        }
        controlQueue_.clear();
    }

    // Drain scheduled events for this block (lock-free SPSC — no mutex)
    {
        const uint64_t blockStart = sampleCounter_.load(std::memory_order_relaxed);
        const uint64_t blockEnd   = blockStart + static_cast<uint64_t>(frameCount);

        uint32_t r = schedReadPos_.load(std::memory_order_acquire);
        uint32_t w = schedWritePos_.load(std::memory_order_acquire);
        while (r != w) {
            const ScheduledEvent& ev = schedRing_[r % kSchedRingSize];
            if (ev.samplePosition >= blockEnd) break;
            switch (ev.type) {
            case ScheduledEvent::Type::TransportStart:
                localTransportRunning_ = true;
                localTransportStart_   = ev.samplePosition;
                break;
            case ScheduledEvent::Type::TransportStop:
                localTransportRunning_ = false;
                break;
            case ScheduledEvent::Type::BpmChange:
                localTransportBpm_ = ev.bpm;
                break;
            case ScheduledEvent::Type::NoteOn:
                if (ev.samplePosition >= blockStart)
                    fireNoteOn(ev.channelIndex, ev.note, ev.velocity);
                break;
            case ScheduledEvent::Type::NoteOff:
                if (ev.samplePosition >= blockStart)
                    fireNoteOff(ev.channelIndex, ev.note);
                break;
            }
            ++r;
            schedReadPos_.store(r, std::memory_order_release);
        }

        sampleCounter_.store(blockEnd, std::memory_order_release);

        // Emit tick telemetry (uses only audio-thread-local transport state)
        if (localTransportRunning_) {
            const double   spt       = sampleRate_ * 60.0 / localTransportBpm_ / 4.0;
            const uint64_t elapsed   = blockStart - localTransportStart_;
            const uint64_t tickBefore = static_cast<uint64_t>(elapsed / spt);
            const uint64_t tickAfter  = static_cast<uint64_t>((elapsed + frameCount) / spt);
            if (tickAfter > tickBefore) {
                const uint64_t t = tickBefore + 1;
                TelemetryEvent tev;
                tev.kind         = TelemetryEvent::Kind::Tick;
                tev.absoluteTick = static_cast<int>(t);
                tev.bar          = static_cast<int>(t / 16);
                tev.beat         = static_cast<int>((t % 16) / 4);
                tev.step         = static_cast<int>(t % 16);
                int w2 = ringWritePos_.load(std::memory_order_relaxed);
                ring_[w2 % kRingSize] = std::move(tev);
                ringWritePos_.store(w2 + 1, std::memory_order_release);
            }
        }
    }

    // Zero the output buffer
    std::memset(output, 0, frameCount * 2 * sizeof(float));

    // Size (or resize) per-channel scratch buffers
    for (int ch = 0; ch < kNumChannels; ++ch) {
        chanBufL_[ch].assign(frameCount, 0.f);
        chanBufR_[ch].assign(frameCount, 0.f);
    }
    masterBufL_.assign(frameCount, 0.f);
    masterBufR_.assign(frameCount, 0.f);

    // Render legacy processors into the preview channel
    {
        float* previewPtrs[2] = { chanBufL_[kPreviewChannelIdx].data(),
                                   chanBufR_[kPreviewChannelIdx].data() };
        for (auto it = processors_.begin(); it != processors_.end(); ) {
            (*it)->process(previewPtrs, 2, static_cast<int>(frameCount));

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
    }

    // Render instruments: attached instruments go to their channel buffer;
    // unattached instruments fall back to the preview channel
    for (auto& inst : instruments_) {
        int targetCh = kPreviewChannelIdx;
        for (int ch = 0; ch < kNumUserChannels; ++ch) {
            if (channels_[ch].attachedInstrumentId == inst->id()) {
                targetCh = ch;
                break;
            }
        }
        float* chPtrs[2] = { chanBufL_[targetCh].data(),
                              chanBufR_[targetCh].data() };
        inst->process(chPtrs, 2, static_cast<int>(frameCount));
    }

    // Solo-in-place: check if any user channel has solo enabled
    bool anySolo = false;
    for (int ch = 0; ch < kNumUserChannels; ++ch) {
        if (channels_[ch].solo) { anySolo = true; break; }
    }

    // Mix each channel into the master bus with gain and pan applied
    for (int ch = 0; ch < kNumChannels; ++ch) {
        const ChannelStrip& strip = channels_[ch];

        // Determine effective mute: explicit mute, or solo-in-place exclusion
        bool effectiveMute = strip.mute;
        if (anySolo && ch < kNumUserChannels && !strip.solo)
            effectiveMute = true;
        if (effectiveMute) continue;

        const float linGain = std::pow(10.f, strip.gainDb / 20.f);

        float leftGain, rightGain;
        if (ch < kNumUserChannels) {
            // Constant-power pan law: theta in [0, pi/2]
            const float theta = (strip.pan + 1.f) * 0.7853982f; // (pan+1)*pi/4
            leftGain  = linGain * std::cos(theta);
            rightGain = linGain * std::sin(theta);
        } else {
            // Preview channel: no pan control
            leftGain = rightGain = linGain;
        }

        for (unsigned int f = 0; f < frameCount; ++f) {
            masterBufL_[f] += chanBufL_[ch][f] * leftGain;
            masterBufR_[f] += chanBufR_[ch][f] * rightGain;
        }
    }

    // Apply master bus gain and write to output
    if (!master_.mute) {
        const float masterGain = std::pow(10.f, master_.gainDb / 20.f);
        float* out = output;
        for (unsigned int f = 0; f < frameCount; ++f) {
            *out++ = masterBufL_[f] * masterGain;
            *out++ = masterBufR_[f] * masterGain;
        }
    }

    // Update peak levels for metering (audio-thread-only writes)
    for (int ch = 0; ch < kNumChannels; ++ch) {
        float pkL = 0.f, pkR = 0.f;
        for (unsigned int f = 0; f < frameCount; ++f) {
            pkL = std::max(pkL, std::abs(chanBufL_[ch][f]));
            pkR = std::max(pkR, std::abs(chanBufR_[ch][f]));
        }
        // Atomic relaxed store — telemetry thread reads these periodically
        float prev = peakL_[ch].load(std::memory_order_relaxed);
        if (pkL > prev) peakL_[ch].store(pkL, std::memory_order_relaxed);
        prev = peakR_[ch].load(std::memory_order_relaxed);
        if (pkR > prev) peakR_[ch].store(pkR, std::memory_order_relaxed);
    }
    {
        const float masterGain = master_.mute ? 0.f : std::pow(10.f, master_.gainDb / 20.f);
        float pkL = 0.f, pkR = 0.f;
        for (unsigned int f = 0; f < frameCount; ++f) {
            pkL = std::max(pkL, std::abs(masterBufL_[f] * masterGain));
            pkR = std::max(pkR, std::abs(masterBufR_[f] * masterGain));
        }
        float prev = masterPeakL_.load(std::memory_order_relaxed);
        if (pkL > prev) masterPeakL_.store(pkL, std::memory_order_relaxed);
        prev = masterPeakR_.load(std::memory_order_relaxed);
        if (pkR > prev) masterPeakR_.store(pkR, std::memory_order_relaxed);
    }
}

// ---------------------------------------------------------------------------
// Telemetry delivery thread (~60 Hz drain)
// ---------------------------------------------------------------------------
void AudioEngine::telemetryLoop() {
    using namespace std::chrono_literals;

    // Peak-hold state (telemetry thread only)
    std::array<float, kNumChannels> holdL{}, holdR{};
    float holdMasterL = 0.f, holdMasterR = 0.f;
    static constexpr int kHoldFrames = 120; // ~2 s at 60 Hz
    std::array<int, kNumChannels> holdCounterL{}, holdCounterR{};
    int holdCounterMasterL = 0, holdCounterMasterR = 0;

    while (telemetryRunning_.load()) {
        std::this_thread::sleep_for(16ms); // ~60 Hz

        int r = ringReadPos_.load(std::memory_order_acquire);
        int w = ringWritePos_.load(std::memory_order_acquire);

        PositionCallback posCb;
        EndedCallback    endCb;
        MeterLevelsCallback meterCb;
        {
            std::lock_guard<std::mutex> lk(cbMutex_);
            posCb   = positionCb_;
            endCb   = endedCb_;
            meterCb = meterLevelsCb_;
        }

        while (r != w) {
            const TelemetryEvent& ev = ring_[r % kRingSize];
            if (ev.kind == TelemetryEvent::Kind::Position) {
                if (posCb) posCb(ev.hash, ev.positionInSamples);
            } else if (ev.kind == TelemetryEvent::Kind::Ended) {
                if (endCb) endCb(ev.hash);
            } else if (ev.kind == TelemetryEvent::Kind::Tick) {
                if (tickCb_) tickCb_(ev.absoluteTick, ev.bar, ev.beat, ev.step);
            }
            ++r;
        }
        ringReadPos_.store(r, std::memory_order_release);

        if (meterCb) {
            // Swap-and-reset peaks atomically
            std::array<float, kNumChannels> rawL{}, rawR{};
            for (int ch = 0; ch < kNumChannels; ++ch) {
                rawL[ch] = peakL_[ch].exchange(0.f, std::memory_order_relaxed);
                rawR[ch] = peakR_[ch].exchange(0.f, std::memory_order_relaxed);
            }
            float rawML = masterPeakL_.exchange(0.f, std::memory_order_relaxed);
            float rawMR = masterPeakR_.exchange(0.f, std::memory_order_relaxed);

            // Apply peak hold
            std::array<float, kNumChannels> outL{}, outR{};
            for (int ch = 0; ch < kNumChannels; ++ch) {
                if (rawL[ch] >= holdL[ch]) { holdL[ch] = rawL[ch]; holdCounterL[ch] = kHoldFrames; }
                else if (holdCounterL[ch] > 0) --holdCounterL[ch];
                else holdL[ch] = rawL[ch];
                outL[ch] = holdL[ch];

                if (rawR[ch] >= holdR[ch]) { holdR[ch] = rawR[ch]; holdCounterR[ch] = kHoldFrames; }
                else if (holdCounterR[ch] > 0) --holdCounterR[ch];
                else holdR[ch] = rawR[ch];
                outR[ch] = holdR[ch];
            }
            if (rawML >= holdMasterL) { holdMasterL = rawML; holdCounterMasterL = kHoldFrames; }
            else if (holdCounterMasterL > 0) --holdCounterMasterL;
            else holdMasterL = rawML;

            if (rawMR >= holdMasterR) { holdMasterR = rawMR; holdCounterMasterR = kHoldFrames; }
            else if (holdCounterMasterR > 0) --holdCounterMasterR;
            else holdMasterR = rawMR;

            meterCb(outL, outR, holdMasterL, holdMasterR);
        }
    }
}

// ---------------------------------------------------------------------------
// Transport helpers (audio-thread only)
// ---------------------------------------------------------------------------
void AudioEngine::fireNoteOn(int channelIndex, uint8_t note, float velocity) {
    if (channelIndex < 0 || channelIndex >= kNumChannels) return;
    for (auto& inst : instruments_)
        if (channels_[channelIndex].attachedInstrumentId == inst->id()) {
            inst->noteOn(static_cast<int>(note), velocity);
            return;
        }
}

void AudioEngine::fireNoteOff(int channelIndex, uint8_t note) {
    if (channelIndex < 0 || channelIndex >= kNumChannels) return;
    for (auto& inst : instruments_)
        if (channels_[channelIndex].attachedInstrumentId == inst->id()) {
            inst->noteOff(static_cast<int>(note));
            return;
        }
}

// ---------------------------------------------------------------------------
// Scheduler thread (~4-block lookahead)
// ---------------------------------------------------------------------------
void AudioEngine::schedulerLoop() {
    constexpr int kLookaheadBlocks  = 10;
    constexpr int kNominalBlockSize = 512;

    while (schedulerRunning_.load(std::memory_order_acquire)) {
        std::this_thread::sleep_for(
            std::chrono::microseconds(
                static_cast<int>(4.0 * kNominalBlockSize / sampleRate_ * 1e6)));

        // Step 1: drain transport control queue
        {
            std::vector<ControlMsg> incoming;
            {
                std::lock_guard<std::mutex> lk(transportMutex_);
                incoming.swap(transportControlQueue_);
            }
            for (auto& msg : incoming) {
                switch (msg.op) {
                case ControlMsg::Op::TransportStart: {
                    schedulerData_.startSampleCount =
                        sampleCounter_.load(std::memory_order_acquire);
                    schedulerData_.running = true;
                    scheduledUpTo_.store(schedulerData_.startSampleCount,
                                        std::memory_order_release);
                    for (auto& [ch, pd] : schedulerData_.activePatterns)
                        if (pd->scheduledBar < 0) pd->scheduledBar = 0;
                    // Push TransportStart event to audio thread via ring
                    uint32_t sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        schedulerData_.startSampleCount,
                        ScheduledEvent::Type::TransportStart,
                        0, 0, 0.f, 0.0};
                    schedWritePos_.store(sw + 1, std::memory_order_release);
                    break;
                }
                case ControlMsg::Op::TransportStop: {
                    schedulerData_.running = false;
                    const uint64_t stopSample =
                        sampleCounter_.load(std::memory_order_acquire);
                    uint32_t sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        stopSample, ScheduledEvent::Type::TransportStop,
                        0, 0, 0.f, 0.0};
                    schedWritePos_.store(sw + 1, std::memory_order_release);
                    break;
                }
                case ControlMsg::Op::TransportSetBpm: {
                    schedulerData_.bpm = msg.transportBpm;
                    const uint64_t changeSample =
                        sampleCounter_.load(std::memory_order_acquire);
                    scheduledUpTo_.store(changeSample, std::memory_order_release);
                    uint32_t sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        changeSample, ScheduledEvent::Type::BpmChange,
                        0, 0, 0.f, msg.transportBpm};
                    schedWritePos_.store(sw + 1, std::memory_order_release);
                    break;
                }
                case ControlMsg::Op::TransportSetPattern: {
                    auto pd = msg.patternData;
                    if (schedulerData_.running) {
                        const double spt =
                            sampleRate_ * 60.0 / schedulerData_.bpm / 4.0;
                        const uint64_t elapsed =
                            sampleCounter_.load(std::memory_order_relaxed)
                            - schedulerData_.startSampleCount;
                        pd->scheduledBar =
                            static_cast<int>(elapsed / (spt * 16)) + 1;
                    } else {
                        pd->scheduledBar = 0;
                    }
                    schedulerData_.activePatterns[pd->channelIndex] = pd;
                    scheduledUpTo_.store(
                        sampleCounter_.load(std::memory_order_acquire),
                        std::memory_order_release);
                    break;
                }
                case ControlMsg::Op::TransportClearPattern:
                    schedulerData_.activePatterns.erase(msg.channelIndex);
                    break;
                default: break;
                }
            }
        }

        // Step 2: compute events for lookahead window
        if (!schedulerData_.running || schedulerData_.activePatterns.empty()) continue;

        const double   spt         = sampleRate_ * 60.0 / schedulerData_.bpm / 4.0;
        const uint64_t now         = sampleCounter_.load(std::memory_order_acquire);
        const uint64_t lookaheadEnd =
            now + static_cast<uint64_t>(kLookaheadBlocks * kNominalBlockSize);
        const uint64_t upTo = scheduledUpTo_.load(std::memory_order_relaxed);
        if (lookaheadEnd <= upTo) continue;

        const uint64_t startSample = schedulerData_.startSampleCount;
        const uint64_t startTick =
            static_cast<uint64_t>(
                (upTo > startSample ? upTo - startSample : 0) / spt);
        const uint64_t endTick =
            static_cast<uint64_t>((lookaheadEnd - startSample) / spt);

        for (uint64_t tick = startTick; tick <= endTick; ++tick) {
            const int      bar        = static_cast<int>(tick / 16);
            const uint64_t tickSample = startSample + static_cast<uint64_t>(tick * spt);

            for (auto& [ch, pd] : schedulerData_.activePatterns) {
                if (bar < pd->scheduledBar) continue;
                const int patStep =
                    static_cast<int>(
                        (tick - static_cast<uint64_t>(pd->scheduledBar * 16)) % 16);
                for (auto& [note, vel] : pd->steps[patStep].events) {
                    uint32_t sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        tickSample, ScheduledEvent::Type::NoteOn,
                        ch, note, vel / 127.f, 0.0};
                    schedWritePos_.store(sw + 1, std::memory_order_release);

                    const uint64_t offSample =
                        startSample + static_cast<uint64_t>((tick + 1) * spt);
                    sw = schedWritePos_.load(std::memory_order_relaxed);
                    schedRing_[sw % kSchedRingSize] = {
                        offSample, ScheduledEvent::Type::NoteOff,
                        ch, note, 0.f, 0.0};
                    schedWritePos_.store(sw + 1, std::memory_order_release);
                }
            }
        }
        scheduledUpTo_.store(lookaheadEnd, std::memory_order_release);
    }
}
