// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Correlation id for logs and audit, generated once per request. */
			requestId: string;
		}
		interface Error {
			code: string;
			requestId?: string;
		}
	}
}

export {};
