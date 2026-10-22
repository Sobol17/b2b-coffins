import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { RateLimitError } from '../../src/lib/server/core/errors';
import { auditLog, requests, users } from '../../src/lib/server/db/schema';
import { SupportPostingService } from '../../src/lib/server/support/support-posting.service';
import { SupportThreadService } from '../../src/lib/server/support/support-thread.service';
import { migratedDatabase } from './helpers/db';
import { portalActor, variantId } from './helpers/portal-requests';
import { send } from './helpers/registry';
import { crmActor, openThread, resetSupport, supportQuery, supportWorld } from './helpers/support';
import { fanouts, refused } from './helpers/transitions';

const db = migratedDatabase();
const world = supportWorld(db);
const admin = portalActor('cp_admin', world.adminId, world.cpId);
const employee = portalActor('cp_employee', world.employeeId, world.cpId);
const outsider = portalActor('cp_admin', world.outsiderId, world.otherCpId);
const manager = crmActor('manager', world.managerId);
const driver = crmActor('driver', world.driverId);
const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');

const posting = (ctx = employee) => new SupportPostingService(ctx);
const reading = (ctx = employee) => new SupportThreadService(ctx);
const auditActions = () =>
	db
		.select({ action: auditLog.action })
		.from(auditLog)
		.all()
		.map((row) => row.action);

beforeEach(() => {
	resetSupport(db);
	db.update(users).set({ isActive: true }).run();
});

describe('opening a support thread (C17)', () => {
	it('opens a thread with its first message, audit and one support.opened fanout', () => {
		const thread = openThread(employee);

		expect(thread.messages).toHaveLength(1);
		expect(thread.messages[0]).toMatchObject({ side: 'portal', isMine: true });
		expect(thread.awaiting).toBe('crm');
		expect(auditActions()).toEqual(['support.open']);
		expect(fanouts('support.opened')).toHaveLength(1);
		expect(fanouts('support.message_posted')).toHaveLength(0);
	});

	it('lets the employee link only an own sent request', () => {
		const own = send(employee, VOLGA_180);
		const colleague = send(admin, VOLGA_180);
		const foreign = send(outsider, VOLGA_180);

		expect(openThread(employee, { requestId: own }).requestId).toBe(own);
		expect(refused(() => openThread(employee, { requestId: colleague })).status).toBe(404);
		expect(refused(() => openThread(employee, { requestId: foreign })).status).toBe(404);
		expect(openThread(admin, { requestId: colleague }).requestNumber).not.toBeNull();
	});

	it('refuses a draft as the request of a thread', () => {
		const sent = send(employee, VOLGA_180);
		db.update(requests).set({ status: 'draft' }).where(eq(requests.id, sent)).run();

		expect(refused(() => openThread(employee, { requestId: sent })).status).toBe(404);
	});

	it('offers in the request select only what the actor may link', () => {
		const own = send(employee, VOLGA_180);
		send(admin, VOLGA_180);

		expect(
			reading(employee)
				.requestOptions()
				.map((option) => option.id)
		).toEqual([own]);
		expect(reading(admin).requestOptions()).toHaveLength(2);
	});

	it('lets only the portal open a thread', () => {
		expect(refused(() => openThread(manager)).status).toBe(403);
	});
});

describe('reading support threads (C17)', () => {
	it('shows an employee only own threads and the cp_admin all of the counterparty', () => {
		const mine = openThread(employee);
		const colleagues = openThread(admin);

		expect(reading(employee).list(supportQuery()).total).toBe(1);
		expect(refused(() => reading(employee).thread(colleagues.id)).status).toBe(404);
		expect(reading(admin).list(supportQuery()).total).toBe(2);
		expect(reading(admin).thread(mine.id).authorName).toBe('Илья Коротков');
	});

	it('answers 404 to another counterparty and 403 to a workshop role without support.any', () => {
		const thread = openThread(employee);

		expect(refused(() => reading(outsider).thread(thread.id)).status).toBe(404);
		expect(refused(() => reading(driver).thread(thread.id)).status).toBe(403);
		expect(refused(() => reading(driver).list(supportQuery())).status).toBe(403);
	});

	it('keeps prices out of every support dto for cp_employee', () => {
		const thread = openThread(employee, { requestId: send(employee, VOLGA_180) });

		const body = JSON.stringify([
			reading(employee).thread(thread.id),
			reading(employee).list(supportQuery()),
			reading(employee).requestOptions()
		]);
		expect(body).not.toMatch(/Minor/);
	});

	it('lists threads waiting for the workshop first in the CRM', () => {
		const answered = openThread(employee, { subject: 'Отвечено' });
		posting(manager).post(answered.id, { body: 'Успеем' });
		openThread(admin, { subject: 'Ждёт' });

		const rows = reading(manager).list(supportQuery()).rows;
		expect(rows.map((row) => row.subject)).toEqual(['Ждёт', 'Отвечено']);
		expect(rows.map((row) => row.awaiting)).toEqual(['crm', 'portal']);
		expect(reading(manager).list(supportQuery({ awaiting: 'crm' })).total).toBe(1);
	});

	it('finds a thread by subject, request number and counterparty name', () => {
		const sent = send(employee, VOLGA_180);
		const thread = openThread(employee, { subject: 'Обивка', requestId: sent });
		const number = thread.requestNumber ?? '';

		expect(reading(manager).list(supportQuery({ q: 'обив' })).total).toBe(1);
		expect(reading(manager).list(supportQuery({ q: number })).total).toBe(1);
		expect(reading(manager).list(supportQuery({ q: 'ритуал' })).total).toBe(1);
		expect(reading(manager).list(supportQuery({ q: 'память' })).total).toBe(0);
		expect(reading(manager).counterpartyChoices()).toEqual([
			{ id: world.cpId, name: 'Ритуал-Сервис' }
		]);
	});

	it('lists the threads of a request inside the fence of the reader', () => {
		const sent = send(employee, VOLGA_180);
		openThread(employee, { requestId: sent });
		openThread(admin, { requestId: sent });

		expect(reading(employee).forRequest(sent)).toHaveLength(1);
		expect(reading(admin).forRequest(sent)).toHaveLength(2);
	});
});

describe('answering and closing (C17)', () => {
	it('posts a reply, moves last_message_* and emits support.message_posted', () => {
		const thread = openThread(employee);

		const reply = posting(manager).post(thread.id, { body: 'Успеем к пятнице' });

		expect(reply).toMatchObject({ side: 'crm', isMine: true, authorName: 'Анна Мастерова' });
		expect(reading(employee).thread(thread.id).awaiting).toBe('portal');
		expect(fanouts('support.message_posted').map((job) => job.payload)).toEqual([
			{ eventKey: 'support.message_posted', entityId: reply.id }
		]);
		expect(auditActions()).toEqual(['support.open', 'support.post']);
	});

	it('refuses a message into a closed thread with 409', () => {
		const thread = openThread(employee);
		posting(manager).close(thread.id);

		expect(refused(() => posting(employee).post(thread.id, { body: 'Ещё вопрос' })).status).toBe(
			409
		);
		const closed = reading(employee).thread(thread.id);
		expect(closed).toMatchObject({ status: 'closed', canPost: false, canClose: false });
		expect(closed.closedByName).toBe('Анна Мастерова');
	});

	it('closes once: a second close writes no audit row and no fanout', () => {
		const thread = openThread(employee);

		posting(employee).close(thread.id);
		posting(manager).close(thread.id);

		expect(auditActions().filter((action) => action === 'support.close')).toHaveLength(1);
		expect(fanouts('support.closed')).toHaveLength(1);
	});

	it('lets the cp_admin lead the thread of a deactivated employee', () => {
		const thread = openThread(employee);
		db.update(users).set({ isActive: false }).where(eq(users.id, world.employeeId)).run();

		posting(admin).post(thread.id, { body: 'Отвечу за коллегу' });
		posting(admin).close(thread.id);

		expect(reading(admin).thread(thread.id).status).toBe('closed');
	});

	it('refuses an employee in the thread of a colleague', () => {
		const thread = openThread(admin);

		expect(refused(() => posting(employee).post(thread.id, { body: 'Можно?' })).status).toBe(404);
		expect(refused(() => posting(employee).close(thread.id)).status).toBe(404);
	});

	it('counts opens and replies against support.post', () => {
		const thread = openThread(employee);
		for (let i = 0; i < 29; i += 1) posting(employee).post(thread.id, { body: `Сообщение ${i}` });

		expect(() => posting(employee).post(thread.id, { body: 'Лишнее' })).toThrow(RateLimitError);
	});
});
