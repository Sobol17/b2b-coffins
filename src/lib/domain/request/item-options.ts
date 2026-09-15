import type { OptionKind } from '$lib/types/catalog';

export interface AllowedOption {
	readonly id: number;
	readonly kind: OptionKind;
}

export type OptionSelectionCheck =
	| { readonly ok: true; readonly optionIds: number[] }
	| {
			readonly ok: false;
			readonly reason: 'not_allowed' | 'duplicate' | 'kind_twice';
			readonly optionId: number;
	  };

/**
 * A request line carries only options of the compatibility matrix of its variant, each once and at
 * most one of a kind: a coffin has one finish, one upholstery, one set of hardware.
 * @returns the option ids sorted, so two identical choices compare equal.
 */
export function checkOptionSelection(
	allowed: readonly AllowedOption[],
	chosen: readonly number[]
): OptionSelectionCheck {
	const byId = new Map(allowed.map((option) => [option.id, option]));
	const seen = new Set<number>();
	const kinds = new Set<OptionKind>();

	for (const id of chosen) {
		const option = byId.get(id);
		if (!option) return { ok: false, reason: 'not_allowed', optionId: id };
		if (seen.has(id)) return { ok: false, reason: 'duplicate', optionId: id };
		if (kinds.has(option.kind)) return { ok: false, reason: 'kind_twice', optionId: id };
		seen.add(id);
		kinds.add(option.kind);
	}
	return { ok: true, optionIds: [...seen].sort((a, b) => a - b) };
}

/** Two lines with the same variant and this equal selection are one line with a larger quantity. */
export function sameSelection(a: readonly number[], b: readonly number[]): boolean {
	if (a.length !== b.length) return false;
	const left = [...a].sort((x, y) => x - y);
	const right = [...b].sort((x, y) => x - y);
	return left.every((value, index) => value === right[index]);
}
