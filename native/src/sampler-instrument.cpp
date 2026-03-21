#include "sampler-instrument.h"

#include <algorithm>
#include <cstring>

SamplerInstrument::SamplerInstrument(std::string id, int polyphony)
    : Instrument(std::move(id), polyphony) {
    voices_.resize(polyphony);
}

void SamplerInstrument::process(float** outputs, int numChannels, int numFrames) {
    for (auto& voice : voices_) {
        if (!voice.active) continue;

        if (volume_ != 1.0f) {
            // Temp buffers for volume scaling
            static thread_local std::vector<float> tmp0, tmp1;
            tmp0.assign(numFrames, 0.f);
            tmp1.assign(numFrames, 0.f);
            float* tmpPtrs[2] = { tmp0.data(), tmp1.data() };

            voice.processor->process(tmpPtrs, numChannels, numFrames);

            for (int f = 0; f < numFrames; ++f) {
                outputs[0][f] += tmp0[f] * volume_;
                if (numChannels > 1) outputs[1][f] += tmp1[f] * volume_;
            }
        } else {
            voice.processor->process(outputs, numChannels, numFrames);
        }

        if (telemetryEnabled_ && posWriter_) {
            posWriter_(voice.processor->hash(),
                       voice.processor->positionInSamples());
        }

        if (voice.processor->isFinished()) {
            if (telemetryEnabled_ && endWriter_) {
                endWriter_(voice.processor->hash());
            }
            voice.active = false;
        }
    }
}

void SamplerInstrument::noteOn(int note, float velocity) {
    auto it = samples_.find(note);
    if (it == samples_.end()) return;

    Voice* voice = allocateVoice();
    if (!voice) return;

    const auto& sample = it->second;
    voice->processor = std::make_unique<SamplePlaybackEngine>(
        sample.hash, sample.loop, nullptr);
    voice->processor->prepare(sample.pcm.data(),
                              static_cast<int>(sample.pcm.size()),
                              sample.sampleRate, 512);
    voice->note = note;
    voice->velocity = velocity;
    voice->active = true;
}

void SamplerInstrument::noteOff(int note) {
    for (auto& voice : voices_) {
        if (voice.active && voice.note == note) {
            voice.active = false;
        }
    }
}

void SamplerInstrument::stopAll() {
    for (auto& voice : voices_) {
        voice.active = false;
    }
}

void SamplerInstrument::loadSample(int note, std::vector<float> pcm,
                                   double sampleRate,
                                   const std::string& sampleHash,
                                   bool loop) {
    SampleData data;
    data.pcm = std::move(pcm);
    data.sampleRate = sampleRate;
    data.hash = sampleHash;
    data.loop = loop;
    samples_[note] = std::move(data);
}

void SamplerInstrument::setParam(int paramId, float value) {
    switch (static_cast<Param>(paramId)) {
    case Param::Volume:
        volume_ = std::max(0.0f, value);
        break;
    }
}

int SamplerInstrument::activeVoiceCount() const {
    int count = 0;
    for (const auto& voice : voices_) {
        if (voice.active) ++count;
    }
    return count;
}

SamplerInstrument::Voice* SamplerInstrument::allocateVoice() {
    // Prefer an inactive voice
    for (auto& voice : voices_) {
        if (!voice.active) return &voice;
    }
    // All active — steal via round-robin
    Voice* stolen = &voices_[nextVoiceIndex_];
    nextVoiceIndex_ = (nextVoiceIndex_ + 1) % polyphony_;
    return stolen;
}
