import { DELIVERY_FAILURES, type DeliveryFailure } from '$lib/types/push';

/** `notifications.error` leads with the code, so the log can show a reason without the raw answer. */
export function failureText(code: DeliveryFailure, detail: string): string {
	return `${code}: ${detail}`;
}

export function failureOf(error: string | null): DeliveryFailure | null {
	const code = error?.split(':', 1)[0];
	return DELIVERY_FAILURES.find((known) => known === code) ?? null;
}

/** Cuts by code points, so a clipped text never ends on half a character. */
export function clip(text: string, max: number): string {
	const chars = [...text];
	return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}
