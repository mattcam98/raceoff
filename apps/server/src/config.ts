/**
 * What the server needs before it can read its own settings. Everything else (the address phones open,
 * reverse proxies, room expiry and so on) is changed in the app, on the settings page.
 */
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3300),
  /** Where records, rooms and the server settings are kept. Empty: in memory only. */
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Where the built web app is. */
  WEB_DIR: z.string().default(''),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}

export const VERSION = '1.0.0';
