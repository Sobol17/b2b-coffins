import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { profileNavItems, type ProfileNavRights } from '../profile-nav';

export interface PortalSection {
	readonly href: ResolvedPathname;
	readonly label: string;
	/** Words people type for the page when they do not know its title. */
	readonly aliases: readonly string[];
}

const ALIASES: Readonly<Record<string, readonly string[]>> = {
	Главная: ['начало', 'домой'],
	Каталог: ['товары', 'модели', 'гробы', 'кресты'],
	Заявка: ['корзина', 'черновик', 'оформить'],
	Профиль: ['аккаунт', 'реквизиты', 'договор', 'пароль'],
	'Мои сотрудники': ['доступ', 'пользователи', 'персонал'],
	'Мои цены': ['прайс', 'цена агентства'],
	'Мои заявки': ['история', 'заказы'],
	Уведомления: ['письма', 'почта', 'рассылка']
};

/** Pages the role can open, in menu order. A hint, not a guard: each page checks the right itself. */
export function portalSections(rights: ProfileNavRights): PortalSection[] {
	const pages = [
		{ href: resolve('/portal'), label: 'Главная' },
		{ href: resolve('/portal/catalog'), label: 'Каталог' },
		{ href: resolve('/portal/cart'), label: 'Заявка' },
		...profileNavItems('profile', rights)
	];
	return pages.map(({ href, label }) => ({ href, label, aliases: ALIASES[label] ?? [] }));
}

export function matchSections(sections: readonly PortalSection[], query: string): PortalSection[] {
	const needles = wordsOf(query);
	if (needles.length === 0) return [...sections];
	// Word starts only: two typed letters would otherwise hit a fragment deep inside some alias.
	return sections.filter((section) => {
		const words = [section.label, ...section.aliases].flatMap(wordsOf);
		return needles.every((needle) => words.some((word) => word.startsWith(needle)));
	});
}

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word !== '');
}
