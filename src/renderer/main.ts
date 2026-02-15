import { BounceApp } from './app.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new BounceApp();
  await app.mount('terminal');
});
