#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <napi.h>

struct RawMidiFileEvent {
    double   timestampMs;
    uint8_t  status;
    uint8_t  data1;
    uint8_t  data2;
};

struct MidiFileParseResult {
    std::vector<RawMidiFileEvent> events;
    double durationMs = 0.0;
    int    smfType    = 0;
};

MidiFileParseResult parseMidiFileImpl(const std::string& path);

// N-API init — exports parseMidiFile as a free function on the module.
void InitMidiFileParser(Napi::Env env, Napi::Object exports);
