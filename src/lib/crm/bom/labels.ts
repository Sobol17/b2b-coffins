import type { BomFileError, BomImportStatus, BomRowError } from '$lib/types/crm-bom';
import { formatMilli } from '$lib/utils/milli';

export const ROW_ERROR_TITLE: Readonly<Record<BomRowError, string>> = {
	unknown_variant: 'Артикула нет в каталоге',
	unknown_component: 'Кода нет на складе',
	not_component: 'Позиция не комплектующее',
	bad_qty: 'Норма не число больше нуля',
	duplicate: 'Пара повторяется в файле'
};

export const FILE_ERROR_TITLE: Readonly<Record<BomFileError, string>> = {
	unreadable: 'Файл не открывается. Сохраните его как XLSX или CSV и загрузите заново',
	bad_header:
		'В первой строке нет колонок «Артикул варианта», «Код комплектующего», «Норма на единицу»',
	empty: 'В файле нет строк с нормами',
	too_many_rows: 'В файле больше 5000 строк. Разбейте его на части'
};

export const IMPORT_STATUS_TEXT: Readonly<Record<BomImportStatus, string>> = {
	queued: 'Файл в очереди импорта. Обновите страницу через несколько секунд',
	done: 'Файл импортирован',
	failed:
		'Импорт не прошёл: каталог или склад изменились после предпросмотра. Загрузите файл заново'
};

/** "2,4 м2": a quantity kept in thousandths, shown as on paper. */
export function milliWithUnit(milli: number, unitTitle: string): string {
	return `${formatMilli(milli)} ${unitTitle}`;
}
