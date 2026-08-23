import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

// config.ts refuses to boot without these, and unit tests exercise the real server modules.
const UNIT_TEST_ENV = {
	NODE_ENV: 'test',
	SESSION_SECRET: 'unit-test-session-secret-at-least-32-chars',
	LOG_LEVEL: 'silent'
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// SvelteKit emits the CSP header itself so it can hash its own inline boot script.
			// Hand-writing it in hooks.server.ts would need 'unsafe-inline' and defeat the point.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['tests/unit/**/*.{test,spec}.ts'],
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
