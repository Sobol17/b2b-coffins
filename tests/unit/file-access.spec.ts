import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError, NotFoundError } from '../../src/lib/server/core/errors';
import { media, products } from '../../src/lib/server/db/schema';
import { FileAccessService } from '../../src/lib/server/files/file-access.service';
import { storedFilePath } from '../../src/lib/server/files/storage';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const root = mkdtempSync(join(tmpdir(), 'b2b-files-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'products'));
const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
writeFileSync(join(root, 'products', 'cover.jpg'), photo);

function product(sku: string, isPublished: boolean): number {
	const [row] = db.insert(products).values({ sku, title: sku, isPublished }).returning().all();
	return row?.id ?? 0;
}

function stored(
	path: string,
	ownerScope: 'product' | 'request' | 'contract',
	ownerId: number
): number {
	const [row] = db
		.insert(media)
		.values({ path, mime: 'image/jpeg', sizeBytes: photo.length, ownerScope, ownerId })
		.returning()
		.all();
	return row?.id ?? 0;
}

const published = product('FILE-1', true);
const hidden = product('FILE-2', false);
const coverId = stored('products/cover.jpg', 'product', published);
const hiddenCoverId = stored('products/cover.jpg', 'product', hidden);
const attachmentId = stored('products/cover.jpg', 'request', 1);
const contractId = stored('products/cover.jpg', 'contract', 1);
const escapeId = stored('../../etc/passwd', 'product', published);
const goneId = stored('products/missing.jpg', 'product', published);

function service(role: RoleCode): FileAccessService {
	const roles = [role];
	const ctx: ActorContext = {
		userId: 1,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: PolicyService.isPortalRole(role) ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: false,
		requestId: 'files-test'
	};
	return new FileAccessService(ctx, undefined, undefined, root);
}

describe('file access through /api/files/[id]', () => {
	it('serves a photo of a published product to any catalog reader', async () => {
		const file = await service('cp_employee').open(coverId);

		expect(file.mime).toBe('image/jpeg');
		expect(file.bytes.equals(photo)).toBe(true);
	});

	it('answers a photo of a hidden product as missing in the portal, but shows it to the manager', async () => {
		await expect(service('cp_admin').open(hiddenCoverId)).rejects.toThrow(NotFoundError);
		await expect(service('manager').open(hiddenCoverId)).resolves.toMatchObject({
			mime: 'image/jpeg'
		});
	});

	it('serves a request attachment to the workshop side that reads every request', async () => {
		await expect(service('owner').open(attachmentId)).resolves.toMatchObject({
			mime: 'image/jpeg'
		});
	});

	it('refuses a request attachment to a counterparty the request does not belong to', async () => {
		await expect(service('cp_admin').open(attachmentId)).rejects.toThrow(ForbiddenError);
	});

	it('refuses files of the owners whose slices have not defined a reader yet', async () => {
		await expect(service('owner').open(contractId)).rejects.toThrow(ForbiddenError);
	});

	it('refuses a role without catalog access', async () => {
		await expect(service('driver').open(coverId)).rejects.toThrow(ForbiddenError);
	});

	it('never reads outside the files root and answers missing files as 404', async () => {
		expect(storedFilePath('../../etc/passwd', root)).toBeNull();
		expect(storedFilePath('/etc/passwd', root)).toBeNull();
		await expect(service('cp_employee').open(escapeId)).rejects.toThrow(NotFoundError);
		await expect(service('cp_employee').open(goneId)).rejects.toThrow(NotFoundError);
		await expect(service('cp_employee').open(999_999)).rejects.toThrow(NotFoundError);
	});
});
