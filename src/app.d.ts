// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ActorContext } from '$lib/types/actor';
import type { SessionUser } from '$lib/server/auth/session.service';

declare global {
	namespace App {
		interface Locals {
			/** Correlation id for logs and audit, generated once per request. */
			requestId: string;
			/** Null for an anonymous visitor. Built once, passed into every service. */
			actor: ActorContext | null;
			user: SessionUser | null;
		}
		interface Error {
			code: string;
			requestId?: string;
		}
		interface PageData {
			user?: {
				fullName: string;
				scope: 'portal' | 'crm';
				roles: readonly string[];
				canSeePrices: boolean;
			} | null;
		}
	}
}

export {};
