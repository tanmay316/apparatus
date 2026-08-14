import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => ({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUNDLED_DEV__: 'false',
    __SERVER_FORWARD_CONSOLE__: 'false',
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('react') || id.includes('@tanstack') || id.includes('scheduler') || id.includes('lucide')) return 'vendor-react';
          return undefined;
        },
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('react') || id.includes('@tanstack') || id.includes('scheduler') || id.includes('lucide')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
}));
