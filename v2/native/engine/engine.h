#ifndef BOUNCE_ENGINE_H
#define BOUNCE_ENGINE_H

#ifdef __cplusplus
extern "C" {
#endif

// Initialize the audio engine. Returns 0 on success, negative on error.
// use_null_backend: if non-zero, use null backend (for testing).
int engine_init(int use_null_backend);

// Shut down the audio engine and release resources.
void engine_shutdown(void);

// Load an audio file for playback. Returns 0 on success, negative on error.
// path: null-terminated file path.
int engine_load(const char* path);

// Start playback. Returns 0 on success, negative on error.
int engine_play(void);

// Stop playback. Returns 0 on success, negative on error.
int engine_stop(void);

// Returns 1 if currently playing, 0 if stopped.
int engine_is_playing(void);

// Get the current playback position in samples.
long long engine_position(void);

// Get the sample rate of the loaded file (or device sample rate).
int engine_sample_rate(void);

// Get the number of channels of the loaded file.
int engine_channels(void);

// Get the total number of frames of the loaded file.
long long engine_total_frames(void);

#ifdef __cplusplus
}
#endif

#endif // BOUNCE_ENGINE_H
