import type { ElectronAPI } from "../shared/ipc-contract";

export type { ElectronAPI };

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
