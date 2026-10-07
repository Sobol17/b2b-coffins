import { resolve } from '$app/paths';
import BellIcon from '@lucide/svelte/icons/bell';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import BuildingIcon from '@lucide/svelte/icons/building-2';
import ChartIcon from '@lucide/svelte/icons/chart-column';
import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
import HammerIcon from '@lucide/svelte/icons/hammer';
import HistoryIcon from '@lucide/svelte/icons/history';
import HouseIcon from '@lucide/svelte/icons/house';
import KanbanIcon from '@lucide/svelte/icons/square-kanban';
import ListIcon from '@lucide/svelte/icons/list';
import PackageIcon from '@lucide/svelte/icons/package';
import SettingsIcon from '@lucide/svelte/icons/settings';
import TagsIcon from '@lucide/svelte/icons/tags';
import TruckIcon from '@lucide/svelte/icons/truck';
import UsersIcon from '@lucide/svelte/icons/users';
import WalletIcon from '@lucide/svelte/icons/wallet';
import type { ShellLink } from '$lib/ui/shell/types';

/** Navigation flags of the CRM layout load. They only hide links: every page checks its own right. */
export interface CrmNavRights {
	readonly requests: boolean;
	readonly shop: boolean;
	readonly delivery: boolean;
	readonly stock: boolean;
	readonly payroll: boolean;
	readonly reports: boolean;
	readonly catalog: boolean;
	readonly counterparties: boolean;
	readonly settings: boolean;
	readonly audit: boolean;
}

/** A sidebar link plus the line the home screen prints under its tile. */
export interface CrmNavLink extends ShellLink {
	readonly group: string;
	readonly hint: string;
}

const WORK = 'Работа';
const BOOKS = 'Учёт';
const SALES = 'Продажи';
const ADMIN = 'Администрирование';

/** One list feeds the sidebar and the home tiles, so the two never name a section differently. */
export function crmNav(can: CrmNavRights): CrmNavLink[] {
	const all: { readonly show: boolean; readonly link: CrmNavLink }[] = [
		{
			show: can.requests,
			link: {
				group: WORK,
				href: resolve('/crm/board'),
				label: 'Доска',
				icon: KanbanIcon,
				hint: 'Заявки по статусам, перенос между колонками'
			}
		},
		{
			show: can.requests,
			link: {
				group: WORK,
				href: resolve('/crm/requests'),
				label: 'Заявки',
				icon: ClipboardListIcon,
				hint: 'Все заявки, поиск, фильтры и выгрузка'
			}
		},
		{
			show: can.shop,
			link: {
				group: WORK,
				href: resolve('/crm/shop'),
				label: 'Цех',
				icon: HammerIcon,
				hint: 'Что сделать сегодня и отметка готовых изделий'
			}
		},
		{
			show: can.delivery,
			link: {
				group: WORK,
				href: resolve('/crm/delivery'),
				label: 'Доставка',
				icon: TruckIcon,
				hint: 'Готовые к выдаче заявки и маршрут'
			}
		},
		{
			show: can.stock,
			link: {
				group: BOOKS,
				href: resolve('/crm/stock'),
				label: 'Склад',
				icon: PackageIcon,
				hint: 'Остатки, движения и инвентаризации'
			}
		},
		{
			show: can.payroll,
			link: {
				group: BOOKS,
				href: resolve('/crm/payroll'),
				label: 'Выплаты',
				icon: WalletIcon,
				hint: 'Отметка дней и недельная ведомость'
			}
		},
		{
			show: can.reports,
			link: {
				group: BOOKS,
				href: resolve('/crm/reports'),
				label: 'Отчёты',
				icon: ChartIcon,
				hint: 'Продажи, долги, склад и фонд'
			}
		},
		{
			show: can.catalog,
			link: {
				group: SALES,
				href: resolve('/crm/catalog'),
				label: 'Каталог',
				icon: BookOpenIcon,
				hint: 'Модели и варианты, которые видит портал'
			}
		},
		{
			show: can.catalog,
			link: {
				group: SALES,
				href: resolve('/crm/prices'),
				label: 'Прайсы и скидки',
				icon: TagsIcon,
				hint: 'Прайс-листы и правила скидок'
			}
		},
		{
			show: can.counterparties,
			link: {
				group: SALES,
				href: resolve('/crm/counterparties'),
				label: 'Контрагенты',
				icon: BuildingIcon,
				hint: 'Агентства, условия и задолженность'
			}
		},
		{
			show: can.settings,
			link: {
				group: ADMIN,
				href: resolve('/crm/settings/users'),
				label: 'Пользователи',
				icon: UsersIcon,
				hint: 'Учётные записи сотрудников и роли'
			}
		},
		{
			show: can.settings,
			link: {
				group: ADMIN,
				href: resolve('/crm/settings/dicts'),
				label: 'Справочники',
				icon: ListIcon,
				hint: 'Материалы, единицы и причины'
			}
		},
		{
			show: can.settings,
			link: {
				group: ADMIN,
				href: resolve('/crm/settings/notifications'),
				label: 'Уведомления',
				icon: BellIcon,
				hint: 'Кто о каком событии узнаёт'
			}
		},
		{
			show: can.settings,
			link: {
				group: ADMIN,
				href: resolve('/crm/settings'),
				label: 'Настройки',
				icon: SettingsIcon,
				hint: 'Реквизиты и параметры мастерской'
			}
		},
		{
			show: can.audit,
			link: {
				group: ADMIN,
				href: resolve('/crm/settings/audit'),
				label: 'Журнал',
				icon: HistoryIcon,
				hint: 'Кто и что менял в системе'
			}
		}
	];
	return all.filter((entry) => entry.show).map((entry) => entry.link);
}

export const CRM_HOME_LINK: ShellLink = {
	href: resolve('/crm'),
	label: 'Главная',
	group: WORK,
	icon: HouseIcon
};
