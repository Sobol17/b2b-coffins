import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { BomFileReader } from '../../src/lib/server/crm-bom/bom-file.reader';
import { BomImportService } from '../../src/lib/server/crm-bom/bom-import.service';
import { BomMediaRepository } from '../../src/lib/server/crm-bom/bom-media.repository';
import { BomNormRepository } from '../../src/lib/server/crm-bom/bom-norm.repository';
import { BomVersionRepository } from '../../src/lib/server/crm-bom/bom-version.repository';
import { BomService } from '../../src/lib/server/crm-bom/bom.service';
import { auditLog, bomVersions, jobQueue, media, rateLimits } from '../../src/lib/server/db/schema';
import { FileAccessService } from '../../src/lib/server/files/file-access.service';
import { backoffSeconds } from '../../src/lib/server/queue/backoff';
import { createImportBomHandler } from '../../src/lib/server/queue/handlers/import-bom';
import { InvalidPayloadError } from '../../src/lib/server/queue/job-handler';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { BOM_FILE_COLUMNS, BOM_IMPORT_MAX_BYTES } from '../../src/lib/types/crm-bom';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, seedOrderingWorld } from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const root = mkdtempSync(join(tmpdir(), 'c9-import-'));
const managerId = insertUser({ email: 'mgr@c9i.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);
const jobCtx = { jobId: 1, attempt: 1, now: new Date(), logger: pino({ level: 'silent' }) };

const CLEAN = [
	['MDL-201-180-PIN', 'CMP-BOARD-PINE', '2,4'],
	['MDL-201-180-PIN', 'CMP-LACQUER', '0.35'],
	['MDL-101-180-CHB', 'CMP-CHIPBOARD', '3']
];

function csv(rows: readonly (readonly string[])[], separator = ';'): Buffer {
	return Buffer.from([BOM_FILE_COLUMNS, ...rows].map((row) => row.join(separator)).join('\r\n'));
}

async function xlsx(rows: readonly (readonly (string | number)[])[]): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Нормы');
	sheet.addRow([...BOM_FILE_COLUMNS]);
	for (const row of rows) sheet.addRow([...row]);
	return Buffer.from(await workbook.xlsx.writeBuffer());
}

const imports = (ctx = manager) => new BomImportService(ctx, root);
const reader = () => new BomFileReader(new BomMediaRepository(), new BomNormRepository(), root);
const handler = (fileReader: Pick<BomFileReader, 'table' | 'check'> = reader()) =>
	createImportBomHandler({
		reader: fileReader,
		versions: new BomVersionRepository(),
		norms: new BomNormRepository()
	});
// The real clock by default: `visible_at` is stored in whole seconds at enqueue time.
const worker = (
	fileReader?: Pick<BomFileReader, 'table' | 'check'>,
	clock: () => Date = () => new Date()
) => new Worker({ handlers: [handler(fileReader)], clock });
const versions = () => new BomService(manager).page().versions;
const importJobs = () => db.select().from(jobQueue).where(eq(jobQueue.topic, 'import.bom')).all();
const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => {
	db.delete(bomVersions).run();
	db.delete(jobQueue).run();
	db.delete(auditLog).run();
	db.delete(rateLimits).run();
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('upload of a norm file (C9)', () => {
	it('stores XLSX and CSV by their content under a server name, with an audit row', async () => {
		const sheet = await imports().upload(await xlsx(CLEAN));
		const text = await imports().upload(csv(CLEAN));

		const rows = db.select().from(media).where(eq(media.ownerScope, 'import')).all();
		expect(rows.map((row) => [row.id, row.mime])).toEqual([
			[sheet, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
			[text, 'text/csv']
		]);
		expect(rows.every((row) => /^import\/bom\/[0-9a-f]{24}\.(xlsx|csv)$/.test(row.path))).toBe(
			true
		);
		expect(audit('bom.file.upload')).toHaveLength(2);
	});

	it('refuses a binary that is not a sheet, an empty file and a file over the limit', async () => {
		const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
		const stored = () => db.select().from(media).where(eq(media.ownerScope, 'import')).all().length;
		const before = stored();

		for (const bytes of [png, Buffer.alloc(0), Buffer.alloc(BOM_IMPORT_MAX_BYTES + 1, 0x61)]) {
			await expect(imports().upload(bytes)).rejects.toBeInstanceOf(ValidationError);
		}

		expect(stored()).toBe(before);
	});

	it('is closed without stock.manage, and the file is not served by /api/files', async () => {
		expect(() => imports(crmActor('carpenter', managerId))).toThrow(ForbiddenError);
		expect(() => imports(crmActor('driver', managerId))).toThrow(ForbiddenError);
		const id = await imports().upload(csv(CLEAN));
		await expect(new FileAccessService(manager).open(id)).rejects.toBeInstanceOf(ForbiddenError);
	});
});

describe('preview and the error report (C9 DoD)', () => {
	it('reads the same norms from XLSX with numeric cells and from CSV', async () => {
		const sheet = await imports().preview(
			await imports().upload(
				await xlsx([['MDL-201-180-PIN', 'CMP-LACQUER', 0.35], ...CLEAN.slice(2)])
			)
		);
		const text = await imports().preview(await imports().upload(csv(CLEAN.slice(1))));

		expect(sheet).toMatchObject({ rowCount: 2, errorCount: 0, fileError: null, canImport: true });
		expect(sheet.rows.map((row) => row.qtyPerUnitMilli)).toEqual([350, 3000]);
		expect(text.rows.map((row) => row.qtyPerUnitMilli)).toEqual([350, 3000]);
	});

	it('reads a CSV saved by Excel in Windows-1251 with a comma separator', async () => {
		const header = Buffer.from([
			...[
				0xc0, 0xf0, 0xf2, 0xe8, 0xea, 0xf3, 0xeb, 0x20, 0xe2, 0xe0, 0xf0, 0xe8, 0xe0, 0xed, 0xf2,
				0xe0
			],
			0x2c,
			...[
				0xca, 0xee, 0xe4, 0x20, 0xea, 0xee, 0xec, 0xef, 0xeb, 0xe5, 0xea, 0xf2, 0xf3, 0xfe, 0xf9,
				0xe5, 0xe3, 0xee
			],
			0x2c,
			...[
				0xcd, 0xee, 0xf0, 0xec, 0xe0, 0x20, 0xed, 0xe0, 0x20, 0xe5, 0xe4, 0xe8, 0xed, 0xe8, 0xf6,
				0xf3
			]
		]);
		const file = Buffer.concat([header, Buffer.from('\r\nMDL-201-180-PIN,CMP-LACQUER,0.35\r\n')]);

		const preview = await imports().preview(await imports().upload(file));

		expect(preview).toMatchObject({ rowCount: 1, canImport: true });
	});

	it('lists the rows with errors first and refuses to import the file', async () => {
		const id = await imports().upload(
			csv([...CLEAN, ['MDL-NONE', 'CMP-LACQUER', '1'], ['MDL-201-180-PIN', 'MDL-201-180-PIN', 'x']])
		);

		const preview = await imports().preview(id);

		expect(preview).toMatchObject({ rowCount: 5, errorCount: 2, canImport: false });
		expect(preview.rows.slice(0, 2).map((row) => [row.line, row.errors])).toEqual([
			[5, ['unknown_variant']],
			[6, ['not_component', 'bad_qty']]
		]);
		await expect(imports().confirm(id)).rejects.toBeInstanceOf(ValidationError);
		expect(importJobs()).toEqual([]);
	});

	it('names a file without the header and an unknown file id', async () => {
		const id = await imports().upload(Buffer.from('a;b;c\r\n1;2;3'));

		expect(await imports().preview(id)).toMatchObject({
			fileError: 'bad_header',
			canImport: false
		});
		await expect(imports().preview(999_999)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('the job contract of import.bom (tech.md 7.2)', () => {
	it('queues the documented payload under the documented key, once per file', async () => {
		const id = await imports().upload(csv(CLEAN));

		await imports().confirm(id);
		await imports().confirm(id);

		const jobs = importJobs();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.payload).toEqual({ mediaId: id, actorId: managerId });
		expect(JOB_PAYLOAD_SCHEMAS['import.bom'].safeParse(jobs[0]?.payload).success).toBe(true);
		expect(jobs[0]?.idempotencyKey).toBe(`import-bom:${id}`);
		expect(jobKey.importBom(5)).toBe('import-bom:5');
		expect(imports().state(id)).toEqual({ mediaId: id, status: 'queued', version: null });
	});

	it('refuses a payload outside the schema', async () => {
		await expect(handler().run({ mediaId: 'five', actorId: 1 }, jobCtx)).rejects.toBeInstanceOf(
			InvalidPayloadError
		);
	});
});

describe('the business file makes a version of the norms (C9 DoD)', () => {
	it('creates the next version with every norm, makes it active and writes the audit', async () => {
		const previous = new BomService(manager).createVersion();
		const id = await imports().upload(await xlsx(CLEAN));
		await imports().confirm(id);

		await worker().drain();

		const [created, old] = versions();
		expect(created).toMatchObject({ version: 2, isActive: true, sourceFileId: id, normCount: 3 });
		expect(old).toMatchObject({ id: previous, isActive: false });
		const norms = new BomService(manager).norms(created?.id ?? 0, normalizeListQuery({})).rows;
		expect(norms.map((row) => [row.variantSku, row.componentCode, row.qtyPerUnitMilli])).toEqual([
			['MDL-101-180-CHB', 'CMP-CHIPBOARD', 3000],
			['MDL-201-180-PIN', 'CMP-BOARD-PINE', 2400],
			['MDL-201-180-PIN', 'CMP-LACQUER', 350]
		]);
		expect(audit('bom.import')[0]).toMatchObject({
			actorId: managerId,
			entityId: created?.id,
			after: { version: 2, mediaId: id, normCount: 3 }
		});
		expect(imports().state(id)).toEqual({ mediaId: id, status: 'done', version: 2 });
	});

	it('leaves one version when the handler runs twice with the same payload', async () => {
		const id = await imports().upload(csv(CLEAN));
		const payload = { mediaId: id, actorId: managerId };

		await handler().run(payload, jobCtx);
		await handler().run(payload, jobCtx);

		expect(versions()).toHaveLength(1);
		expect(versions()[0]?.normCount).toBe(3);
		expect(audit('bom.import')).toHaveLength(1);
	});
});

describe('the error path of import.bom', () => {
	it('moves a file with a broken row to dead at once, with no version and no norm', async () => {
		const id = await imports().upload(csv([...CLEAN, ['MDL-NONE', 'CMP-LACQUER', '1']]));
		// Queued behind the back of the service: the screen would have refused this file.
		db.insert(jobQueue)
			.values({
				topic: 'import.bom',
				payload: { mediaId: id, actorId: managerId },
				idempotencyKey: jobKey.importBom(id),
				visibleAt: new Date(Date.now() - 1000)
			})
			.run();

		await worker().drain();

		expect(importJobs().map((job) => [job.status, job.attempts])).toEqual([['dead', 1]]);
		expect(versions()).toEqual([]);
		expect(imports().state(id)).toEqual({ mediaId: id, status: 'failed', version: null });
	});

	it('moves a job for a missing file to dead at once', async () => {
		await expect(
			handler().run({ mediaId: 999_999, actorId: managerId }, jobCtx)
		).rejects.toBeInstanceOf(InvalidPayloadError);
	});

	it('retries a failing read with backoff and imports once the file opens', async () => {
		const id = await imports().upload(csv(CLEAN));
		await imports().confirm(id);
		let failures = 2;
		const real = reader();
		const flaky: Pick<BomFileReader, 'table' | 'check'> = {
			table: (mediaId) => {
				if (failures-- > 0) throw new Error('disk is busy');
				return real.table(mediaId);
			},
			check: (table, tx) => real.check(table, tx)
		};
		let offsetMs = 0;
		const run = worker(flaky, () => new Date(Date.now() + offsetMs));

		await run.drain();
		expect(importJobs()[0]).toMatchObject({
			status: 'pending',
			attempts: 1,
			lastError: 'disk is busy'
		});
		expect(versions()).toEqual([]);
		for (const attempt of [1, 2]) {
			offsetMs += (backoffSeconds(attempt) + 1) * 1000;
			await run.drain();
		}

		expect(importJobs()[0]).toMatchObject({ status: 'done', attempts: 3 });
		expect(versions()).toHaveLength(1);
	});

	it('gives up as dead after the last attempt and leaves no partial version', async () => {
		const id = await imports().upload(csv(CLEAN));
		await imports().confirm(id);
		const broken: Pick<BomFileReader, 'table' | 'check'> = {
			table: () => Promise.reject(new Error('disk is gone')),
			check: (table, tx) => reader().check(table, tx)
		};
		let offsetMs = 0;
		const run = worker(broken, () => new Date(Date.now() + offsetMs));

		for (let attempt = 1; attempt <= 5; attempt += 1) {
			await run.drain();
			offsetMs += (backoffSeconds(attempt) + 1) * 1000;
		}

		expect(importJobs().map((job) => [job.status, job.attempts])).toEqual([['dead', 5]]);
		expect(versions()).toEqual([]);
		expect(imports().state(id)?.status).toBe('failed');
	});
});
