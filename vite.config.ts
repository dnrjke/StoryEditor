import { defineConfig } from 'vite';
import { resolve } from 'path';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
    plugins: [yaml()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5180,
        open: true,
    },
});
