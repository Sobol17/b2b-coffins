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

/** Who runs the site. A seller and an operator of personal data must be named to a guest (v1.56). */
export interface PublicOperator {
	readonly name: string;
	readonly inn: string | null;
	readonly ogrn: string | null;
	readonly email: string | null;
}

export interface PublicContacts {
	readonly phone: string | null;
	readonly address: string | null;
	readonly operator: PublicOperator | null;
}
