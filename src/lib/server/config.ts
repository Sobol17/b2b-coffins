import { z } from 'zod';

// Single place that reads process.env. Every other module imports `config` from here.
const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	ORIGIN: z.url().default('http://localhost:3000'),
	DATABASE_PATH: z.string().min(1).default('./data/app.db'),
	FILES_DIR: z.string().min(1).default('./data/files'),
	SESSION_SECRET: z.string().min(32),
	SMTP_HOST: z.string().default(''),
	SMTP_PORT: z.coerce.number().int().positive().default(587),
	SMTP_USER: z.string().default(''),
	SMTP_PASS: z.string().default(''),
	MAIL_FROM: z.string().default(''),
	VAPID_PUBLIC_KEY: z.string().default(''),
	VAPID_PRIVATE_KEY: z.string().default(''),
	VAPID_SUBJECT: z.string().default('mailto:'),
	MAIL_DRIVER: z.enum(['fake', 'smtp']).default('fake'),
	PUSH_DRIVER: z.enum(['fake', 'webpush']).default('fake'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info')
});

export type AppConfig = Readonly<z.infer<typeof envSchema>>;

function loadConfig(): AppConfig {
	const parsed = envSchema.safeParse(process.env);
	if (!parsed.success) {
		// Fail fast on boot: a half-configured process corrupts data instead of erroring loudly.
		const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
		throw new Error(`Invalid environment configuration: ${issues}`);
	}
	return Object.freeze(parsed.data);
}

export const config: AppConfig = loadConfig();

export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
