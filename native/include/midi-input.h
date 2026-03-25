#pragma once
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
#include <napi.h>

struct MidiEvent {
    uint64_t timestampUs; // microseconds from steady_clock since process start
    uint8_t  status;      // MIDI status byte (type | channel)
    uint8_t  data1;       // note number or CC number
    uint8_t  data2;       // velocity or CC value
};

// Forward-declare RtMidiIn so we don't pull RtMidi.h into downstream headers.
// NOTE: midi-input.cpp includes RtMidi.h directly where the complete type is needed.
// We use a raw pointer + manual lifetime so the incomplete type stays valid here.

// Actually RtMidiIn must be complete for unique_ptr — include it here.
#include "RtMidi.h"

class MidiInput {
public:
    static constexpr int kRingSize = 4096; // must be a power of two

    MidiInput();
    ~MidiInput();

    MidiInput(const MidiInput&)            = delete;
    MidiInput& operator=(const MidiInput&) = delete;

    // Enumerate available MIDI input ports.
    std::vector<std::string> listPorts();

    // Open / close a port by index.
    void openPort(unsigned int index);
    void closePort();
    bool isOpen() const;

    // Drain all pending events from the ring buffer.
    // Called from the JS (main-loop) thread.
    std::vector<MidiEvent> drainEvents();

    // Test-only: push a synthetic event into the ring buffer.
    void injectEvent(uint8_t status, uint8_t data1, uint8_t data2);

private:
    static void midiCallback(double deltatime,
                              std::vector<unsigned char>* message,
                              void* userData);
    void pushEvent(const MidiEvent& ev);

    std::unique_ptr<RtMidiIn> midiIn_;
    bool isOpen_ = false;

    // Lock-free SPSC ring buffer (written by RtMidi callback, read by JS thread).
    std::array<MidiEvent, kRingSize> ring_{};
    std::atomic<int> writePos_{0};
    std::atomic<int> readPos_{0};
};

// N-API init — exports listMidiInputs, openMidiInput, closeMidiInput,
// drainMidiEvents, injectMidiEvent as free functions on the module.
void InitMidiInput(Napi::Env env, Napi::Object exports);
