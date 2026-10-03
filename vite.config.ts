import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';
import pkg from './package.json';
import brand from './brand.config.json';

const BRAND_TOKENS: Record<string, string> = {
  '{{APP_NAME}}': brand.name,
  '{{APP_NAME_UPPER}}': brand.name.toUpperCase(),
  '{{APP_NAME_URI}}': encodeURIComponent(brand.name),
  '{{APP_TAGLINE}}': brand.tagline,
  '{{APP_DESCRIPTION}}': brand.shortDescription,
  '{{THEME_COLOR}}': brand.themeColor,
  '{{SUPPORT_EMAIL}}': brand.supportEmail,
  '{{LEGAL_OWNER}}': brand.legalOwner,
  '{{WEB_URL}}': brand.webUrl.replace(/\/$/, ''),
};
// Static files in public/ that contain brand tokens.
const BRANDED_PUBLIC = ['manifest.json', 'sw.js', 'privacy.html', 'terms.html', 'delete-account.html'];
const fillBrand = (text: string) => Object.entries(BRAND_TOKENS).reduce((t, [k, v]) => t.split(k).join(v), text);

function brandPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'brand-tokens',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    transformIndexHtml: html => fillBrand(html),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = (req.url || '').split('?')[0].replace(/^\//, '');
        if (!BRANDED_PUBLIC.includes(file)) return next();
        const type = file.endsWith('.json') ? 'application/json' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
        res.setHeader('Content-Type', `${type}; charset=utf-8`);
        res.end(fillBrand(fs.readFileSync(path.resolve(__dirname, 'public', file), 'utf8')));
      });
    },
    writeBundle() {
      for (const file of BRANDED_PUBLIC) {
        const p = path.join(outDir, file);
        if (fs.existsSync(p)) fs.writeFileSync(p, fillBrand(fs.readFileSync(p, 'utf8')));
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), basicSsl(), brandPlugin()],
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
