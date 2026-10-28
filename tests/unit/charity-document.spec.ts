import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
	CHARITY_DOCUMENT_MAX_BYTES,
	checkCharityDocument
} from '../../src/lib/domain/charity/document';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { CharityBannerService } from '../../src/lib/server/charity/charity-banner.service';
import { CharityDocumentService } from '../../src/lib/server/charity/charity-document.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { auditLog, media, settings } from '../../src/lib/server/db/schema';
import { FileAccessService } from '../../src/lib/server/files/file-access.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const root = mkdtempSync(join(tmpdir(), 'b2b-charity-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const ownerId = insertUser({
	email: 'own@charity-doc.example',
	role: 'owner',
	counterpartyId: null
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: PolicyService.isPortalRole(role) ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: false,
		requestId: 'charity-document-test'
	};
}

const documents = (role: RoleCode = 'owner') =>
	new CharityDocumentService(actor(role), undefined, undefined, root);
const files = (role: RoleCode) => new FileAccessService(actor(role), undefined, undefined, root);
const banner = () => new CharityBannerService(actor('cp_employee')).banner();
const idOf = (url: string | undefined) => Number(url?.split('/').at(-1));
const pathOf = (id: number) =>
	db.select({ path: media.path }).from(media).where(eq(media.id, id)).all()[0]?.path;

beforeEach(async () => {
	await documents().remove();
	db.insert(settings)
		.values({ key: 'charity.fund', value: { title: 'Фонд' }, updatedById: ownerId })
		.onConflictDoNothing()
		.run();
});

describe('the transfer confirmation of the fund (v1.66)', () => {
	it('takes a PDF from the owner and shows it to every portal role', async () => {
		await documents().replace(PDF);

		const current = documents().current();
		expect(current).toMatchObject({
			sizeBytes: PDF.length,
			url: expect.stringMatching(/^\/api\/files\/\d+$/)
		});
		expect(banner()?.transferDocumentUrl).toBe(current?.url);
		for (const role of ['cp_employee', 'cp_admin', 'owner'] as const) {
			const file = await files(role).open(idOf(current?.url));
			expect(file).toMatchObject({ mime: 'application/pdf' });
			expect(file.bytes.equals(PDF)).toBe(true);
		}
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'charity.document_replace',
			entity: 'media',
			entityId: idOf(current?.url)
		});
	});

	it('keeps one file: a new upload replaces the old one, the old address answers 404', async () => {
		await documents().replace(PDF);
		const first = idOf(documents().current()?.url);
		const firstPath = pathOf(first) ?? '';

		await documents().replace(Buffer.concat([PDF, Buffer.from('% second')]));

		const second = idOf(documents().current()?.url);
		expect(second).not.toBe(first);
		expect(db.select().from(media).where(eq(media.ownerScope, 'charity')).all()).toHaveLength(1);
		expect(existsSync(join(root, firstPath))).toBe(false);
		await expect(files('cp_employee').open(first)).rejects.toThrow(NotFoundError);
	});

	it('refuses a file that is not a PDF or is too large, and keeps the current one', async () => {
		await documents().replace(PDF);
		const before = documents().current();

		await expect(documents().replace(PNG)).rejects.toThrow(ValidationError);
		await expect(documents().replace(Buffer.alloc(0))).rejects.toThrow(ValidationError);
		expect(documents().current()).toEqual(before);
		expect(checkCharityDocument(CHARITY_DOCUMENT_MAX_BYTES + 1, PDF)).toBe('size');
		expect(checkCharityDocument(PDF.length, PNG)).toBe('type');
		expect(checkCharityDocument(PDF.length, PDF)).toBeNull();
	});

	it('takes the file off the portal on removal', async () => {
		await documents().replace(PDF);
		const id = idOf(documents().current()?.url);
		const path = pathOf(id) ?? '';

		await documents().remove();

		expect(documents().current()).toBeNull();
		expect(banner()?.transferDocumentUrl).toBeNull();
		expect(existsSync(join(root, path))).toBe(false);
		await expect(files('cp_admin').open(id)).rejects.toThrow(NotFoundError);
	});

	it('lets only the owner upload, and keeps the file from the workshop crew', async () => {
		for (const role of ['manager', 'driver', 'carpenter', 'cp_admin'] as const) {
			expect(() => documents(role)).toThrow(ForbiddenError);
		}
		await documents().replace(PDF);
		const id = idOf(documents().current()?.url);
		for (const role of ['driver', 'carpenter', 'manager'] as const) {
			await expect(files(role).open(id)).rejects.toThrow(ForbiddenError);
		}
	});
});
