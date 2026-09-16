import { describe, expect, it } from 'vitest';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../../src/lib/server/queue/topics';
import { JOB_TOPICS } from '../../src/lib/types/dicts';

// Payload examples written straight from the table in tech.md 7.2, not from the schemas.
const DOCUMENTED = {
	'notification.dispatch': { notificationId: 1 },
	'notification.fanout': { eventKey: 'request.submitted', entityId: 7 },
	'charity.recount': { scope: 'year:2026' },
	'stock.threshold.check': { stockItemId: 4 },
	'import.bom': { mediaId: 5, actorId: 2 },
	'import.rates': { mediaId: 6, actorId: 2 },
	'payroll.calculate': { periodId: 9 },
	'report.export': { reportKey: 'sales', filters: { year: 2026 }, userId: 2 },
	'session.cleanup': {}
} as const;

describe('job payload contract of tech.md 7.2', () => {
	it('covers every topic of JOB_TOPICS', () => {
		expect(Object.keys(JOB_PAYLOAD_SCHEMAS).sort()).toEqual([...JOB_TOPICS].sort());
	});

	it.each(JOB_TOPICS)('accepts the documented payload of %s', (topic) => {
		expect(JOB_PAYLOAD_SCHEMAS[topic].safeParse(DOCUMENTED[topic]).success).toBe(true);
	});

	it.each(JOB_TOPICS)('rejects %s with an extra field', (topic) => {
		const payload = { ...DOCUMENTED[topic], leaked: 'price' };
		expect(JOB_PAYLOAD_SCHEMAS[topic].safeParse(payload).success).toBe(false);
	});

	it('rejects an identifier that is not a positive integer', () => {
		const schema = JOB_PAYLOAD_SCHEMAS['payroll.calculate'];
		expect(schema.safeParse({ periodId: 0 }).success).toBe(false);
		expect(schema.safeParse({ periodId: '9' }).success).toBe(false);
	});

	it('rejects an event key outside the catalog of tech.md 7.3', () => {
		const payload = { eventKey: 'request.defect', entityId: 1 };
		expect(JOB_PAYLOAD_SCHEMAS['notification.fanout'].safeParse(payload).success).toBe(false);
	});

	it('builds idempotency keys in the documented shape', () => {
		expect(jobKey.sessionCleanup(new Date('2026-09-15T23:59:00Z'))).toBe('cleanup:20260915');
		expect(jobKey.fanout('request.ready', 42)).toBe('fanout:request.ready:42');
	});
});
