import type { Minor } from '$lib/types/money';

/**
 * One rounding rule for the whole app. Banker's rounding would make a payroll sheet disagree
 * with the business control sample, so half always goes up in magnitude.
 */
export function roundHalfUp(value: number): number {
	return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function toMinor(major: number): Minor {
	return roundHalfUp(major * 100) as Minor;
}

export function fromMinor(minor: number): number {
	return minor / 100;
}

/** Applies an integer percent discount and keeps the result in whole minor units. */
export function applyPercent(minor: number, percent: number): Minor {
	return roundHalfUp((minor * percent) / 100) as Minor;
}

export function sumMinor(values: readonly number[]): Minor {
	return values.reduce((acc, value) => acc + value, 0) as Minor;
}
