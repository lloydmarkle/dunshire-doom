import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { visualizer } from "rollup-plugin-visualizer";
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    visualizer({ filename: 'bundle-stats.html' }),
    viteStaticCopy({
      targets: [{
        src: path.resolve(__dirname, 'node_modules', 'spessasynth_lib', 'synthetizer', 'worklet_processor.min.js'),
        dest: './synthetizer',
      }],
    }),
  ],
  server: {
    host: '0.0.0.0',
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
})
