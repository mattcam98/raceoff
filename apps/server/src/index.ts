import { resetAdminPassword } from './admin';
import { createApp } from './app';
import { loadConfig, VERSION } from './config';
import { lanAddresses, log, setLogLevel } from './util';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);

// Lost the settings password:
//   docker compose exec raceoff node apps/server/dist/index.js reset-admin-password
// then restart; the server prints a new setup code.
if (process.argv[2] === 'reset-admin-password') {
  if (!config.DATA_DIR) throw new Error('DATA_DIR is not set: there is no saved password to reset');
  const done = await resetAdminPassword(config.DATA_DIR);
  console.log(done
    ? 'The settings password and every signed-in device have been removed. Restart RaceOff now; it will print a new setup code.'
    : 'This server has no saved settings yet: nothing to reset.');
  process.exit(0);
}

const app = await createApp(config);
app.server.listen(config.PORT, () => {
  const lan = lanAddresses().map((a) => `http://${a}:${config.PORT}`);
  log.info('RaceOff is listening', { port: config.PORT, version: VERSION, publicUrl: app.admin.settings.publicUrl, lan });
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
