import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3300),
  /** Where records are kept. */
  DATA_DIR: z.string().default('./data'),
  /** The address phones should open, e.g. https://race.example.com. Empty: whatever the TV was opened with. */
  PUBLIC_URL: z.string().url().or(z.literal('')).default(''),
  /** Reverse proxies in front of the server: 0 if exposed directly. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Where the built web app is. */
  WEB_DIR: z.string().default(''),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}

export const VERSION = '1.0.0';
