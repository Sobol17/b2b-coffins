import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { comments } from '../../src/lib/server/db/schema';
import { FileAccessService } from '../../src/lib/server/files/file-access.service';
import { RequestAttachmentService } from '../../src/lib/server/request/request-attachment.service';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { insertUser, migratedDatabase } from './helpers/db';
import { openThread, resetSupport } from './helpers/support';
import { portalActor, seedOrderingWorld, variantId } from './helpers/portal-requests';
import { send } from './helpers/registry';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const adminCtx = portalActor('cp_admin', world.adminId, world.cpId);
const employeeCtx = portalActor('cp_employee', world.employeeId, world.cpId);
const outsiderCtx = portalActor('cp_admin', world.outsiderId, world.otherCpId);
const managerId = insertUser({ email: 'mgr@shop.example', role: 'manager', counterpartyId: null });

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const FILES_ROOT = mkdtempSync(join(tmpdir(), 'b2b-files-'));
afterAll(() => rmSync(FILES_ROOT, { recursive: true, force: true }));

const DRAWING = {
	name: 'Эскиз тиснения.pdf',
	mime: 'application/pdf',
	bytes: Buffer.from('%PDF-1.4 sketch')
};

function attachments(ctx = adminCtx) {
	return new RequestAttachmentService(ctx, FILES_ROOT);
}

function card(id: number, ctx = adminCtx) {
	return new RequestCardService(ctx).card(id);
}

beforeEach(() => {
	resetSupport(db);
	db.delete(comments).run();
});

describe('portal thread with the manager after C17 (P6, v1.57)', () => {
	it('shows an old public comment on the card, read only', () => {
		const id = send(adminCtx, VOLGA_180);
		db.insert(comments)
			.values({ requestId: id, authorId: world.adminId, body: 'Нужна отгрузка одной партией' })
			.run();

		const [old] = card(id).comments;
		expect(old?.body).toBe('Нужна отгрузка одной партией');
		expect(old?.isMine).toBe(true);
		expect(old?.authorName).toBe('Ольга Смирнова');
	});

	it('keeps an internal note of the workshop out of the portal', () => {
		const id = send(adminCtx, VOLGA_180);
		db.insert(comments)
			.values({
				requestId: id,
				authorId: managerId,
				body: 'Долг по прошлой заявке',
				isInternal: true
			})
			.run();

		expect(card(id).comments).toEqual([]);
	});

	it('lists the support threads of the request inside the fence of the reader', () => {
		const id = send(employeeCtx, VOLGA_180);
		openThread(employeeCtx, { requestId: id, subject: 'Сроки' });
		openThread(adminCtx, { requestId: id, subject: 'Обивка' });

		expect(card(id, employeeCtx).supportThreads.map((thread) => thread.subject)).toEqual(['Сроки']);
		expect(card(id, adminCtx).supportThreads).toHaveLength(2);
	});
});

describe('attachments of a request (P6)', () => {
	it('stores an attachment under the name the counterparty uploaded', async () => {
		const id = send(adminCtx, VOLGA_180);

		const stored = await attachments().attach(id, DRAWING);

		expect(stored.name).toBe('Эскиз тиснения.pdf');
		expect(card(id).attachments.map((file) => file.id)).toEqual([stored.id]);
	});

	it('hands the stored bytes back to the counterparty that owns the request', async () => {
		const id = send(adminCtx, VOLGA_180);
		const stored = await attachments().attach(id, DRAWING);

		const file = await new FileAccessService(adminCtx, undefined, undefined, FILES_ROOT).open(
			stored.id
		);

		expect(file.bytes.toString()).toBe(DRAWING.bytes.toString());
		expect(file.mime).toBe('application/pdf');
	});

	it('refuses the attachment of a request of another counterparty', async () => {
		const id = send(adminCtx, VOLGA_180);
		const stored = await attachments().attach(id, DRAWING);
		const service = new FileAccessService(outsiderCtx, undefined, undefined, FILES_ROOT);

		await expect(service.open(stored.id)).rejects.toThrow();
	});

	it('refuses a file type the workshop does not read', async () => {
		const id = send(adminCtx, VOLGA_180);

		await expect(
			attachments().attach(id, {
				name: 'setup.exe',
				mime: 'application/x-msdownload',
				bytes: Buffer.from('MZ')
			})
		).rejects.toThrow();
	});

	it('refuses a page sent under the type of a picture and stores nothing', async () => {
		const id = send(adminCtx, VOLGA_180);

		await expect(
			attachments().attach(id, {
				name: 'photo.png',
				mime: 'image/png',
				bytes: Buffer.from('<!doctype html><script>alert(1)</script>')
			})
		).rejects.toThrow('Такой тип файла не принимается');
		expect(card(id).attachments).toEqual([]);
	});

	it('lets an employee attach a file to the own request', async () => {
		const id = send(employeeCtx, VOLGA_180);

		const stored = await attachments(employeeCtx).attach(id, DRAWING);

		expect(card(id, employeeCtx).attachments.map((file) => file.id)).toEqual([stored.id]);
	});
});
