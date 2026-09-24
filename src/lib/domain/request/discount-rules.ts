import { discountMinor, type RequestTotals } from './pricing';

export interface DiscountLine {
	readonly totalMinor: number;
	/** The model's category first, then its ancestors. */
	readonly categoryIds: readonly number[];
}

export interface DiscountRule {
	readonly percent: number;
	/** Null applies to every category. Counterparty and time filters run in the repository. */
	readonly categoryId: number | null;
}

/** Apply the largest rule or contract rate to each line, rounding once per equal-rate group. */
export function requestTotalsWithRules(
	lines: readonly DiscountLine[],
	contractPercent: number,
	rules: readonly DiscountRule[]
): RequestTotals {
	const byPercent = new Map<number, number>();
	for (const line of lines) {
		const applicable = rules.filter(
			(rule) => rule.categoryId === null || line.categoryIds.includes(rule.categoryId)
		);
		const percent = Math.max(contractPercent, ...applicable.map((rule) => rule.percent));
		byPercent.set(percent, (byPercent.get(percent) ?? 0) + line.totalMinor);
	}
	const itemsTotalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);
	const discount = [...byPercent].reduce(
		(sum, [percent, total]) => sum + discountMinor(total, percent),
		0
	);
	return { itemsTotalMinor, discountMinor: discount, totalMinor: itemsTotalMinor - discount };
}
