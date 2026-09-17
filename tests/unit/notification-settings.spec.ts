import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedNotificationRules } from '../../scripts/seed/reference';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import {
	auditLog,
	notifications,
	requests,
	userNotificationPrefs
} from '../../src/lib/server/db/schema';
import { NotificationSettingsService } from '../../src/lib/server/notifications/notification-settings.service';
import { notificationPrefsSchema } from '../../src/lib/validation/notifications';
import { crmActor, portalActor, resetRequests, seedOrderingWorld } from './helpers/portal-requests';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
seedNotificationRules(db);
const admin = portalActor('cp_admin', world.adminId, world.cpId);
const employee = portalActor('cp_employee', world.employeeId, world.cpId);
const outsider = portalActor('cp_admin', world.outsiderId, world.otherCpId);
const manager = crmActor(
	'manager',
	insertUser({ email: 'm@n.example', role: 'manager', counterpartyId: null })
);

function addLog(userId: number, entityId: number, status: 'queued' | 'sent' | 'failed' = 'sent') {
	db.insert(notifications)
		.values({
			eventKey: 'request.ready',
			userId,
			channel: 'email',
			payload: { entityId },
			status,
			error: status === 'failed' ? 'smtp.internal.example: 535 auth failed for robot' : null
		})
		.run();
}

function requestOf(counterpartyId: number, number: string): number {
	const [row] = db
		.insert(requests)
		.values({ number, counterpartyId, createdById: world.adminId, status: 'ready' })
		.returning()
		.all();
	return row?.id ?? 0;
}

beforeEach(() => {
	resetRequests(db);
	db.delete(notifications).run();
	db.delete(userNotificationPrefs).run();
	db.delete(auditLog).run();
});

describe('notification settings form contract (P9)', () => {
	it('accepts checked switches and refuses anything else', () => {
		expect(notificationPrefsSchema.safeParse({ enabled: ['request.ready:email'] }).success).toBe(
			true
		);
		expect(notificationPrefsSchema.safeParse({ enabled: [] }).success).toBe(true);
		expect(notificationPrefsSchema.safeParse({ enabled: ['request.ready:sms'] }).success).toBe(
			false
		);
		expect(notificationPrefsSchema.safeParse({ enabled: ["x' or 1=1:email"] }).success).toBe(false);
	});
});

describe('NotificationSettingsService', () => {
	it('offers the administrator the email events of its role, all on by default', () => {
		const { prefs, email } = new NotificationSettingsService(admin).settings();

		expect(email).toBe('admin@rs.example');
		expect(prefs.map((p) => p.eventKey)).toEqual([
			'request.accepted',
			'request.ready',
			'request.delivered',
			'request.rejected',
			'request.payment_marked',
			'request.paid'
		]);
		expect(prefs.every((p) => p.channel === 'email' && p.enabled && p.isDefault)).toBe(true);
	});

	it('offers an employee only the events of its own role', () => {
		const { prefs } = new NotificationSettingsService(employee).settings();

		expect(prefs.map((p) => p.eventKey)).toEqual([
			'request.accepted',
			'request.ready',
			'request.delivered',
			'request.rejected'
		]);
	});

	it('stores the switches, reads them back and writes the audit row', () => {
		const service = new NotificationSettingsService(admin);

		const saved = service.save({ enabled: ['request.paid:email'] });

		expect(saved.filter((p) => p.enabled).map((p) => p.eventKey)).toEqual(['request.paid']);
		expect(saved.every((p) => !p.isDefault)).toBe(true);
		expect(service.settings().prefs).toEqual(saved);
		const [audit] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'notifications.prefs.update'))
			.all();
		expect(audit).toMatchObject({
			actorId: world.adminId,
			entity: 'users',
			entityId: world.adminId
		});
	});

	it('refuses a switch the role is not offered and changes nothing', () => {
		const service = new NotificationSettingsService(employee);

		expect(() => service.save({ enabled: ['request.paid:email'] })).toThrow(ValidationError);
		expect(db.select().from(userNotificationPrefs).all()).toHaveLength(0);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('keeps the workshop out of the portal settings', () => {
		expect(() => new NotificationSettingsService(manager).settings()).toThrow(ForbiddenError);
		expect(() => new NotificationSettingsService(manager).save({ enabled: [] })).toThrow(
			ForbiddenError
		);
	});

	it('shows only the own delivery log, newest first, without driver errors', () => {
		const mine = requestOf(world.cpId, 'З-2026-90001');
		const foreign = requestOf(world.otherCpId, 'З-2026-90002');
		addLog(world.adminId, mine, 'failed');
		addLog(world.adminId, mine);
		addLog(world.employeeId, mine);
		addLog(world.outsiderId, foreign);

		const { log } = new NotificationSettingsService(admin).settings();

		expect(log.total).toBe(2);
		expect(log.rows.map((row) => row.status)).toEqual(['sent', 'failed']);
		expect(log.rows[0]).toMatchObject({ requestId: mine, requestNumber: 'З-2026-90001' });
		expect(JSON.stringify(log)).not.toContain('smtp.internal');
		expect(new NotificationSettingsService(outsider).settings().log.rows[0]?.requestNumber).toBe(
			'З-2026-90002'
		);
	});

	it('never names a foreign request in the log even if a row points at one', () => {
		const foreign = requestOf(world.otherCpId, 'З-2026-90003');
		addLog(world.adminId, foreign);

		const [row] = new NotificationSettingsService(admin).settings().log.rows;

		expect(row).toMatchObject({ requestId: null, requestNumber: null });
	});

	it('pages the log on the server', () => {
		const mine = requestOf(world.cpId, 'З-2026-90004');
		for (let n = 0; n < 5; n += 1) addLog(world.adminId, mine);

		const { log } = new NotificationSettingsService(admin).settings({ page: 2, perPage: 2 });

		expect(log).toMatchObject({ total: 5, page: 2, perPage: 2 });
		expect(log.rows).toHaveLength(2);
	});
});
