import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import vueJsx from '@vitejs/plugin-vue-jsx'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  fs.rmSync('.build/dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    build: {
      outDir: '.build/dist',
    },

    plugins: [
      tailwindcss(),
      vue(),
      vueJsx(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main/index.ts',
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: '.build/dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
            plugins: [
              // Copy prompt .md templates to the build output
            {
                name: 'copy-static-assets',
                closeBundle() {
                  // Copy prompt .md templates
                  const src = path.resolve(__dirname, 'electron/main/services/intelligence/prompts')
                  const dest = path.resolve(__dirname, '.build/dist-electron/main/prompts')
                  if (fs.existsSync(src)) {
                    fs.cpSync(src, dest, { recursive: true })
                  }
                },
              },
            ],
            resolve: {
              alias: {
                '@electron': path.resolve(__dirname, 'electron/main'),
              },
            },
          },
        },

        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: '.build/dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
            resolve: {
              alias: {
                '@electron': path.resolve(__dirname, 'electron/main'),
              },
            },
          },
        },

        renderer: {},
      }),
    ],

    resolve: {
      alias: {
        '@api': path.resolve(__dirname, 'electron/main/api'),
        '@': path.resolve(__dirname, 'src'),
      },
    },

    clearScreen: false,
  }
})
