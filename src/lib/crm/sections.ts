import { resolve } from '$app/paths';

/* Pages of each CRM section, in the order SectionTabs prints them. */

export const REPORT_TABS = [
	{ href: resolve('/crm/reports'), label: 'Сводка' },
	{ href: resolve('/crm/reports/sales'), label: 'Продажи' },
	{ href: resolve('/crm/reports/stock'), label: 'Склад' },
	{ href: resolve('/crm/reports/funnel'), label: 'Воронка' },
	{ href: resolve('/crm/reports/lost'), label: 'Отменённые и отклонённые' },
	{ href: resolve('/crm/reports/charity'), label: 'Фонд' },
	// The payroll report of C10 stays where it is, under its own right.
	{ href: resolve('/crm/payroll/reports'), label: 'Выплаты' }
];

export const PAYROLL_TABS = [
	{ href: resolve('/crm/payroll'), label: 'Неделя' },
	{ href: resolve('/crm/payroll/staff'), label: 'Сотрудники' },
	{ href: resolve('/crm/payroll/works'), label: 'Работы и стоимость' },
	{ href: resolve('/crm/payroll/reports'), label: 'Отчёт' }
];

export const STOCK_TABS = [
	{ href: resolve('/crm/stock'), label: 'Остатки' },
	{ href: resolve('/crm/stock/inventories'), label: 'Инвентаризации' }
];

export const CATALOG_TABS = [
	{ href: resolve('/crm/catalog'), label: 'Модели' },
	{ href: resolve('/crm/catalog/categories'), label: 'Категории' },
	{ href: resolve('/crm/catalog/options'), label: 'Цвета' }
];

export const NOTIFICATION_TABS = [
	{ href: resolve('/crm/settings/notifications'), label: 'Матрица' },
	{ href: resolve('/crm/settings/notifications/templates'), label: 'Шаблоны' },
	{ href: resolve('/crm/settings/notifications/log'), label: 'Журнал отправок' }
];
