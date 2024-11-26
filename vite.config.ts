import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    visualizer({ filename: 'bundle-stats.html' }),
  ],
  server: {
    host: '0.0.0.0',
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
})
