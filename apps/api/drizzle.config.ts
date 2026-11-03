import { defineConfig } from 'drizzle-kit'

// Solo para `npm run db:generate --workspace apps/api`: genera la migración SQL a partir de src/db/schema.
// Las migraciones se aplican con `npm run db:migrate` (src/db/migrate.ts), no con drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  strict: true,
  verbose: true,
})
