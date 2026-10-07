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
import { NotificationMatrixService } from '../../src/lib/server/notifications/notification-matrix.service';
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
			channel: 'push',
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
		expect(notificationPrefsSchema.safeParse({ enabled: ['request.ready:push'] }).success).toBe(
			true
		);
		expect(notificationPrefsSchema.safeParse({ enabled: [] }).success).toBe(true);
		expect(notificationPrefsSchema.safeParse({ enabled: ['request.ready:sms'] }).success).toBe(
			false
		);
		expect(notificationPrefsSchema.safeParse({ enabled: ["x' or 1=1:push"] }).success).toBe(false);
	});
});

describe('NotificationSettingsService', () => {
	it('offers the administrator the events of its role on every channel of the matrix', () => {
		const { prefs } = new NotificationSettingsService(admin).settings();

		expect(prefs.filter((p) => p.channel === 'push').map((p) => p.eventKey)).toEqual([
			'request.accepted',
			'request.ready',
			'request.delivered',
			'request.rejected',
			'request.payment_marked',
			'request.paid'
		]);
		expect(prefs.every((p) => p.isDefault)).toBe(true);
		expect(prefs.filter((p) => p.channel === 'push').every((p) => p.enabled)).toBe(true);
		// MAX is offered before its driver: the switch waits switched off until C16.
		expect(prefs.filter((p) => p.channel === 'max')).toHaveLength(6);
		expect(prefs.some((p) => p.channel === 'max' && p.enabled)).toBe(false);
		// Mail left the event channels in v1.49: nothing but push and the bot is on offer.
		expect(JSON.stringify(prefs)).not.toContain('email');
	});

	it('offers an employee only the events of its own role', () => {
		const { prefs } = new NotificationSettingsService(employee).settings();

		expect(prefs.filter((p) => p.channel === 'push').map((p) => p.eventKey)).toEqual([
			'request.accepted',
			'request.ready',
			'request.delivered',
			'request.rejected'
		]);
		expect(prefs).toHaveLength(8);
	});

	it('stores the switches, reads them back and writes the audit row', () => {
		const service = new NotificationSettingsService(admin);

		const saved = service.save({ enabled: ['request.paid:push', 'request.ready:max'] });

		expect(saved.filter((p) => p.enabled).map((p) => `${p.eventKey}:${p.channel}`)).toEqual([
			'request.ready:max',
			'request.paid:push'
		]);
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

		expect(() => service.save({ enabled: ['request.paid:push'] })).toThrow(ValidationError);
		expect(() => service.save({ enabled: ['request.submitted:push'] })).toThrow(ValidationError);
		expect(db.select().from(userNotificationPrefs).all()).toHaveLength(0);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('offers a workshop person the events of the workshop role (C12)', () => {
		const service = new NotificationSettingsService(manager);

		const { prefs } = service.settings();

		expect(prefs.map((p) => `${p.eventKey}:${p.channel}`)).toEqual([
			'request.submitted:push',
			'request.ready:push',
			'request.delivered:push',
			'request.cancelled:push',
			'request.paid:push',
			'stock.below_threshold:push'
		]);
		expect(() => service.save({ enabled: ['request.accepted:push'] })).toThrow(ValidationError);
		expect(service.save({ enabled: ['request.ready:push'] }).filter((p) => p.enabled)).toHaveLength(
			1
		);
	});

	it('refuses an actor whose roles do not open its contour', () => {
		const stray = { ...manager, roles: [] };

		expect(() => new NotificationSettingsService(stray).settings()).toThrow(ForbiddenError);
		expect(() => new NotificationSettingsService(stray).save({ enabled: [] })).toThrow(
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

describe('NotificationMatrixService (C12)', () => {
	const owner = crmActor(
		'owner',
		insertUser({ email: 'own@n.example', role: 'owner', counterpartyId: null })
	);

	it('hands the owner every rule of the seed with the state of its channel', () => {
		const cells = new NotificationMatrixService(owner).cells();

		expect(cells).toContainEqual({
			eventKey: 'stock.below_threshold',
			roleCode: 'manager',
			channel: 'push',
			enabled: true,
			isLive: true
		});
		expect(cells.every((cell) => cell.channel === 'push' || cell.channel === 'max')).toBe(true);
		// Push has a driver since C15, the MAX bot waits for C16.
		expect(cells.every((cell) => cell.isLive === (cell.channel === 'push'))).toBe(true);
	});

	it('refuses everybody but the owner', () => {
		expect(() => new NotificationMatrixService(manager).cells()).toThrow(ForbiddenError);
		expect(() => new NotificationMatrixService(admin).cells()).toThrow(ForbiddenError);
	});
});
