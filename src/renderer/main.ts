import { BounceApp } from "./app.js";

// Expose app for testing/debugging
declare global {
  interface Window {
    app?: BounceApp;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const app = new BounceApp();
  window.app = app; // Expose for testing
  await app.mount("terminal");
});
