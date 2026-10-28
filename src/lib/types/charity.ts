/**
 * Donation banner of the portal home (P8). `public` keys carry the fund's public figures and reach
 * every role (tech.md 8.1); the own contribution reveals the purchase volume, so only a role with
 * prices receives it.
 */
export interface CharityBannerDto {
	readonly fundTitle: string;
	readonly fundUrl: string | null;
	readonly publicTotalMinor: number;
	readonly publicYearMinor: number;
	readonly publicRequestCount: number;
	readonly ownTotalMinor?: number;
	/** `/api/files/[id]` of the transfer confirmation, null while none is uploaded (v1.66). */
	readonly transferDocumentUrl: string | null;
}

/** The transfer confirmation as the fund block of the CRM settings shows it (v1.66). */
export interface CharityDocumentDto {
	readonly url: string;
	readonly sizeBytes: number;
	readonly uploadedAt: string;
}
