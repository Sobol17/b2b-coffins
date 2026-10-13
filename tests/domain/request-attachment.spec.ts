import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	ATTACHMENT_MAX_BYTES,
	ATTACHMENT_MIMES,
	attachmentName,
	checkAttachment,
	storedAttachmentPath
} from '../../src/lib/domain/request/attachments';

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const HEADS: Readonly<Record<string, Uint8Array>> = {
	'application/pdf': bytes('%PDF-1.4 sketch'),
	'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]),
	'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
	'image/webp': bytes('RIFF\u0010\u0000\u0000\u0000WEBP')
};
const PDF = HEADS['application/pdf'] ?? new Uint8Array();

describe('request attachments (P6)', () => {
	it('accepts every listed type when the bytes are what the type says', () => {
		for (const mime of ATTACHMENT_MIMES) {
			const head = HEADS[mime] ?? new Uint8Array();
			expect(checkAttachment({ mime, sizeBytes: 1024, head }), mime).toBeNull();
		}
	});

	it('refuses a type the workshop does not read', () => {
		expect(checkAttachment({ mime: 'application/x-msdownload', sizeBytes: 10, head: PDF })).toBe(
			'mime'
		);
	});

	it('refuses an empty file and a file over the limit', () => {
		expect(checkAttachment({ mime: 'application/pdf', sizeBytes: 0, head: PDF })).toBe('size');
		expect(
			checkAttachment({ mime: 'application/pdf', sizeBytes: ATTACHMENT_MAX_BYTES + 1, head: PDF })
		).toBe('size');
	});

	it('refuses a page that only calls itself a picture', () => {
		const head = bytes('<!doctype html><script>');

		for (const mime of ATTACHMENT_MIMES) {
			expect(checkAttachment({ mime, sizeBytes: head.length, head }), mime).toBe('mime');
		}
	});

	it('refuses a file cut shorter than its signature', () => {
		expect(
			checkAttachment({ mime: 'image/png', sizeBytes: 3, head: new Uint8Array([0x89, 0x50, 0x4e]) })
		).toBe('mime');
	});

	it('never takes bytes of one listed type under the name of another', () => {
		const pairs = ATTACHMENT_MIMES.flatMap((declared) =>
			ATTACHMENT_MIMES.filter((actual) => actual !== declared).map((actual) => ({
				declared,
				actual
			}))
		);
		const property = fc.property(
			fc.constantFrom(...pairs),
			fc.uint8Array({ maxLength: 32 }),
			({ declared, actual }, tail) => {
				const head = new Uint8Array([...(HEADS[actual] ?? []), ...tail]);
				return checkAttachment({ mime: declared, sizeBytes: head.length, head }) === 'mime';
			}
		);

		expect(() => fc.assert(property)).not.toThrow();
	});

	it('keeps the uploaded name as the last segment of the stored path', () => {
		const path = storedAttachmentPath(42, 'Эскиз тиснения.pdf', 'ab12cd');

		expect(path).toBe('request/42/ab12cd/Эскиз тиснения.pdf');
		expect(attachmentName(path)).toBe('Эскиз тиснения.pdf');
	});

	it('strips the directories a crafted name carries', () => {
		const path = storedAttachmentPath(7, '../../etc/passwd', 'ab12cd');

		expect(path).toBe('request/7/ab12cd/passwd');
	});

	it('names a file the browser sent without one', () => {
		expect(storedAttachmentPath(7, '   ', 'ab12cd')).toBe('request/7/ab12cd/file');
	});

	it('never builds a path that climbs out of the request folder', () => {
		const property = fc.property(
			fc.integer({ min: 1, max: 10_000 }),
			fc.string(),
			(requestId, name) => {
				const path = storedAttachmentPath(requestId, name, 'ab12cd');
				return path.startsWith(`request/${requestId}/ab12cd/`) && !path.includes('..');
			}
		);

		expect(() => fc.assert(property)).not.toThrow();
	});

	it('lists the types the portal may send', () => {
		expect([...ATTACHMENT_MIMES]).toContain('image/jpeg');
	});
});
