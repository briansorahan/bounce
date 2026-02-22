import { BrowserWindow } from "electron";
import { DatabaseManager } from "../database";

export interface CommandResult {
  success: boolean;
  message: string;
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  help?: string;
  execute: (
    args: string[],
    mainWindow: BrowserWindow,
    dbManager?: DatabaseManager,
  ) => Promise<CommandResult>;
}
