import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production bundle: every slice DoD is demonstrated on a real build.
export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	// One SQLite file backs the suite, so tests share state and must not race each other.
	workers: 1,
	testMatch: '**/*.e2e.ts',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	webServer: {
		// Migrate before the server boots: Playwright starts it ahead of globalSetup, and the queue
		// worker reads job_queue on init, so a fresh database would crash the preview.
		command: 'pnpm build && pnpm db:migrate && pnpm preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ORIGIN: 'http://localhost:4173',
			SESSION_SECRET: 'e2e-session-secret-value-at-least-32-chars',
			DATABASE_PATH: './data/e2e.db',
			FILES_DIR: './data/e2e-files',
			LOG_LEVEL: 'warn'
		}
	},
	use: { baseURL: 'http://localhost:4173' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
