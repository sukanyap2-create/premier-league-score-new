import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || '3000'}`;

  return {
    root: path.join(projectRoot, 'frontend'),
    publicDir: path.join(projectRoot, 'frontend', 'public'),
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: path.join(projectRoot, 'dist'),
      emptyOutDir: true
    }
  };
});
