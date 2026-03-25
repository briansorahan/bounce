#include "midi-file-parser.h"
#include <algorithm>
#include <fstream>
#include <stdexcept>

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------
static uint16_t readU16BE(const uint8_t* p) {
    return static_cast<uint16_t>((p[0] << 8) | p[1]);
}

static uint32_t readU32BE(const uint8_t* p) {
    return (static_cast<uint32_t>(p[0]) << 24) |
           (static_cast<uint32_t>(p[1]) << 16) |
           (static_cast<uint32_t>(p[2]) <<  8) |
            static_cast<uint32_t>(p[3]);
}

// Variable-length quantity decode.  Advances `pos` past the value.
static uint32_t readVLQ(const uint8_t* data, size_t size, size_t& pos) {
    uint32_t value = 0;
    for (int i = 0; i < 4; ++i) {
        if (pos >= size) throw std::runtime_error("Unexpected end of MIDI track data");
        uint8_t b = data[pos++];
        value = (value << 7) | (b & 0x7F);
        if (!(b & 0x80)) break;
    }
    return value;
}

// ---------------------------------------------------------------------------
// Tempo map helpers
// ---------------------------------------------------------------------------
using TempoPoint = std::pair<uint64_t /*tick*/, uint32_t /*µs per beat*/>;

static double ticksToMs(uint64_t ticks, const std::vector<TempoPoint>& tempoMap, int ppq) {
    double ms = 0.0;
    uint64_t lastTick = 0;
    uint32_t currentTempo = 500000; // default: 120 BPM
    for (const auto& [mapTick, mapTempo] : tempoMap) {
        if (mapTick >= ticks) break;
        ms += static_cast<double>(mapTick - lastTick) / ppq * currentTempo / 1000.0;
        lastTick = mapTick;
        currentTempo = mapTempo;
    }
    ms += static_cast<double>(ticks - lastTick) / ppq * currentTempo / 1000.0;
    return ms;
}

// ---------------------------------------------------------------------------
// Single-track parsers
// ---------------------------------------------------------------------------

// First pass: collect tempo-change meta events from a track chunk.
static void collectTempos(const uint8_t* track, size_t size,
                          std::vector<TempoPoint>& tempoMap) {
    size_t pos = 0;
    uint64_t tick = 0;
    while (pos < size) {
        tick += readVLQ(track, size, pos);
        if (pos >= size) break;
        uint8_t b = track[pos];
        if (b == 0xFF) {
            // Meta event
            ++pos;
            if (pos >= size) break;
            uint8_t metaType = track[pos++];
            uint32_t len = readVLQ(track, size, pos);
            if (metaType == 0x51 && len == 3 && pos + 3 <= size) {
                uint32_t us = (static_cast<uint32_t>(track[pos])     << 16) |
                              (static_cast<uint32_t>(track[pos + 1]) <<  8) |
                               static_cast<uint32_t>(track[pos + 2]);
                tempoMap.push_back({tick, us});
            }
            pos += len;
        } else if (b == 0xF0 || b == 0xF7) {
            ++pos;
            pos += readVLQ(track, size, pos);
        } else {
            // MIDI event (with running-status awareness — skip bytes)
            uint8_t status = (b & 0x80) ? b : 0;
            if (b & 0x80) ++pos;
            uint8_t msgType = status & 0xF0;
            if (pos < size) ++pos; // data1
            if (msgType != 0xC0 && msgType != 0xD0 && pos < size) ++pos; // data2
        }
    }
}

// Second pass: collect note-on, note-off, and CC events from a track chunk.
static void collectEvents(const uint8_t* track, size_t size,
                          const std::vector<TempoPoint>& tempoMap, int ppq,
                          std::vector<RawMidiFileEvent>& out) {
    size_t pos = 0;
    uint64_t tick = 0;
    uint8_t runningStatus = 0;

    while (pos < size) {
        tick += readVLQ(track, size, pos);
        if (pos >= size) break;
        uint8_t b = track[pos];

        if (b == 0xFF) {
            // Meta event — skip
            ++pos;
            if (pos >= size) break;
            ++pos; // meta type
            uint32_t len = readVLQ(track, size, pos);
            pos += len;
        } else if (b == 0xF0 || b == 0xF7) {
            // SysEx — skip
            ++pos;
            pos += readVLQ(track, size, pos);
        } else {
            // MIDI event
            uint8_t status;
            if (b & 0x80) {
                status = b;
                runningStatus = b;
                ++pos;
            } else {
                status = runningStatus;
            }
            uint8_t msgType = status & 0xF0;
            uint8_t d1 = (pos < size) ? track[pos++] : 0;
            uint8_t d2 = 0;
            if (msgType != 0xC0 && msgType != 0xD0 && pos < size) {
                d2 = track[pos++];
            }
            // Keep note-on, note-off, and CC events only.
            if (msgType == 0x80 || msgType == 0x90 || msgType == 0xB0) {
                double ms = ticksToMs(tick, tempoMap, ppq);
                out.push_back({ms, status, d1, d2});
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public implementation
// ---------------------------------------------------------------------------
MidiFileParseResult parseMidiFileImpl(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("Cannot open MIDI file: " + path);

    std::vector<uint8_t> data(
        (std::istreambuf_iterator<char>(f)),
         std::istreambuf_iterator<char>());

    if (data.size() < 14) throw std::runtime_error("File too small to be a valid MIDI file");

    if (data[0] != 'M' || data[1] != 'T' || data[2] != 'h' || data[3] != 'd') {
        throw std::runtime_error("Not a MIDI file (missing MThd magic bytes)");
    }

    uint32_t headerLen = readU32BE(&data[4]);
    if (headerLen < 6 || 8 + headerLen > data.size()) {
        throw std::runtime_error("Invalid MIDI header");
    }

    int format   = readU16BE(&data[8]);
    int nTracks  = readU16BE(&data[10]);
    uint16_t div = readU16BE(&data[12]);

    if (format == 2) {
        throw std::runtime_error(
            "MIDI Type 2 (multiple independent patterns) is not supported. "
            "Use Type 0 (single track) or Type 1 (multi-track sync).");
    }
    if (div & 0x8000) {
        throw std::runtime_error(
            "SMPTE timecode MIDI files are not supported. "
            "Export as ticks-per-beat from your DAW.");
    }

    int ppq = div & 0x7FFF;

    // Locate all track chunks.
    struct TrackSpan { size_t offset; uint32_t len; };
    std::vector<TrackSpan> tracks;
    {
        size_t pos = 8 + headerLen;
        for (int t = 0; t < nTracks && pos + 8 <= data.size(); ++t) {
            if (data[pos]   != 'M' || data[pos+1] != 'T' ||
                data[pos+2] != 'r' || data[pos+3] != 'k') break;
            uint32_t len = readU32BE(&data[pos + 4]);
            size_t dataStart = pos + 8;
            if (dataStart + len > data.size()) break;
            tracks.push_back({dataStart, len});
            pos = dataStart + len;
        }
    }

    // First pass: collect tempo map from all tracks.
    std::vector<TempoPoint> tempoMap;
    for (const auto& ts : tracks) {
        collectTempos(&data[ts.offset], ts.len, tempoMap);
    }
    std::sort(tempoMap.begin(), tempoMap.end());

    // Second pass: collect MIDI events.
    std::vector<RawMidiFileEvent> events;
    for (const auto& ts : tracks) {
        collectEvents(&data[ts.offset], ts.len, tempoMap, ppq, events);
    }

    // Merge-sort (Type 1 tracks may interleave).
    std::stable_sort(events.begin(), events.end(),
        [](const RawMidiFileEvent& a, const RawMidiFileEvent& b) {
            return a.timestampMs < b.timestampMs;
        });

    double durationMs = events.empty() ? 0.0 : events.back().timestampMs;
    return {events, durationMs, format};
}

// ---------------------------------------------------------------------------
// N-API binding
// ---------------------------------------------------------------------------

// parseMidiFile(path: string) →
//   { events: Array<{timestampMs, status, data1, data2}>, durationMs, smfType }
static Napi::Value ParseMidiFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "parseMidiFile(path) requires a string argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    try {
        auto result = parseMidiFileImpl(info[0].As<Napi::String>().Utf8Value());

        auto evArr = Napi::Array::New(env, result.events.size());
        for (size_t i = 0; i < result.events.size(); ++i) {
            const auto& ev = result.events[i];
            auto obj = Napi::Object::New(env);
            obj.Set("timestampMs", Napi::Number::New(env, ev.timestampMs));
            obj.Set("status",      Napi::Number::New(env, ev.status));
            obj.Set("data1",       Napi::Number::New(env, ev.data1));
            obj.Set("data2",       Napi::Number::New(env, ev.data2));
            evArr.Set(static_cast<uint32_t>(i), obj);
        }

        auto out = Napi::Object::New(env);
        out.Set("events",     evArr);
        out.Set("durationMs", Napi::Number::New(env, result.durationMs));
        out.Set("smfType",    Napi::Number::New(env, result.smfType));
        return out;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

void InitMidiFileParser(Napi::Env env, Napi::Object exports) {
    exports.Set("parseMidiFile", Napi::Function::New(env, ParseMidiFile));
}
