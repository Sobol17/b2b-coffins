import type { SelectOption, StatusTone } from '$lib/ui';
import type { SettlementScheme, StaffStatus } from '$lib/types/counterparty';
import type { PaymentMethod } from '$lib/types/crm-counterparty';
import type { CrmRole, NumberingPeriod } from '$lib/types/crm';
import type { DictCode } from '$lib/types/dicts';
import type { RoleCode } from '$lib/types/roles';

/** Same titles as the `roles` seed: the shell, the forms and the tables speak one language. */
export const ROLE_TITLE: Readonly<Record<RoleCode, string>> = {
	owner: 'Руководитель',
	manager: 'Менеджер',
	carpenter: 'Столяр',
	painter: 'Маляр',
	driver: 'Водитель',
	cp_admin: 'Администратор контрагента',
	cp_employee: 'Сотрудник контрагента'
};

export const CRM_ROLE_OPTIONS: readonly (SelectOption & { value: CrmRole })[] = (
	['owner', 'manager', 'carpenter', 'painter', 'driver'] as const
).map((value) => ({ value, label: ROLE_TITLE[value] }));

export const USER_STATUS_OPTIONS: readonly (SelectOption & { value: StaffStatus })[] = [
	{ value: 'active', label: 'Активен' },
	{ value: 'invited', label: 'Приглашён' },
	{ value: 'disabled', label: 'Отключён' }
];

/** Tones come from the status dictionary of the kit, so the badge follows the palette. */
export const USER_STATUS_TONE: Readonly<Record<StaffStatus, StatusTone>> = {
	active: 'success',
	invited: 'info',
	disabled: 'neutral'
};

export const DICT_TITLE: Readonly<Record<DictCode, string>> = {
	material: 'Материалы',
	finish: 'Отделка',
	fabric: 'Ткани',
	hardware: 'Фурнитура',
	unit: 'Единицы измерения',
	work_type: 'Виды работ',
	refusal_reason: 'Причины отказа',
	stock_move_reason: 'Причины движений склада',
	transport: 'Транспорт'
};

export const PERIOD_OPTIONS: readonly (SelectOption & { value: NumberingPeriod })[] = [
	{ value: 'year', label: 'Год' },
	{ value: 'month', label: 'Месяц' },
	{ value: 'none', label: 'Без периода' }
];

/** Journal actions in words. An action without a label shows its code: new slices add theirs. */
export const AUDIT_ACTION_TITLE: Readonly<Record<string, string>> = {
	'auth.login': 'Вход',
	'auth.login_failed': 'Неудачный вход',
	'auth.locked': 'Блокировка входа',
	'auth.password_changed': 'Смена пароля',
	'auth.password_reset': 'Восстановление пароля',
	'crm_user.create': 'Пользователь создан',
	'crm_user.roles_change': 'Роли изменены',
	'crm_user.enable': 'Доступ включён',
	'crm_user.disable': 'Доступ отключён',
	'crm_user.password_reset': 'Пароль сброшен',
	'dict.create': 'Запись справочника создана',
	'dict.update': 'Запись справочника изменена',
	'dict.enable': 'Запись справочника включена',
	'dict.disable': 'Запись справочника выключена',
	'settings.update': 'Настройки изменены',
	'numbering.update': 'Нумерация изменена',
	'staff.create': 'Сотрудник контрагента создан',
	'staff.role_change': 'Роль сотрудника контрагента изменена',
	'staff.enable': 'Сотрудник контрагента включён',
	'staff.disable': 'Сотрудник контрагента отключён',
	'profile.update': 'Профиль изменён',
	'agency_price.set': 'Цена агентства изменена',
	'notifications.prefs.update': 'Настройки уведомлений изменены',
	'request.draft_item_add': 'Позиция добавлена в черновик',
	'request.draft_item_qty': 'Количество в черновике изменено',
	'request.draft_item_remove': 'Позиция удалена из черновика',
	'request.draft_details': 'Отгрузка черновика изменена',
	'request.draft_clear': 'Черновик очищен',
	'request.repeat': 'Заявка повторена',
	'request.submit': 'Заявка отправлена',
	'request.transition': 'Статус заявки изменён',
	'request.comment': 'Комментарий к заявке',
	'request.attach': 'Вложение к заявке',
	'request.create': 'Заявка заведена в мастерской',
	'request.items_update': 'Состав заявки изменён',
	'request.assign': 'Исполнитель назначен',
	'request.unassign': 'Исполнитель снят',
	'request.priority': 'Приоритет заявки изменён',
	'counterparty.create': 'Контрагент заведён',
	'counterparty.update': 'Реквизиты контрагента изменены',
	'counterparty.terms_update': 'Условия контрагента изменены',
	'counterparty.notes_update': 'Заметки о контрагенте изменены',
	'counterparty.contract_create': 'Договор добавлен',
	'counterparty.contract_update': 'Договор изменён',
	'counterparty.contract_delete': 'Договор удалён',
	'counterparty.address_create': 'Адрес доставки добавлен',
	'counterparty.address_update': 'Адрес доставки изменён',
	'counterparty.address_delete': 'Адрес доставки удалён',
	'counterparty.address_default': 'Адрес по умолчанию выбран',
	'counterparty.admin_issue': 'Администратор контрагента выдан',
	'counterparty.admin_promote': 'Сотрудник назначен администратором',
	'counterparty.access_resend': 'Доступ контрагенту выдан повторно'
};

export const AUDIT_ENTITY_TITLE: Readonly<Record<string, string>> = {
	users: 'Пользователь',
	dict_items: 'Справочник',
	settings: 'Настройки',
	numbering_sequences: 'Нумерация',
	requests: 'Заявка',
	comments: 'Комментарий',
	media: 'Файл',
	counterparty_product_price: 'Цена агентства',
	counterparties: 'Контрагент',
	contracts: 'Договор',
	delivery_addresses: 'Адрес доставки'
};

export const SCHEME_OPTIONS: readonly (SelectOption & { value: SettlementScheme })[] = [
	{ value: 'on_fact', label: 'По факту' },
	{ value: 'weekly', label: 'Раз в неделю' },
	{ value: 'monthly', label: 'Раз в месяц' }
];

export const PAYMENT_METHOD_TITLE: Readonly<Record<PaymentMethod, string>> = {
	cash: 'Наличные',
	bank: 'Банковский перевод',
	card: 'Карта',
	offset: 'Взаимозачёт'
};

/** Zones of Russia: the workshop and its customers live in them. A stored value outside stays listed. */
export const TIMEZONE_OPTIONS: readonly SelectOption[] = [
	{ value: 'Europe/Kaliningrad', label: 'Калининград, UTC+2' },
	{ value: 'Europe/Moscow', label: 'Москва, UTC+3' },
	{ value: 'Europe/Samara', label: 'Самара, UTC+4' },
	{ value: 'Asia/Yekaterinburg', label: 'Екатеринбург, UTC+5' },
	{ value: 'Asia/Omsk', label: 'Омск, UTC+6' },
	{ value: 'Asia/Novosibirsk', label: 'Новосибирск, UTC+7' },
	{ value: 'Asia/Krasnoyarsk', label: 'Красноярск, UTC+7' },
	{ value: 'Asia/Irkutsk', label: 'Иркутск, UTC+8' },
	{ value: 'Asia/Yakutsk', label: 'Якутск, UTC+9' },
	{ value: 'Asia/Vladivostok', label: 'Владивосток, UTC+10' },
	{ value: 'Asia/Magadan', label: 'Магадан, UTC+11' },
	{ value: 'Asia/Kamchatka', label: 'Петропавловск-Камчатский, UTC+12' }
];
