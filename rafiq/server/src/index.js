import http from 'node:http';
import { config } from './config.js';
import { app, apiRouter } from './routes.js';
import { startRealtime } from './realtime.js';

apiRouter.get('/health', (_req, res) => res.json({ ok: true, name: 'rafiq', at: Date.now() }));

const server = http.createServer(app);
startRealtime(server);

server.listen(config.port, config.host, () => {
  console.log(`Rafiq server listening on http://${config.host}:${config.port}`);
  console.log(`WebSocket endpoint: ws://<host>:${config.port}/ws`);
});
