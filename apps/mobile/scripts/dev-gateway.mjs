import http from 'node:http';
import { createProxyMiddleware } from 'http-proxy-middleware';

/** Uma única origem privada do Codespaces para Expo, HTTP do BFF e WebSocket. */
export function createDevGateway({ apiTarget = 'http://127.0.0.1:3000', expoTarget = 'http://127.0.0.1:8083' } = {}) {
  const api = createProxyMiddleware({
    target: apiTarget, changeOrigin: true,
    pathRewrite: { '^/backend': '' },
    on: {
      proxyReq: proxyReq => proxyReq.removeHeader('cookie'),
      proxyReqWs: proxyReq => proxyReq.removeHeader('cookie'),
    },
  });
  const expo = createProxyMiddleware({ target: expoTarget, changeOrigin: true });
  const isApi = req => req.url === '/backend' || req.url?.startsWith('/backend/');
  const server = http.createServer((req, res) => (isApi(req) ? api : expo)(req, res));
  server.on('upgrade', (req, socket, head) => (isApi(req) ? api : expo).upgrade(req, socket, head));
  return server;
}
