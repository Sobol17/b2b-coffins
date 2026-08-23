import { defineConfig } from 'drizzle-kit';

// Paths come from the environment, never from a constant: deployment is a later, separate task.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema/index.ts',
	out: './drizzle',
	dbCredentials: { url: process.env.DATABASE_PATH ?? './data/app.db' },
	strict: true,
	verbose: true
});
