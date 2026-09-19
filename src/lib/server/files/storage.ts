import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { config } from '../config';

/** Bytes of a stored file plus the media type the route answers with. */
export interface FileContent {
	readonly mime: string;
	readonly bytes: Buffer;
}

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

/**
 * Writes a file the server placed itself. The path comes from the domain, never from the client,
 * and a path that climbs out of the root is a bug rather than an attack: it fails loudly.
 */
export async function writeStoredFile(
	relativePath: string,
	bytes: Buffer,
	root: string = config.FILES_DIR
): Promise<void> {
	const full = storedFilePath(relativePath, root);
	if (full === null) throw new Error(`stored path escapes the files root: ${relativePath}`);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, bytes);
}
