/** Quantities of a component are kept as integers of a thousandth (tech.md 5.7): 0,35 l is 350. */
const MILLI_PATTERN = /^(\d+)(?:[.,](\d{1,3}))?$/;

/** Reads "0,35" or "0.35" into 350. Null when the text is not a number of at most three decimals. */
export function parseMilli(input: string): number | null {
	const match = MILLI_PATTERN.exec(input.replace(/\s/g, ''));
	if (!match) return null;
	const whole = Number(match[1]);
	const fraction = Number((match[2] ?? '').padEnd(3, '0'));
	const milli = whole * 1000 + fraction;
	return Number.isSafeInteger(milli) ? milli : null;
}

/** 350 reads as "0,35": the comma of the Russian locale, no trailing zeros. */
export function formatMilli(milli: number): string {
	const sign = milli < 0 ? '-' : '';
	const abs = Math.abs(milli);
	const whole = Math.floor(abs / 1000);
	const fraction = String(abs % 1000)
		.padStart(3, '0')
		.replace(/0+$/, '');
	return fraction === '' ? `${sign}${whole}` : `${sign}${whole},${fraction}`;
}
