import type { ElectronAPI } from "../shared/ipc-contract.js";

export type { ElectronAPI };

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
