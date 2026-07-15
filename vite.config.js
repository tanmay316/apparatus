import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules'))
                        return undefined;
                    if (id.includes('firebase'))
                        return 'vendor-firebase';
                    if (id.includes('recharts'))
                        return 'vendor-charts';
                    if (id.includes('framer-motion'))
                        return 'vendor-motion';
                    if (id.includes('react') || id.includes('@tanstack') || id.includes('scheduler') || id.includes('lucide'))
                        return 'vendor-react';
                    return undefined;
                },
            },
        },
    },
    server: {
        port: 3000,
        open: true,
    },
});
