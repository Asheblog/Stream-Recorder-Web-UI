import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    publicDir: 'public',
    resolve: {
        alias: {
            '@web': path.resolve(__dirname, 'src/web'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist/web',
        emptyOutDir: true,
    },
});
