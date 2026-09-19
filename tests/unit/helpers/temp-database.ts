import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface TemporaryUnitDatabase {
	readonly path: string;
	readonly cleanup: () => void;
}

export function temporaryUnitDatabase(): TemporaryUnitDatabase {
	const directory = mkdtempSync(join(tmpdir(), 'b2b-unit-'));

	return {
		path: join(directory, 'unit.db'),
		cleanup: () => rmSync(directory, { recursive: true, force: true })
	};
}
