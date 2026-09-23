import { defineConfig } from 'drizzle-kit';
import { DEFAULT_DB_PATH } from './src/paths';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: DEFAULT_DB_PATH },
  strict: true,
});
