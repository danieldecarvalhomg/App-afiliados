import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {defineConfig} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET?.trim() || 'http://127.0.0.1:3002';
  const apiProxy = {
    '/api': {
      target: backendTarget,
      changeOrigin: false,
    },
  };
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot),
      },
    },
    server: {
      // Quick Tunnels usam subdomínios efêmeros; limitar ao sufixo oficial
      // mantém a proteção contra Host header sem liberar hosts arbitrários.
      allowedHosts: ['.trycloudflare.com'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // O backend público é o único dono dos workers e da sessão WhatsApp.
      // O Vite na porta 3001 serve somente a interface e encaminha as APIs,
      // evitando dois processos disputando as mesmas chaves do Baileys.
      proxy: apiProxy,
    },
    preview: {
      host: '127.0.0.1',
      proxy: apiProxy,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('react')) return 'react';
            if (id.includes('lucide-react') || id.includes('motion')) return 'ui';
            return 'vendor';
          },
        },
      },
    },
  };
});
