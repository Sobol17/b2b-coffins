import { execFileSync } from 'node:child_process';
import { ACCOUNTS, type RoleKey } from './fixtures';
import type { RequestStatus } from '../../src/lib/types/request';

export const E2E_DATABASE_PATH = './data/e2e.db';

export interface TransitionResult {
	readonly ok: boolean;
	readonly output: string;
}

const LOCK_ATTEMPTS = 8;
const LOCK_PAUSE_MS = 250;

/**
 * Moves a request the way an operator does it until the CRM screens arrive in C4 to C7: through
 * `pnpm admin`, against the e2e database, with the rights of a real account.
 *
 * The move reads before it writes in one transaction. When the preview's queue worker commits in
 * between, SQLite refuses the upgrade at once with `database is locked`, busy_timeout or not. The
 * transaction rolls back whole, so the command is simply run again.
 */
export function transition(
	number: string,
	to: RequestStatus,
	actor: RoleKey,
	note: { reason?: string; comment?: string } = {}
): TransitionResult {
	const result = retried(() => runTransition(number, to, actor, note));
	if (!result.ok) {
		// Specs assert on `ok` alone; the reason of an unexpected refusal belongs in the run log.
		console.error(`request:transition ${number} -> ${to} failed:\n${result.output}`);
	}
	return result;
}

/**
 * `pnpm admin shop:sync` (tech.md §2): the dispatch and the readiness after pieces a spec put on
 * the shelf by hand, which no service saw being written.
 */
export function shopSync(): TransitionResult {
	const result = retried(() => runAdmin(['admin', 'shop:sync']));
	if (!result.ok) console.error(`shop:sync failed:\n${result.output}`);
	return result;
}

function retried(run: () => TransitionResult): TransitionResult {
	let result = run();
	for (let attempt = 1; attempt < LOCK_ATTEMPTS && isLocked(result); attempt++) {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_PAUSE_MS * attempt);
		result = run();
	}
	return result;
}

function isLocked(result: TransitionResult): boolean {
	return !result.ok && result.output.includes('database is locked');
}

function runTransition(
	number: string,
	to: RequestStatus,
	actor: RoleKey,
	note: { reason?: string; comment?: string }
): TransitionResult {
	const argv = [
		'admin',
		'request:transition',
		'--request',
		number,
		'--to',
		to,
		'--actor',
		ACCOUNTS[actor].email,
		...(note.reason ? ['--reason', note.reason] : []),
		...(note.comment ? ['--comment', note.comment] : [])
	];
	return runAdmin(argv);
}

function runAdmin(argv: readonly string[]): TransitionResult {
	try {
		const output = execFileSync('pnpm', [...argv], {
			encoding: 'utf8',
			stdio: 'pipe',
			env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH }
		});
		return { ok: true, output };
	} catch (err) {
		const failed = err as { stdout?: string; stderr?: string };
		return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
	}
}
