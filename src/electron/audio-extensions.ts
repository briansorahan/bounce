/** Supported audio file extensions (with leading dot, lowercase). */
export const AUDIO_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".ogg",
  ".flac",
  ".m4a",
  ".aac",
  ".opus",
] as const;

/** The same list without leading dots, for use in Electron dialog filters. */
export const AUDIO_EXTENSIONS_NO_DOT = AUDIO_EXTENSIONS.map((e) =>
  e.slice(1),
) as unknown as string[];
