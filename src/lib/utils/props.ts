/**
 * Drops the keys whose value is `undefined`.
 *
 * `exactOptionalPropertyTypes` is on, so `{ name: undefined }` does not fit `{ name?: string }`.
 * bits-ui and every component the shadcn registry generates declare their props exactly that way,
 * so an optional value can never be forwarded straight through. This is the one idiom the project
 * uses for that: `{...definedProps({ name })}` instead of a conditional spread per prop.
 *
 * `pnpm ui:add` runs the typecheck right after the generator, so the sites that need it surface as
 * errors on the same command instead of on the gate.
 */
export function definedProps<T extends Record<string, unknown>>(
	props: T
): { [K in keyof T]?: Exclude<T[K], undefined> } {
	// fromEntries defines own data properties. Assigning `defined[key] = value` instead would turn a
	// `__proto__` key into a prototype change and silently drop it.
	const defined = Object.fromEntries(
		Object.entries(props).filter(([, value]) => value !== undefined)
	);
	return defined as { [K in keyof T]?: Exclude<T[K], undefined> };
}
