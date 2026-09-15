import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// config.ts refuses to boot without these, and unit tests exercise the real server modules.
const UNIT_TEST_ENV = {
	NODE_ENV: 'test',
	SESSION_SECRET: 'unit-test-session-secret-at-least-32-chars',
	LOG_LEVEL: 'silent'
};

export default defineConfig({
	// Kit options live in svelte.config.js: passing them here makes SvelteKit ignore that file,
	// and the shadcn-svelte CLI reads it to resolve the $lib alias.
	plugins: [tailwindcss(), sveltekit()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['tests/unit/**/*.{test,spec}.ts'],
					setupFiles: ['tests/unit/setup.ts'],
					env: UNIT_TEST_ENV
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'domain',
					environment: 'node',
					include: ['tests/domain/**/*.{test,spec}.ts']
				}
			}
		]
	}
});
