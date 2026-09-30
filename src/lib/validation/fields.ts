import { z } from 'zod';

/** An HTML checkbox: the form sends `on` when ticked and nothing at all when not. */
export const checkbox = z.preprocess(
	(value) => value === true || value === 'true' || value === 'on',
	z.boolean()
);
