package audio

import "testing"

func TestNewEngine_NullBackend(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine(null) failed: %v", err)
	}
	defer eng.Shutdown()

	if !eng.initialized {
		t.Error("engine should be initialized")
	}
}

func TestEngine_PlayWithoutLoad(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer eng.Shutdown()

	// Play without loading should fail
	err = eng.Play()
	if err == nil {
		t.Error("expected error when playing without loaded audio")
	}
}

func TestEngine_StopWithoutPlay(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer eng.Shutdown()

	// Stop should succeed even without playing
	err = eng.Stop()
	if err != nil {
		t.Errorf("Stop() should succeed: %v", err)
	}
}

func TestEngine_IsPlaying(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer eng.Shutdown()

	if eng.IsPlaying() {
		t.Error("should not be playing initially")
	}
}

func TestEngine_ShutdownIdempotent(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}

	eng.Shutdown()
	eng.Shutdown() // should not panic
}

func TestEngine_MethodsAfterShutdown(t *testing.T) {
	eng, err := NewEngine(true)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	eng.Shutdown()

	if eng.IsPlaying() {
		t.Error("should not be playing after shutdown")
	}
	if eng.Position() != 0 {
		t.Error("position should be 0 after shutdown")
	}
	if eng.SampleRate() != 0 {
		t.Error("sample rate should be 0 after shutdown")
	}
	if eng.Channels() != 0 {
		t.Error("channels should be 0 after shutdown")
	}
	if eng.TotalFrames() != 0 {
		t.Error("total frames should be 0 after shutdown")
	}

	err = eng.Load("foo.wav")
	if err != ErrNotInitialized {
		t.Errorf("expected ErrNotInitialized, got %v", err)
	}
	err = eng.Play()
	if err != ErrNotInitialized {
		t.Errorf("expected ErrNotInitialized, got %v", err)
	}
	err = eng.Stop()
	if err != ErrNotInitialized {
		t.Errorf("expected ErrNotInitialized, got %v", err)
	}
}
