/** What a settings action answers: which form spoke and the field errors of that form. */
export interface SettingsFormResult {
	readonly action: string;
	readonly errors?: Record<string, string[] | undefined>;
	readonly saved?: boolean;
}

export function fieldError(
	result: SettingsFormResult | null | undefined,
	action: string,
	field: string
): string | undefined {
	if (result?.action !== action) return undefined;
	return result.errors?.[field]?.join(', ');
}
