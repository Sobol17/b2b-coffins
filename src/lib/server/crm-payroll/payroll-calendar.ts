import { z } from 'zod';
import { ValidationError } from '../core/errors';
import { OrgService } from '../settings/org.service';
import { SettingsRepository } from '../settings/settings.repository';
import { addDays, weekDatesOf, weekStartOf } from '$lib/domain/payroll/calc';
import { startOfDayInZone } from '$lib/domain/time/zone';
import { isoDay } from '$lib/utils/format';

// The seed value of `payroll.week_closing_day`: the week is closed on Mondays.
const FALLBACK_CLOSING_DAY = 1;
const closingDaySchema = z.number().int().min(1).max(7);

/**
 * Payroll days are calendar dates of the workshop, stored as the instant the day starts in
 * `org.timezone`. This is the one place that turns a date into that instant and back.
 */
export class PayrollCalendar {
	constructor(
		private readonly timeZone: string = OrgService.timezone(),
		private readonly closingDay: number = PayrollCalendar.closingDay(),
		private readonly now: () => Date = () => new Date()
	) {}

	/** `payroll.week_closing_day`: the ISO weekday the past week is closed on. */
	static closingDay(repo: SettingsRepository = new SettingsRepository()): number {
		const parsed = closingDaySchema.safeParse(repo.findValue('payroll.week_closing_day'));
		return parsed.success ? parsed.data : FALLBACK_CLOSING_DAY;
	}

	today(): string {
		return isoDay(this.now().toISOString(), this.timeZone);
	}

	moment(): Date {
		return this.now();
	}

	/** @throws ValidationError for a text that is not a calendar date. */
	instantOf(date: string): Date {
		const instant = startOfDayInZone(date, this.timeZone);
		if (instant === null) throw new ValidationError('Такой даты нет', { field: 'date' });
		return instant;
	}

	dateOf(instant: Date): string {
		return isoDay(instant.toISOString(), this.timeZone);
	}

	weekStartOf(date: string): string {
		return weekStartOf(date, this.closingDay);
	}

	weekDatesOf(startsOn: string): string[] {
		return weekDatesOf(startsOn);
	}

	weekEndOf(startsOn: string): string {
		return addDays(startsOn, 6);
	}
}
