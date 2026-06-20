// main.js — entry point. Wait for the DOM, then hand off to the UI layer.
import { start } from './ui.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
