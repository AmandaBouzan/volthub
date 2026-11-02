import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDevGateway } from './dev-gateway.mjs';

// Não aceita trocar de porta silenciosamente: o gateway precisa do Metro em 8083.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error('Porta 8083 ocupada. Encerre o Expo anterior com Ctrl+C e tente novamente.')));
  probe.listen(8083, '0.0.0.0', () => probe.close(resolve));
});

// API_URL relativo vence a configuração de .env.local somente neste comando.
const expo = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url)), 'start', '--web', '--host', 'localhost', '--port', '8083', '--clear'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, EXPO_PUBLIC_API_URL: '/backend', EXPO_UNSTABLE_BONJOUR: '0', BROWSER: 'none' }, stdio: 'inherit',
});
const gateway = createDevGateway();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  expo.kill('SIGTERM');
  gateway.close();
  gateway.closeAllConnections();
  // Também encerra sockets HMR/WS que podem permanecer abertos.
  setTimeout(() => process.exit(code), 500).unref();
}
gateway.on('error', error => { console.error(error.message); stop(1); });
gateway.listen(8084, '0.0.0.0', () => console.log('\nVoltHub: abra a porta 8084 no navegador. Expo interno: 8083; BFF: 3000.\n'));
expo.on('error', error => { console.error(error.message); stop(1); });
expo.on('exit', code => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
