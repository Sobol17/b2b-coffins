export interface ChangeLine {
	readonly key: string;
	readonly before: string | null;
	readonly after: string | null;
}

const MAX_VALUE = 80;

function show(value: unknown): string | null {
	if (value === undefined) return null;
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
}

/**
 * Lines of the «changes» column: one per key of `before` or `after`, in the order the service wrote
 * them. A key whose value did not change is left out, so the journal shows what actually moved.
 */
export function changeLines(
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null
): ChangeLine[] {
	const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
	return keys
		.map((key) => ({ key, before: show(before?.[key]), after: show(after?.[key]) }))
		.filter((line) => line.before !== line.after);
}
