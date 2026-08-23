import pino from 'pino';
import { config } from './config';

// Structured JSON to stdout, per tech.md 11. Passwords, tokens and e-mails never reach a log line.
export const logger = pino({
	level: config.LOG_LEVEL,
	redact: {
		paths: ['password', 'passwordHash', 'token', 'tokenHash', 'email', '*.password', '*.token'],
		censor: '[redacted]'
	}
});

export type Logger = typeof logger;
