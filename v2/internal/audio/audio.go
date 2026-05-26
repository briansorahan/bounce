// Package audio provides Go bindings to the miniaudio-based playback engine.
package audio

/*
#cgo CFLAGS: -I${SRCDIR}/../../native/engine
#cgo LDFLAGS: -L${SRCDIR}/../../native/engine -lengine -lstdc++ -lm -lpthread
#cgo darwin LDFLAGS: -framework CoreAudio -framework AudioToolbox -framework CoreFoundation
#cgo linux LDFLAGS: -ldl
#include "engine.h"
#include <stdlib.h>
*/
import "C"
import (
	"errors"
	"unsafe"
)

var (
	ErrNotInitialized = errors.New("audio engine not initialized")
	ErrInitFailed     = errors.New("audio engine initialization failed")
	ErrLoadFailed     = errors.New("failed to load audio file")
	ErrPlayFailed     = errors.New("playback failed")
)

// Engine wraps the native miniaudio playback engine.
type Engine struct {
	initialized bool
}

// NewEngine creates and initializes the audio engine.
// If nullBackend is true, uses a null audio backend (for testing).
func NewEngine(nullBackend bool) (*Engine, error) {
	useNull := 0
	if nullBackend {
		useNull = 1
	}

	rc := C.engine_init(C.int(useNull))
	if rc != 0 {
		return nil, ErrInitFailed
	}

	return &Engine{initialized: true}, nil
}

// Shutdown releases all audio engine resources.
func (e *Engine) Shutdown() {
	if e.initialized {
		C.engine_shutdown()
		e.initialized = false
	}
}

// Load loads an audio file for playback.
func (e *Engine) Load(path string) error {
	if !e.initialized {
		return ErrNotInitialized
	}

	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))

	rc := C.engine_load(cPath)
	if rc != 0 {
		return ErrLoadFailed
	}
	return nil
}

// Play starts playback of the loaded audio.
func (e *Engine) Play() error {
	if !e.initialized {
		return ErrNotInitialized
	}
	rc := C.engine_play()
	if rc != 0 {
		return ErrPlayFailed
	}
	return nil
}

// Stop stops playback and resets position.
func (e *Engine) Stop() error {
	if !e.initialized {
		return ErrNotInitialized
	}
	C.engine_stop()
	return nil
}

// IsPlaying returns true if audio is currently playing.
func (e *Engine) IsPlaying() bool {
	if !e.initialized {
		return false
	}
	return C.engine_is_playing() != 0
}

// Position returns the current playback position in samples.
func (e *Engine) Position() int64 {
	if !e.initialized {
		return 0
	}
	return int64(C.engine_position())
}

// SampleRate returns the sample rate.
func (e *Engine) SampleRate() int {
	if !e.initialized {
		return 0
	}
	return int(C.engine_sample_rate())
}

// Channels returns the number of channels.
func (e *Engine) Channels() int {
	if !e.initialized {
		return 0
	}
	return int(C.engine_channels())
}

// TotalFrames returns the total number of frames in the loaded audio.
func (e *Engine) TotalFrames() int64 {
	if !e.initialized {
		return 0
	}
	return int64(C.engine_total_frames())
}
