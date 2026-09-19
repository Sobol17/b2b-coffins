import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, comments } from '../../src/lib/server/db/schema';
import { FileAccessService } from '../../src/lib/server/files/file-access.service';
import { RequestAttachmentService } from '../../src/lib/server/request/request-attachment.service';
import { RequestCardService } from '../../src/lib/server/request/request-card.service';
import { RequestCommentService } from '../../src/lib/server/request/request-comment.service';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	portalActor,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';
import { send } from './helpers/registry';
import { refused } from './helpers/transitions';

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
	resetRequests(db);
	db.delete(comments).run();
});

describe('portal thread with the manager (P6)', () => {
	it('shows a posted comment on the card and marks it as written by the actor', () => {
		const id = send(adminCtx, VOLGA_180);

		new RequestCommentService(adminCtx).add(id, { body: 'Нужна отгрузка одной партией' });

		const [posted] = card(id).comments;
		expect(posted?.body).toBe('Нужна отгрузка одной партией');
		expect(posted?.isMine).toBe(true);
		expect(posted?.authorName).toBe('Ольга Смирнова');
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

	it('refuses a comment on a request of another counterparty', () => {
		const id = send(adminCtx, VOLGA_180);

		expect(
			refused(() => new RequestCommentService(outsiderCtx).add(id, { body: 'Привет' }))
		).toEqual({ name: 'ForbiddenError', status: 403 });
	});

	it('writes the comment to the audit journal', () => {
		const id = send(adminCtx, VOLGA_180);
		new RequestCommentService(adminCtx).add(id, { body: 'Уточните срок' });

		const actions = db
			.select({ action: auditLog.action })
			.from(auditLog)
			.where(eq(auditLog.entityId, id))
			.all()
			.map((row) => row.action);

		expect(actions).toContain('request.comment');
	});

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

	it('lets an employee attach a file to the own request', async () => {
		const id = send(employeeCtx, VOLGA_180);

		const stored = await attachments(employeeCtx).attach(id, DRAWING);

		expect(card(id, employeeCtx).attachments.map((file) => file.id)).toEqual([stored.id]);
	});
});
