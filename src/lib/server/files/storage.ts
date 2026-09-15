import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { config } from '../config';

/**
 * Absolute path of a stored file, or null when the relative path climbs out of the files root.
 * `media.path` is written by the server, so this guards against a corrupted row, not a user.
 */
export function storedFilePath(
	relativePath: string,
	root: string = config.FILES_DIR
): string | null {
	const base = resolve(root);
	const full = resolve(base, relativePath);
	const inside = relative(base, full);
	if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null;
	return full;
}

export async function readStoredFile(
	relativePath: string,
	root: string = config.FILES_DIR
): Promise<Buffer | null> {
	const full = storedFilePath(relativePath, root);
	if (full === null) return null;
	try {
		return await readFile(full);
	} catch {
		return null;
	}
}
