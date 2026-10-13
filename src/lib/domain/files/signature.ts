/**
 * Leading bytes of the file types the system stores (tech.md 12). The type a browser declares is a
 * claim of the client; the bytes decide whether the file is what it says.
 */
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function hasBytes(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
	if (bytes.length < offset + expected.length) return false;
	return expected.every((byte, index) => bytes[offset + index] === byte);
}

const MATCHERS: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
	'image/jpeg': (bytes) => hasBytes(bytes, JPEG),
	'image/png': (bytes) => hasBytes(bytes, PNG),
	// A RIFF container names its payload after the four bytes of the chunk size.
	'image/webp': (bytes) => hasBytes(bytes, RIFF) && hasBytes(bytes, WEBP, 8),
	'application/pdf': (bytes) => hasBytes(bytes, PDF)
};

/** How many leading bytes a caller has to hand over for any known type. */
export const SIGNATURE_HEAD_BYTES = 12;

/** @returns false for a type without a known signature: an unknown type is never trusted. */
export function matchesSignature(mime: string, bytes: Uint8Array): boolean {
	return Object.hasOwn(MATCHERS, mime) && (MATCHERS[mime]?.(bytes) ?? false);
}
