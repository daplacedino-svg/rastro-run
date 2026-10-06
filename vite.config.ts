import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev:https` sobe o servidor com certificado autoassinado, para testar
// no celular pela rede local (WebCodecs e Wake Lock só funcionam em HTTPS).
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [basicSsl()] : [],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: 'index.html',
        'como-exportar': 'como-exportar.html',
      },
    },
  },
  worker: {
    // o worker do MapLibre é um módulo ES
    format: 'es',
  },
  server: {
    host: true,
  },
}));
