import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const k8sApiProxyTarget = 'http://10.166.33.158:18080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/k8s': {
        target: k8sApiProxyTarget,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
