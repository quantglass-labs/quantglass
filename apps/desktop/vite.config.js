import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
var currentDir = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@alphaterminal/contracts': resolve(currentDir, '../../packages/contracts/src/index.ts'),
        },
    },
    build: {
        chunkSizeWarningLimit: 450,
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf('node_modules/lightweight-charts') !== -1) {
                        return 'tradingview-lightweight-charts';
                    }
                    if (id.indexOf('node_modules/react') !== -1 ||
                        id.indexOf('node_modules/react-dom') !== -1 ||
                        id.indexOf('node_modules/react-router-dom') !== -1) {
                        return 'react-vendor';
                    }
                    if (id.indexOf('node_modules/lucide-react') !== -1) {
                        return 'icon-vendor';
                    }
                },
            },
        },
    },
});
