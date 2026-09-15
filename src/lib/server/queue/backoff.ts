/** Delay before the next attempt, per tech.md 7.1: 2^attempts seconds. */
export function backoffSeconds(attempts: number): number {
	return 2 ** Math.max(1, Math.trunc(attempts));
}

export function nextVisibleAt(now: Date, attempts: number): Date {
	return new Date(now.getTime() + backoffSeconds(attempts) * 1000);
}
