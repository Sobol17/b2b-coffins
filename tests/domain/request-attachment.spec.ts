import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	ATTACHMENT_MAX_BYTES,
	ATTACHMENT_MIMES,
	attachmentName,
	checkAttachment,
	storedAttachmentPath
} from '../../src/lib/domain/request/attachments';

describe('request attachments (P6)', () => {
	it('accepts a drawing within the size limit', () => {
		expect(checkAttachment({ mime: 'application/pdf', sizeBytes: 1024 })).toBeNull();
	});

	it('refuses a type the workshop does not read', () => {
		expect(checkAttachment({ mime: 'application/x-msdownload', sizeBytes: 10 })).toBe('mime');
	});

	it('refuses an empty file and a file over the limit', () => {
		expect(checkAttachment({ mime: 'application/pdf', sizeBytes: 0 })).toBe('size');
		expect(checkAttachment({ mime: 'application/pdf', sizeBytes: ATTACHMENT_MAX_BYTES + 1 })).toBe(
			'size'
		);
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
