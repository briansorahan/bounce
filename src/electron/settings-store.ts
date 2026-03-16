import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { app } from "electron";

interface Settings {
  cwd: string;
  currentProjectName: string | null;
}

export class SettingsStore {
  private settingsPath: string;
  private settings: Settings;

  constructor(settingsPath?: string) {
    this.settingsPath =
      settingsPath ?? path.join(app.getPath("userData"), "settings.json");
    this.settings = this.load();
  }

  getCwd(): string {
    return this.settings.cwd;
  }

  setCwd(newCwd: string): void {
    this.settings.cwd = newCwd;
    this.save();
  }

  getCurrentProjectName(): string | null {
    return this.settings.currentProjectName;
  }

  setCurrentProjectName(projectName: string | null): void {
    this.settings.currentProjectName = projectName;
    this.save();
  }

  /** Expand a leading ~ to the user's home directory. */
  static expandHome(p: string): string {
    if (p === "~") return os.homedir();
    if (p.startsWith("~/") || p.startsWith("~\\")) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  }

  private load(): Settings {
    try {
      const raw = fs.readFileSync(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        cwd: parsed.cwd ?? os.homedir(),
        currentProjectName: parsed.currentProjectName ?? null,
      };
    } catch {
      return { cwd: os.homedir(), currentProjectName: null };
    }
  }

  private save(): void {
    fs.writeFileSync(
      this.settingsPath,
      JSON.stringify(this.settings, null, 2),
      "utf8",
    );
  }
}
