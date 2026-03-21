import { ipcMain } from "electron";
import type { HandlerDeps } from "./register";
import { BounceError } from "../../shared/bounce-error";

export function registerErrorHandlers(deps: HandlerDeps): void {
  ipcMain.handle("get-background-errors", () => {
    try {
      return deps.dbManager.getActiveBackgroundErrors();
    } catch (error) {
      throw new BounceError(
        "BACKGROUND_ERRORS_FETCH_FAILED",
        `Failed to fetch background errors: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  ipcMain.handle("dismiss-background-error", (_event, id: number) => {
    try {
      return deps.dbManager.dismissBackgroundError(id);
    } catch (error) {
      throw new BounceError(
        "BACKGROUND_ERROR_DISMISS_FAILED",
        `Failed to dismiss background error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  ipcMain.handle("dismiss-all-background-errors", () => {
    try {
      return deps.dbManager.dismissAllBackgroundErrors();
    } catch (error) {
      throw new BounceError(
        "BACKGROUND_ERRORS_DISMISS_ALL_FAILED",
        `Failed to dismiss all background errors: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}
