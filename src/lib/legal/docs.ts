import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

export interface LegalDoc {
	readonly href: ResolvedPathname;
	readonly title: string;
}

/** Edition date the four documents carry. Bump it with any change of their text. */
export const LEGAL_EDITION = '22.10.2026';

/** The public documents of the site, in the order the footer and the index list them. */
export const LEGAL_DOCS: readonly LegalDoc[] = [
	{ href: resolve('/legal/terms'), title: 'Пользовательское соглашение' },
	{ href: resolve('/legal/personal-data'), title: 'Политика обработки персональных данных' },
	{ href: resolve('/legal/privacy'), title: 'Политика конфиденциальности' },
	{ href: resolve('/legal/cookies'), title: 'Соглашение об использовании cookie' }
];
