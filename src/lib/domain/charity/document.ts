import { matchesSignature } from '../files/signature';

/** The one file of the fund block: the confirmation of the transfer to the fund (tech.md v1.66). */
export const CHARITY_DOCUMENT_MIME = 'application/pdf';
export const CHARITY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type CharityDocumentRefusal = 'type' | 'size';

/**
 * @param head the leading bytes of the file, `SIGNATURE_HEAD_BYTES` of them when it is that long.
 * @returns null when the file may be stored, otherwise what is wrong with it.
 */
export function checkCharityDocument(
	sizeBytes: number,
	head: Uint8Array
): CharityDocumentRefusal | null {
	if (sizeBytes <= 0 || sizeBytes > CHARITY_DOCUMENT_MAX_BYTES) return 'size';
	// The bytes decide: a renamed picture is not a PDF, whatever the browser claims.
	if (!matchesSignature(CHARITY_DOCUMENT_MIME, head)) return 'type';
	return null;
}

/** A fresh path per upload, so a replaced file never answers under the address of the new one. */
export function charityDocumentPath(unique: string): string {
	return `charity/${unique}.pdf`;
}
