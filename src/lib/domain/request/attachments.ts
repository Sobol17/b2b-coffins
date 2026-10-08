import { matchesSignature } from '../files/signature';

/** What a counterparty attaches to a request: a drawing, a scan or a photo (tech.md 14 P6). */
export const ATTACHMENT_MIMES: readonly string[] = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp'
];

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export type AttachmentRefusal = 'mime' | 'size';

export interface AttachmentFacts {
	readonly mime: string;
	readonly sizeBytes: number;
	/** The leading bytes of the file, at least `SIGNATURE_HEAD_BYTES` of them when it is that long. */
	readonly head: Uint8Array;
}

/** @returns null when the file may be stored, otherwise what is wrong with it. */
export function checkAttachment(file: AttachmentFacts): AttachmentRefusal | null {
	if (!ATTACHMENT_MIMES.includes(file.mime)) return 'mime';
	if (file.sizeBytes <= 0 || file.sizeBytes > ATTACHMENT_MAX_BYTES) return 'size';
	// The declared type comes from the client: a page renamed to a picture is not a picture.
	if (!matchesSignature(file.mime, file.head)) return 'mime';
	return null;
}

const FALLBACK_NAME = 'file';

/**
 * The unique part of the path is a folder, so the last segment stays exactly the name the person
 * uploaded: `media` has no column for it and the card reads the name back from the path.
 */
export function storedAttachmentPath(requestId: number, name: string, unique: string): string {
	return `request/${requestId}/${unique}/${safeName(name)}`;
}

export function attachmentName(path: string): string {
	return path.split('/').at(-1) ?? FALLBACK_NAME;
}

/** Only the file name of whatever the browser sent, with the separators of both systems dropped. */
function safeName(name: string): string {
	const base = name.split(/[\\/]/).at(-1)?.trim() ?? '';
	const cleaned = base
		// eslint-disable-next-line no-control-regex -- control characters have no place in a file name
		.replace(/[\u0000-\u001f<>:"|?*]/g, '')
		.replace(/\.\.+/g, '.')
		.replace(/^\.+/, '');
	return cleaned === '' ? FALLBACK_NAME : cleaned.slice(0, 120);
}
