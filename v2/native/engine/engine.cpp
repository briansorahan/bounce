#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

#include "engine.h"

#include <atomic>
#include <cstring>
#include <memory>
#include <mutex>
#include <vector>

static struct EngineState {
    ma_device device;
    bool deviceInited = false;

    std::shared_ptr<const std::vector<float>> audioData;
    std::atomic<int> channels{0};
    std::atomic<int> sampleRate{0};
    std::atomic<long long> totalFrames{0};

    std::atomic<long long> position{0};
    std::atomic<bool> playing{false};

    std::mutex loadMutex;
} g_engine;

static void data_callback(ma_device* pDevice, void* pOutput, const void* /*pInput*/, ma_uint32 frameCount) {
    auto* out = static_cast<float*>(pOutput);
    const int ch = static_cast<int>(pDevice->playback.channels);

    if (ch <= 0) {
        return;
    }

    if (!g_engine.playing.load(std::memory_order_relaxed)) {
        std::memset(out, 0, frameCount * ch * sizeof(float));
        return;
    }

    auto audioData = std::atomic_load_explicit(&g_engine.audioData, std::memory_order_acquire);
    if (!audioData || audioData->empty()) {
        std::memset(out, 0, frameCount * ch * sizeof(float));
        g_engine.playing.store(false, std::memory_order_relaxed);
        g_engine.position.store(0, std::memory_order_relaxed);
        return;
    }

    long long pos = g_engine.position.load(std::memory_order_relaxed);
    long long total = static_cast<long long>(audioData->size() / static_cast<size_t>(ch));

    long long framesToCopy = static_cast<long long>(frameCount);
    if (pos + framesToCopy > total) {
        framesToCopy = total - pos;
    }

    if (framesToCopy <= 0) {
        std::memset(out, 0, frameCount * ch * sizeof(float));
        g_engine.playing.store(false, std::memory_order_relaxed);
        return;
    }

    std::memcpy(out, audioData->data() + pos * ch,
                static_cast<size_t>(framesToCopy) * ch * sizeof(float));

    if (framesToCopy < static_cast<long long>(frameCount)) {
        std::memset(out + framesToCopy * ch, 0,
                    (frameCount - framesToCopy) * ch * sizeof(float));
    }

    g_engine.position.store(pos + framesToCopy, std::memory_order_relaxed);
}

extern "C" {

int engine_init(int use_null_backend) {
    if (g_engine.deviceInited) return 0;

    ma_device_config cfg = ma_device_config_init(ma_device_type_playback);
    cfg.playback.format   = ma_format_f32;
    cfg.playback.channels = 2;
    cfg.sampleRate        = 0; // device default
    cfg.dataCallback      = data_callback;
    cfg.pUserData         = nullptr;

    ma_result result;
    if (use_null_backend) {
        ma_backend backends[] = { ma_backend_null };
        result = ma_device_init_ex(backends, 1, nullptr, &cfg, &g_engine.device);
    } else {
        result = ma_device_init(nullptr, &cfg, &g_engine.device);
    }

    if (result != MA_SUCCESS) return -1;

    if (ma_device_start(&g_engine.device) != MA_SUCCESS) {
        ma_device_uninit(&g_engine.device);
        return -2;
    }

    g_engine.deviceInited = true;
    g_engine.sampleRate.store(static_cast<int>(g_engine.device.sampleRate), std::memory_order_relaxed);
    g_engine.channels.store(2, std::memory_order_relaxed);
    return 0;
}

void engine_shutdown(void) {
    if (!g_engine.deviceInited) return;

    g_engine.playing.store(false);
    ma_device_stop(&g_engine.device);
    ma_device_uninit(&g_engine.device);
    g_engine.deviceInited = false;

    std::lock_guard<std::mutex> lock(g_engine.loadMutex);
    std::atomic_store_explicit(&g_engine.audioData, std::shared_ptr<const std::vector<float>>{}, std::memory_order_release);
    g_engine.totalFrames.store(0, std::memory_order_relaxed);
    g_engine.sampleRate.store(0, std::memory_order_relaxed);
    g_engine.channels.store(0, std::memory_order_relaxed);
    g_engine.position.store(0, std::memory_order_relaxed);
}

int engine_load(const char* path) {
    if (!path) return -1;

    // Resample to the device's sample rate so playback is at correct pitch.
    ma_uint32 deviceRate = g_engine.deviceInited ? g_engine.device.sampleRate : 0;
    ma_decoder_config decoderConfig = ma_decoder_config_init(ma_format_f32, 2, deviceRate);
    ma_decoder decoder;

    if (ma_decoder_init_file(path, &decoderConfig, &decoder) != MA_SUCCESS) {
        return -1;
    }

    ma_uint64 frameCount;
    if (ma_decoder_get_length_in_pcm_frames(&decoder, &frameCount) != MA_SUCCESS) {
        ma_decoder_uninit(&decoder);
        return -2;
    }

    std::vector<float> data(static_cast<size_t>(frameCount * 2));
    ma_uint64 framesRead;
    if (ma_decoder_read_pcm_frames(&decoder, data.data(), frameCount, &framesRead) != MA_SUCCESS) {
        ma_decoder_uninit(&decoder);
        return -3;
    }
    data.resize(static_cast<size_t>(framesRead * 2));

    // Capture sample rate before uninit to avoid use-after-free.
    int fileSampleRate = static_cast<int>(decoder.outputSampleRate);
    ma_decoder_uninit(&decoder);

    auto loadedData = std::make_shared<const std::vector<float>>(std::move(data));

    {
        std::lock_guard<std::mutex> lock(g_engine.loadMutex);
        g_engine.playing.store(false, std::memory_order_relaxed);
        std::atomic_store_explicit(&g_engine.audioData, loadedData, std::memory_order_release);
        g_engine.totalFrames.store(static_cast<long long>(framesRead), std::memory_order_relaxed);
        g_engine.channels.store(2, std::memory_order_relaxed);
        g_engine.sampleRate.store(fileSampleRate, std::memory_order_relaxed);
        g_engine.position.store(0, std::memory_order_relaxed);
    }

    return 0;
}

int engine_play(void) {
    if (!g_engine.deviceInited) return -1;
    if (g_engine.totalFrames.load(std::memory_order_relaxed) == 0) return -2;
    g_engine.playing.store(true, std::memory_order_relaxed);
    return 0;
}

int engine_stop(void) {
    g_engine.playing.store(false, std::memory_order_relaxed);
    g_engine.position.store(0, std::memory_order_relaxed);
    return 0;
}

int engine_is_playing(void) {
    return g_engine.playing.load(std::memory_order_relaxed) ? 1 : 0;
}

long long engine_position(void) {
    return g_engine.position.load(std::memory_order_relaxed);
}

int engine_sample_rate(void) {
    return g_engine.sampleRate.load(std::memory_order_relaxed);
}

int engine_channels(void) {
    return g_engine.channels.load(std::memory_order_relaxed);
}

long long engine_total_frames(void) {
    return g_engine.totalFrames.load(std::memory_order_relaxed);
}

} // extern "C"
