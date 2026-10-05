import ExcelJS from 'exceljs';
import { OrgService } from '../settings/org.service';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollWeekService } from './payroll-week.service';
import type { ActorContext } from '$lib/types/actor';
import type { PayrollWeekDto } from '$lib/types/crm-payroll';
import { formatDate } from '$lib/utils/format';
import { fromMinor } from '$lib/utils/money';

const MONEY = { numFmt: '#,##0.00' };

/**
 * The payroll sheet of a week as XLSX (tech.md v1.48). Built on the click from the same DTO the
 * screen shows, so the file and the screen cannot disagree.
 */
export class PayrollExportService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly weeks: PayrollWeekService = new PayrollWeekService(ctx),
		private readonly timeZone: string = OrgService.timezone()
	) {
		super(ctx);
	}

	/** The week that holds the date. */
	async sheet(date: string): Promise<{ week: PayrollWeekDto; body: Buffer }> {
		const week = this.weeks.week(date);
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('Ведомость');
		sheet.columns = [
			{ header: 'Сотрудник', key: 'fullName', width: 32 },
			{ header: 'Должность', key: 'position', width: 20 },
			{ header: 'Дней', key: 'days', width: 8 },
			{ header: 'Начислено, ₽', key: 'accrued', width: 16, style: MONEY },
			{ header: 'Корректировка, ₽', key: 'adjustment', width: 18, style: MONEY },
			{ header: 'Комментарий', key: 'comment', width: 32 },
			{ header: 'К выплате, ₽', key: 'payout', width: 16, style: MONEY },
			{ header: 'Выплачено', key: 'paidAt', width: 14 }
		];
		sheet.getRow(1).font = { bold: true };
		// Only people the week owes something to or corrected: the screen also lists the idle ones.
		for (const line of week.lines.filter(
			(row) => row.daysWorked > 0 || row.adjustmentMinor !== 0
		)) {
			sheet.addRow({
				fullName: line.fullName,
				position: line.position ?? '',
				days: line.daysWorked,
				accrued: fromMinor(line.accruedMinor),
				adjustment: fromMinor(line.adjustmentMinor),
				comment: line.adjustmentComment ?? '',
				payout: fromMinor(line.payoutMinor),
				paidAt: line.paidAt ? formatDate(line.paidAt, this.timeZone) : ''
			});
		}
		const total = sheet.addRow({ fullName: 'Итого', payout: fromMinor(week.totalPayoutMinor) });
		total.font = { bold: true };
		return { week, body: Buffer.from(await workbook.xlsx.writeBuffer()) };
	}
}
