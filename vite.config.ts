import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __BUNDLED_DEV__: 'false',
    __SERVER_FORWARD_CONSOLE__: 'false',
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    cssMinify: true,
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
  // Strip console.log and console.warn in production builds
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
  server: {
    port: 3000,
    open: true,
  },
}));
