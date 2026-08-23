import type { Cookies } from '@sveltejs/kit';
import { isProduction } from '../config';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from './session.service';

const BASE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	// `secure` on plain http would make the cookie unusable in local development.
	secure: isProduction
} as const;

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		...BASE_OPTIONS,
		expires: expiresAt,
		maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, BASE_OPTIONS);
}
