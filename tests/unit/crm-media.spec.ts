import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ProductImageService } from '../../src/lib/server/crm-catalog/product-image.service';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { categories, products } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const root = mkdtempSync(join(tmpdir(), 'c2-media-'));
let ownerId = 0;
let productId = 0;
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function actor(role: RoleCode): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: role === 'cp_admin' ? 1 : null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'media-c2'
	};
}

beforeAll(() => {
	ownerId = insertUser({ email: 'media.c2@example.test', role: 'owner', counterpartyId: null });
	const [category] = db.insert(categories).values({ title: 'C2 media' }).returning().all();
	const [product] = db
		.insert(products)
		.values({ sku: 'C2-MEDIA', title: 'Модель', categoryId: category?.id })
		.returning()
		.all();
	productId = product?.id ?? 0;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('C2 model photographs', () => {
	it('uploads two images, changes the cover by order, and removes one', async () => {
		const service = new ProductImageService(actor('manager'), root);
		const first = await service.upload(productId, { mime: 'image/png', bytes: png });
		const second = await service.upload(productId, { mime: 'image/png', bytes: png });
		expect(service.list(productId).map((row) => row.id)).toEqual([first.id, second.id]);
		service.setOrder(productId, [second.id, first.id]);
		expect(service.list(productId)[0]).toMatchObject({ id: second.id, isCover: true });
		service.remove(productId, first.id);
		expect(service.list(productId).map((row) => row.id)).toEqual([second.id]);
	});

	it('rejects a fake image and portal upload before it writes a media row', async () => {
		const service = new ProductImageService(actor('owner'), root);
		const before = service.list(productId).length;
		await expect(
			service.upload(productId, { mime: 'image/png', bytes: Buffer.from('%PDF-1.4') })
		).rejects.toThrow(ValidationError);
		expect(service.list(productId)).toHaveLength(before);
		expect(() => new ProductImageService(actor('cp_admin'), root)).toThrow(ForbiddenError);
	});
});
