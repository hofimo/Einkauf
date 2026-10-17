import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative Pfade, damit die App auf jedem Hoster und in jedem Unterordner läuft
  base: './',
});
