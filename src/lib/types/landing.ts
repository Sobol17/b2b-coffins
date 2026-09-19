// landing.ts — what a guest may see on `/` (P13). No article, price or stock leaves the catalog.
export const LANDING_WORKS_LIMIT = 9;

export interface LandingWorkDto {
	coverMediaId: number;
	title: string;
}

/** The charity block of the landing: who the fund is and what share of a request goes to it. */
export interface LandingCharityDto {
	fundTitle: string;
	fundUrl: string | null;
	ratePercent: number; // basis points of `charity.rate_bp` as a percent; collected sums stay inside
}
