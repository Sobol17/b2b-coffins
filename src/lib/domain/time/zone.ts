const DAY_MS = 86_400_000;

/** How far the wall clock of the zone runs ahead of UTC at that moment, in milliseconds. */
function zoneOffsetMs(at: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(at));
	const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
	const wall = Date.UTC(
		value('year'),
		value('month') - 1,
		value('day'),
		value('hour') % 24,
		value('minute'),
		value('second')
	);
	return wall - at;
}

/**
 * Midnight UTC of the date, or NaN when the text is not a calendar date. The round trip is what
 * rejects the 31st of February: the parser rolls such a day over to March instead of refusing it.
 */
function wallMidnight(isoDate: string): number {
	const wall = Date.parse(`${isoDate}T00:00:00.000Z`);
	if (Number.isNaN(wall)) return Number.NaN;
	return new Date(wall).toISOString().slice(0, 10) === isoDate ? wall : Number.NaN;
}

/**
 * The instant a calendar day starts in the zone, or null when the date is not a date. The offset is
 * read twice because it is the offset of the answer, not of the guess, that shifts the day start.
 */
export function startOfDayInZone(isoDate: string, timeZone: string): Date | null {
	const wall = wallMidnight(isoDate);
	if (Number.isNaN(wall)) return null;
	const guess = wall - zoneOffsetMs(wall, timeZone);
	return new Date(wall - zoneOffsetMs(guess, timeZone));
}

/** The last millisecond of the day, so a filter written as a date keeps that whole day. */
export function endOfDayInZone(isoDate: string, timeZone: string): Date | null {
	const wall = wallMidnight(isoDate);
	if (Number.isNaN(wall)) return null;
	const nextDay = new Date(wall + DAY_MS).toISOString().slice(0, 10);
	const nextStart = startOfDayInZone(nextDay, timeZone);
	return nextStart === null ? null : new Date(nextStart.getTime() - 1);
}

/**
 * The instant a wall clock of the zone shows `HH:MM` on that day, or null for a date or a time the
 * calendar does not have. The deadline a manager types is local to the workshop, not to the server.
 */
export function momentInZone(isoDate: string, clock: string, timeZone: string): Date | null {
	const match = /^(\d{2}):(\d{2})$/.exec(clock);
	const wall = wallMidnight(isoDate);
	if (!match || Number.isNaN(wall)) return null;
	const [hours, minutes] = [Number(match[1]), Number(match[2])];
	if (hours > 23 || minutes > 59) return null;
	const target = wall + (hours * 60 + minutes) * 60_000;
	const guess = target - zoneOffsetMs(target, timeZone);
	return new Date(target - zoneOffsetMs(guess, timeZone));
}
