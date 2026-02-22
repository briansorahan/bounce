import * as assert from "assert";

class CommandParser {
  parseCommand(input: string): { name: string; args: string[] } | null {
    const quotedArgsRegex = /^(\w+)\s+(.+)$/;
    const match = input.match(quotedArgsRegex);

    if (!match) {
      return { name: input.trim(), args: [] };
    }

    const name = match[1];
    const argsString = match[2];

    const args: string[] = [];
    const quotedArgRegex = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let argMatch;

    while ((argMatch = quotedArgRegex.exec(argsString)) !== null) {
      args.push(argMatch[1] || argMatch[2] || argMatch[3]);
    }

    return { name, args };
  }
}

async function testCommandParsing() {
  const parser = new CommandParser();

  // Test simple command with no args
  const help = parser.parseCommand("help");
  assert.strictEqual(help?.name, "help");
  assert.strictEqual(help?.args.length, 0);

  // Test command with double-quoted argument
  const display1 = parser.parseCommand('display "path/to/file.wav"');
  assert.strictEqual(display1?.name, "display");
  assert.strictEqual(display1?.args.length, 1);
  assert.strictEqual(display1?.args[0], "path/to/file.wav");

  // Test command with single-quoted argument
  const display2 = parser.parseCommand("display 'path/to/file.wav'");
  assert.strictEqual(display2?.name, "display");
  assert.strictEqual(display2?.args.length, 1);
  assert.strictEqual(display2?.args[0], "path/to/file.wav");

  // Test command with unquoted argument
  const display3 = parser.parseCommand("display path/to/file.wav");
  assert.strictEqual(display3?.name, "display");
  assert.strictEqual(display3?.args.length, 1);
  assert.strictEqual(display3?.args[0], "path/to/file.wav");

  // Test command with multiple arguments
  const multi = parser.parseCommand('cmd "arg1" "arg2" arg3');
  assert.strictEqual(multi?.name, "cmd");
  assert.strictEqual(multi?.args.length, 3);
  assert.strictEqual(multi?.args[0], "arg1");
  assert.strictEqual(multi?.args[1], "arg2");
  assert.strictEqual(multi?.args[2], "arg3");

  // Test command with spaces in quoted path
  const spaces = parser.parseCommand('display "/path with spaces/file.wav"');
  assert.strictEqual(spaces?.name, "display");
  assert.strictEqual(spaces?.args.length, 1);
  assert.strictEqual(spaces?.args[0], "/path with spaces/file.wav");

  // Test empty command
  const empty = parser.parseCommand("");
  assert.strictEqual(empty?.name, "");
  assert.strictEqual(empty?.args.length, 0);

  // Test command with only whitespace
  const whitespace = parser.parseCommand("   ");
  assert.strictEqual(whitespace?.name, "");
  assert.strictEqual(whitespace?.args.length, 0);
}

async function testFileExtensionValidation() {
  const supportedExtensions = [
    ".wav",
    ".mp3",
    ".ogg",
    ".flac",
    ".m4a",
    ".aac",
    ".opus",
  ];

  const isSupported = (filePath: string): boolean => {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf("."));
    return supportedExtensions.includes(ext);
  };

  // Test supported formats
  assert.strictEqual(isSupported("file.wav"), true);
  assert.strictEqual(isSupported("file.WAV"), true);
  assert.strictEqual(isSupported("file.mp3"), true);
  assert.strictEqual(isSupported("file.ogg"), true);
  assert.strictEqual(isSupported("file.flac"), true);
  assert.strictEqual(isSupported("file.m4a"), true);
  assert.strictEqual(isSupported("file.aac"), true);
  assert.strictEqual(isSupported("file.opus"), true);

  // Test unsupported formats
  assert.strictEqual(isSupported("file.txt"), false);
  assert.strictEqual(isSupported("file.pdf"), false);
  assert.strictEqual(isSupported("file.mp4"), false);
  assert.strictEqual(isSupported("file"), false);

  // Test paths with multiple dots
  assert.strictEqual(isSupported("my.file.wav"), true);
  assert.strictEqual(isSupported("my.file.txt"), false);

  // Test paths with directories
  assert.strictEqual(isSupported("/path/to/file.wav"), true);
  assert.strictEqual(isSupported("/path.with.dots/file.mp3"), true);
}

async function main() {
  await testCommandParsing();
  await testFileExtensionValidation();
  process.exit(0);
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
