import { z } from 'zod';

export const mediaIdSchema = z.coerce.number().int().positive();
