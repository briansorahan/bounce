#include "midi-input.h"
#include <chrono>
#include <stdexcept>

using namespace std::chrono;

// ---------------------------------------------------------------------------
// MidiInput
// ---------------------------------------------------------------------------

MidiInput::MidiInput() {
    try {
        midiIn_ = std::make_unique<RtMidiIn>();
    } catch (const std::exception&) {
        // MIDI backend unavailable (e.g., no ALSA sequencer in CI/Docker).
        // Operate in ring-buffer-only mode: listPorts() returns [], openPort() throws.
        // drainEvents() and injectEvent() always work independently of the backend.
        midiIn_ = nullptr;
    }
}

MidiInput::~MidiInput() {
    if (midiIn_ && isOpen_) {
        try { midiIn_->cancelCallback(); } catch (...) {}
        try { midiIn_->closePort(); }      catch (...) {}
    }
}

std::vector<std::string> MidiInput::listPorts() {
    if (!midiIn_) return {};
    unsigned int count = midiIn_->getPortCount();
    std::vector<std::string> ports;
    ports.reserve(count);
    for (unsigned int i = 0; i < count; ++i) {
        ports.push_back(midiIn_->getPortName(i));
    }
    return ports;
}

void MidiInput::openPort(unsigned int index) {
    if (!midiIn_) throw std::runtime_error("MIDI backend unavailable (no ALSA sequencer or CoreMIDI)");
    if (isOpen_) {
        midiIn_->cancelCallback();
        midiIn_->closePort();
        isOpen_ = false;
    }
    midiIn_->openPort(index);
    // Ignore sysex, timing clocks, and active sensing — only note/CC events.
    midiIn_->ignoreTypes(true, true, true);
    midiIn_->setCallback(&MidiInput::midiCallback, this);
    isOpen_ = true;
}

void MidiInput::closePort() {
    if (!isOpen_) return;
    midiIn_->cancelCallback();
    midiIn_->closePort();
    isOpen_ = false;
}

bool MidiInput::isOpen() const {
    return isOpen_;
}

std::vector<MidiEvent> MidiInput::drainEvents() {
    std::vector<MidiEvent> out;
    int read  = readPos_.load(std::memory_order_relaxed);
    int write = writePos_.load(std::memory_order_acquire);
    while (read != write) {
        out.push_back(ring_[read & (kRingSize - 1)]);
        ++read;
    }
    readPos_.store(read, std::memory_order_release);
    return out;
}

void MidiInput::injectEvent(uint8_t status, uint8_t data1, uint8_t data2) {
    auto now = steady_clock::now();
    uint64_t us = static_cast<uint64_t>(
        duration_cast<microseconds>(now.time_since_epoch()).count());
    pushEvent({ us, status, data1, data2 });
}

void MidiInput::pushEvent(const MidiEvent& ev) {
    int write = writePos_.load(std::memory_order_relaxed);
    int read  = readPos_.load(std::memory_order_acquire);
    if (write - read >= kRingSize) return; // ring full — drop event
    ring_[write & (kRingSize - 1)] = ev;
    writePos_.store(write + 1, std::memory_order_release);
}

void MidiInput::midiCallback(double /*deltatime*/,
                               std::vector<unsigned char>* message,
                               void* userData) {
    if (!message || message->size() < 2) return;
    auto* self = static_cast<MidiInput*>(userData);
    auto now = steady_clock::now();
    uint64_t us = static_cast<uint64_t>(
        duration_cast<microseconds>(now.time_since_epoch()).count());
    uint8_t data2 = (message->size() >= 3) ? (*message)[2] : 0;
    self->pushEvent({ us, (*message)[0], (*message)[1], data2 });
}

// ---------------------------------------------------------------------------
// Singleton — one open MIDI input device at a time for v1.
// ---------------------------------------------------------------------------
static MidiInput& getMidiInput() {
    static MidiInput instance;
    return instance;
}

// ---------------------------------------------------------------------------
// N-API bindings
// ---------------------------------------------------------------------------

// listMidiInputs() → Array<{ index: number; name: string }>
static Napi::Value ListMidiInputs(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    try {
        auto ports = getMidiInput().listPorts();
        auto arr = Napi::Array::New(env, ports.size());
        for (size_t i = 0; i < ports.size(); ++i) {
            auto obj = Napi::Object::New(env);
            obj.Set("index", Napi::Number::New(env, static_cast<double>(i)));
            obj.Set("name",  Napi::String::New(env, ports[i]));
            arr.Set(static_cast<uint32_t>(i), obj);
        }
        return arr;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// openMidiInput(index: number) → void
static Napi::Value OpenMidiInput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "openMidiInput(index) requires a number argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    try {
        getMidiInput().openPort(info[0].As<Napi::Number>().Uint32Value());
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    }
    return env.Undefined();
}

// closeMidiInput() → void
static Napi::Value CloseMidiInput(const Napi::CallbackInfo& info) {
    getMidiInput().closePort();
    return info.Env().Undefined();
}

// drainMidiEvents() → Array<{ timestampUs: number; status: number; data1: number; data2: number }>
static Napi::Value DrainMidiEvents(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto events = getMidiInput().drainEvents();
    auto arr = Napi::Array::New(env, events.size());
    for (size_t i = 0; i < events.size(); ++i) {
        const auto& ev = events[i];
        auto obj = Napi::Object::New(env);
        // timestampUs as double — precision is sufficient for decades of microseconds.
        obj.Set("timestampUs", Napi::Number::New(env, static_cast<double>(ev.timestampUs)));
        obj.Set("status",      Napi::Number::New(env, ev.status));
        obj.Set("data1",       Napi::Number::New(env, ev.data1));
        obj.Set("data2",       Napi::Number::New(env, ev.data2));
        arr.Set(static_cast<uint32_t>(i), obj);
    }
    return arr;
}

// injectMidiEvent(status: number, data1: number, data2: number) → void
static Napi::Value InjectMidiEvent(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "injectMidiEvent(status, data1, data2) requires 3 arguments")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    getMidiInput().injectEvent(
        static_cast<uint8_t>(info[0].As<Napi::Number>().Uint32Value()),
        static_cast<uint8_t>(info[1].As<Napi::Number>().Uint32Value()),
        static_cast<uint8_t>(info[2].As<Napi::Number>().Uint32Value())
    );
    return env.Undefined();
}

void InitMidiInput(Napi::Env env, Napi::Object exports) {
    exports.Set("listMidiInputs",  Napi::Function::New(env, ListMidiInputs));
    exports.Set("openMidiInput",   Napi::Function::New(env, OpenMidiInput));
    exports.Set("closeMidiInput",  Napi::Function::New(env, CloseMidiInput));
    exports.Set("drainMidiEvents", Napi::Function::New(env, DrainMidiEvents));
    exports.Set("injectMidiEvent", Napi::Function::New(env, InjectMidiEvent));
}
