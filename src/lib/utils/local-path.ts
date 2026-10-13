/**
 * Whether a redirect target stays on this host. `//host` and `/\host` start with a slash too, and a
 * browser reads both as another origin, so a leading slash alone proves nothing.
 */
export function isLocalPath(target: string): boolean {
	// eslint-disable-next-line no-control-regex -- a tab or a newline is dropped by the browser before it resolves the address
	return /^\/(?![/\\])/.test(target) && !/[\u0000-\u001f]/.test(target);
}
