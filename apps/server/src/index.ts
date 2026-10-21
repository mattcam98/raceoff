import { createApp } from './app';
import { loadConfig, VERSION } from './config';
import { lanAddresses, log, setLogLevel } from './util';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);

const app = await createApp(config);
app.server.listen(config.PORT, () => {
  log.info('RaceOff is listening', { port: config.PORT, version: VERSION, lan: lanAddresses().map((a) => `http://${a}:${config.PORT}`) });
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 8_000);
  force.unref();
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    log.error('shutdown failed', { err });
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log.error('unhandled rejection', { err }));
