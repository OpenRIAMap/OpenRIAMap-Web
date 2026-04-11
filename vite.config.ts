import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },

server: {
  proxy: {
    '/api/dynmap': {
      target: 'https://satellite.ria.red',
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(/^\/api\/dynmap/, '/map'),
    },
  },
},

build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');

          // 测绘扩展包：统一归组测绘入口、模块、workflow、工具与导入导出链路
          if (
            normalized.includes('/src/entrypoints/measuringEntry.ts') ||
            normalized.includes('/src/components/Mapping/')
          ) {
            return 'measuring-ext';
          }

          // Legacy 扩展包：统一归组旧图层、旧详情、旧铁路与旧传送相关链路
          if (
            normalized.includes('/src/entrypoints/legacyEntry.ts') ||
            normalized.includes('/src/components/Legacy/') ||
            normalized.includes('/src/components/Navigation/legacy/') ||
            normalized.includes('pathfinding') ||
            normalized.includes('toriiTeleport') ||
            normalized.includes('RailwayLayer') ||
            normalized.includes('LandmarkLayer') ||
            normalized.includes('LineDetailCard') ||
            normalized.includes('PointDetailCard') ||
            normalized.includes('LinesPage')
          ) {
            return 'legacy-ext';
          }

          // 主包第三方依赖：统一归组常驻运行时依赖
          if (normalized.includes('/node_modules/')) {
            // jszip 基本只服务测绘导入/导出，跟随测绘扩展包加载更合理
            if (normalized.includes('/node_modules/jszip/')) {
              return 'measuring-ext';
            }
            return 'vendor-main';
          }
        },
      },
    },
  },
});
