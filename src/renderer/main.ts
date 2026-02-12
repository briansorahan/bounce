import { BounceApp } from './app.js';

window.addEventListener('DOMContentLoaded', () => {
  const app = new BounceApp();
  app.mount('terminal');
});
