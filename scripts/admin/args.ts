import { parseArgs, type ParseArgsConfig } from 'node:util';
import { z } from 'zod';

type OptionConfig = NonNullable<ParseArgsConfig['options']>;

/** CLI input is untrusted like any other input, so it lands in Zod before it reaches a service. */
export function readOptions<T>(
	argv: readonly string[],
	options: OptionConfig,
	schema: z.ZodType<T>
): T {
	const { values } = parseArgs({ args: [...argv], options, allowPositionals: false });
	const parsed = schema.safeParse(values);
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
	return parsed.data;
}

export const STRING_OPTION = { type: 'string' } as const;
