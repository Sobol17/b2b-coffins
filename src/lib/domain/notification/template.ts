export const TEMPLATE_VARIABLES = [
	'number',
	'status',
	'url',
	'counterparty',
	'externalNumber'
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Readonly<Record<TemplateVariable, string>>;

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

function isVariable(name: string): name is TemplateVariable {
	return (TEMPLATE_VARIABLES as readonly string[]).includes(name);
}

/** Placeholders a template uses that the renderer does not know. The seed refuses such a text. */
export function unknownVariables(text: string): string[] {
	const names = [...text.matchAll(PLACEHOLDER)].map(([, name]) => name ?? '');
	return [...new Set(names.filter((name) => !isVariable(name)))];
}

/**
 * Fills `{{ name }}` placeholders in one pass: a value that itself looks like a placeholder, such as
 * a counterparty's own order number, is printed as is and never expanded.
 * @throws Error on a placeholder outside TEMPLATE_VARIABLES.
 */
export function renderTemplate(text: string, values: TemplateValues): string {
	const unknown = unknownVariables(text);
	if (unknown.length > 0) throw new Error(`unknown template variables: ${unknown.join(', ')}`);
	return text.replace(PLACEHOLDER, (_, name: TemplateVariable) => values[name]);
}
