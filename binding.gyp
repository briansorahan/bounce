{
  "targets": [
    {
      "target_name": "flucoma_native",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "native/src/addon.cpp",
        "native/src/onset_feature.cpp",
        "native/src/onset_slice.cpp",
        "native/src/buf_nmf.cpp",
        "native/src/mfcc_feature.cpp",
        "native/src/spectral_shape.cpp",
        "native/src/normalization.cpp",
        "native/src/kdtree.cpp",
        "native/src/amp_slice.cpp",
        "native/src/novelty_slice.cpp",
        "native/src/transient_slice.cpp",
        "third_party/hisstools/HISSTools_FFT/HISSTools_FFT.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include",
        "third_party/flucoma-core/include",
        "third_party/eigen",
        "third_party/hisstools/include",
        "third_party/hisstools",
        "third_party/memory/install/include/foonathan"
      ],
      "libraries": [
        "../third_party/memory/install/lib/libfoonathan_memory-0.7.4.a"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-stdlib=libc++"],
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "OTHER_LDFLAGS": ["-framework Accelerate"]
      },
      "conditions": [
        [
          "OS=='mac'",
          {
            "cflags+": ["-fvisibility=hidden"],
            "cflags_cc+": ["-std=c++17"]
          }
        ],
        [
          "OS=='linux'",
          {
            "cflags_cc": ["-std=c++17", "-fexceptions"],
            "libraries": ["-lblas", "-llapack"]
          }
        ]
      ]
    },
    {
      "target_name": "audio_engine_native",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "native/src/audio-engine-binding.cpp",
        "native/src/audio-engine.cpp",
        "native/src/sample-playback-engine.cpp",
        "native/src/sampler-instrument.cpp",
        "native/src/granular-instrument.cpp",
        "native/src/midi-input.cpp",
        "native/src/midi-file-parser.cpp",
        "third_party/rtmidi/RtMidi.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include",
        "third_party/miniaudio",
        "third_party/rtmidi"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-stdlib=libc++"],
        "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
        "OTHER_LDFLAGS": ["-framework AudioToolbox", "-framework CoreAudio", "-framework CoreFoundation", "-framework CoreMIDI"]
      },
      "conditions": [
        [
          "OS=='mac'",
          {
            "cflags+": ["-fvisibility=hidden"],
            "cflags_cc+": ["-std=c++17"],
            "defines+": ["__MACOSX_CORE__"]
          }
        ],
        [
          "OS=='linux'",
          {
            "cflags_cc": ["-std=c++17", "-fexceptions"],
            "libraries": ["-lpthread", "-lm", "-ldl", "-lasound"],
            "defines+": ["__LINUX_ALSA__"]
          }
        ],
        [
          "OS=='win'",
          {
            "libraries": ["Winmm.lib"],
            "defines+": ["__WINDOWS_MM__"]
          }
        ]
      ]
    }
  ]
}
