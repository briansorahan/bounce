#include "granular-instrument.h"

#include <algorithm>
#include <cmath>
#include <random>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

GranularInstrument::GranularInstrument(std::string id, int polyphony, double sampleRate)
    : Instrument(std::move(id), polyphony)
    , engineSampleRate_(sampleRate)
    , rng_(std::random_device{}())
{
    streams_.resize(polyphony);

    windowLut_.resize(1024);
    for (int i = 0; i < 1024; ++i)
        windowLut_[i] = 0.5f * (1.0f - std::cos(2.0f * static_cast<float>(M_PI) * i / 1023.0f));
}

void GranularInstrument::loadSample(int /*note*/, std::vector<float> pcm,
                                    double sampleRate, const std::string& sampleHash,
                                    bool /*loop*/,
                                    double /*loopStartSec*/, double /*loopEndSec*/) {
    sourcePcm_        = std::move(pcm);
    sourceSampleRate_ = sampleRate;
    sourceHash_       = sampleHash;
}

void GranularInstrument::noteOn(int note, float velocity) {
    GrainStream* target = nullptr;

    for (auto& s : streams_) {
        if (!s.active && !s.draining) {
            target = &s;
            break;
        }
    }

    if (!target) {
        target = &streams_[note % polyphony_];
    }

    target->active               = true;
    target->draining             = false;
    target->velocity             = velocity;
    target->triggerNote          = note;
    target->samplesUntilNextGrain = 0.0;

    for (auto& g : target->grains)
        g.active = false;
}

void GranularInstrument::noteOff(int note) {
    for (auto& s : streams_) {
        if (s.active && s.triggerNote == note) {
            s.active   = false;
            s.draining = true;
            break;
        }
    }
}

void GranularInstrument::stopAll() {
    for (auto& s : streams_) {
        s.active   = false;
        s.draining = false;
        for (auto& g : s.grains)
            g.active = false;
    }
}

void GranularInstrument::trySpawnGrain(GrainStream& stream) {
    if (sourcePcm_.empty()) return;

    Grain* slot = nullptr;
    for (auto& g : stream.grains) {
        if (!g.active) { slot = &g; break; }
    }
    if (!slot) return;

    const auto srcSize = static_cast<double>(sourcePcm_.size());

    double positionSamples = position_ * srcSize
        + scatter_ * srcSize * scatterDist_(rng_);
    positionSamples = std::max(0.0, std::min(positionSamples, srcSize - 1.0));

    int grainLengthSamples = static_cast<int>(grainSizeMs_ / 1000.0 * sourceSampleRate_);
    if (grainLengthSamples < 1) grainLengthSamples = 1;

    float envelopePhaseInc = 1.0f / (grainSizeMs_ / 1000.0f * static_cast<float>(engineSampleRate_));

    float playbackRate = pitch_ * static_cast<float>(sourceSampleRate_ / engineSampleRate_);

    slot->readPos          = positionSamples;
    slot->grainLength      = grainLengthSamples;
    slot->envelopePhase    = 0.0f;
    slot->envelopePhaseInc = envelopePhaseInc;
    slot->playbackRate     = playbackRate;
    slot->active           = true;
}

void GranularInstrument::process(float** outputs, int numChannels, int numFrames) {
    if (sourcePcm_.empty()) return;

    const int srcLast = static_cast<int>(sourcePcm_.size()) - 1;

    for (auto& stream : streams_) {
        if (!stream.active && !stream.draining) continue;

        if (stream.active) {
            stream.samplesUntilNextGrain -= static_cast<double>(numFrames);
            while (stream.samplesUntilNextGrain <= 0.0) {
                trySpawnGrain(stream);
                double interval = engineSampleRate_ / density_;
                float jitter = scatter_ * 0.1f * static_cast<float>(interval) * scatterDist_(rng_);
                stream.samplesUntilNextGrain += interval + static_cast<double>(jitter);
            }
        }

        for (auto& grain : stream.grains) {
            if (!grain.active) continue;

            for (int i = 0; i < numFrames; ++i) {
                float envelopePhase = grain.envelopePhase + static_cast<float>(i) * grain.envelopePhaseInc;
                if (envelopePhase >= 1.0f) {
                    grain.active = false;
                    break;
                }

                float lutPos  = envelopePhase * 1023.0f;
                int   lutIdx  = static_cast<int>(lutPos);
                float lutFrac = lutPos - static_cast<float>(lutIdx);
                float window  = windowLut_[lutIdx] * (1.0f - lutFrac)
                              + windowLut_[std::min(lutIdx + 1, 1023)] * lutFrac;

                double readPos = grain.readPos + static_cast<double>(i) * grain.playbackRate;
                if (readPos >= static_cast<double>(srcLast)) {
                    grain.active = false;
                    break;
                }

                int   srcIdx  = static_cast<int>(readPos);
                float srcFrac = static_cast<float>(readPos - static_cast<double>(srcIdx));
                float sample  = sourcePcm_[srcIdx] * (1.0f - srcFrac)
                              + sourcePcm_[srcIdx + 1] * srcFrac;

                float out = sample * window * stream.velocity * volume_;
                for (int ch = 0; ch < numChannels; ++ch)
                    outputs[ch][i] += out;
            }

            if (grain.active) {
                grain.readPos        += static_cast<double>(numFrames) * grain.playbackRate;
                grain.envelopePhase  += static_cast<float>(numFrames) * grain.envelopePhaseInc;
                if (grain.envelopePhase >= 1.0f)
                    grain.active = false;
            }
        }

        if (stream.draining) {
            bool anyActive = false;
            for (const auto& g : stream.grains)
                if (g.active) { anyActive = true; break; }
            if (!anyActive)
                stream.draining = false;
        }
    }
}

void GranularInstrument::setParam(int paramId, float value) {
    switch (static_cast<Param>(paramId)) {
    case Param::Position:
        position_ = std::max(0.0f, std::min(value, 1.0f));
        break;
    case Param::GrainSize:
        grainSizeMs_ = std::max(1.0f, std::min(value, 1000.0f));
        break;
    case Param::Density:
        density_ = std::max(0.1f, std::min(value, 200.0f));
        break;
    case Param::Scatter:
        scatter_ = std::max(0.0f, std::min(value, 1.0f));
        break;
    case Param::Envelope:
        envelopeType_ = std::max(0, std::min(static_cast<int>(value), 3));
        break;
    case Param::Pitch:
        pitch_ = std::max(0.25f, std::min(value, 4.0f));
        break;
    case Param::Volume:
        volume_ = std::max(0.0f, std::min(value, 2.0f));
        break;
    }
}

int GranularInstrument::activeVoiceCount() const {
    int count = 0;
    for (const auto& s : streams_)
        if (s.active || s.draining) ++count;
    return count;
}
