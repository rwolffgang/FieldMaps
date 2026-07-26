// -----------------------------------------------------------------------------
// event-schedule.ts
// When each event runs, and how to order the list by it.
//
// The events recur every year on roughly the same dates, so a schedule is stored as
// month/day only — no year. That keeps the scenario files from going stale every
// January: "the next Mission 24" resolves against whatever today is, and the app
// never shows a date that has already passed.
//
// Ordering is "soonest first", with a running event counted as zero days away, so
// the map you actually need is at the top of the list on the day you need it.
// -----------------------------------------------------------------------------

import { currentLang, monthNames, type Lang } from "./i18n.js";

/** [month, day] with month 1–12. */
export type MonthDay = [number, number];

export interface EventSchedule {
	start: MonthDay;
	/** Last day of the event, inclusive. Omit for a one-day game. */
	end?: MonthDay;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC for a month/day in a given year — dates only, no clock arithmetic. */
function utcDay(year: number, [month, day]: MonthDay): number {
	return Date.UTC(year, month - 1, day);
}

/** Today at midnight UTC. Passing `now` in keeps this testable. */
function todayUtc(now: Date): number {
	return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Days until the event next starts: 0 while it is running, otherwise the count to
 * the next occurrence — this year's if still ahead, else next year's.
 */
export function daysUntil(schedule: EventSchedule, now = new Date()): number {
	const today = todayUtc(now);
	const year = now.getUTCFullYear();
	const end = schedule.end ?? schedule.start;

	for (const candidateYear of [year - 1, year, year + 1]) {
		const start = utcDay(candidateYear, schedule.start);
		// An event spanning New Year (none today, but cheap to be right about) ends in
		// the following year.
		const endYear = utcDay(candidateYear, end) < start ? candidateYear + 1 : candidateYear;
		const finish = utcDay(endYear, end);
		if (today >= start && today <= finish) return 0; // running right now
		if (start > today) return Math.round((start - today) / DAY_MS);
	}
	return Number.MAX_SAFE_INTEGER;
}

/** True while the event is on. */
export function isRunning(schedule: EventSchedule, now = new Date()): boolean {
	return daysUntil(schedule, now) === 0;
}

/**
 * Date range in the reader's language: "3.–5. Juli" / "3–5 July",
 * "29. April – 2. Mai" / "29 April – 2 May", "20. Juni" / "20 June".
 * German puts an ordinal dot after the day, English does not.
 */
export function formatSchedule(schedule: EventSchedule, lang: Lang = currentLang()): string {
	const months = monthNames(lang);
	const dot = lang === "de" ? "." : "";
	const [startMonth, startDay] = schedule.start;
	if (!schedule.end) return `${startDay}${dot} ${months[startMonth - 1]}`;
	const [endMonth, endDay] = schedule.end;
	if (startMonth === endMonth) {
		return `${startDay}${dot}–${endDay}${dot} ${months[startMonth - 1]}`;
	}
	return `${startDay}${dot} ${months[startMonth - 1]} – ${endDay}${dot} ${months[endMonth - 1]}`;
}

/**
 * Sort comparator: soonest first, then alphabetical. Anything without a schedule
 * (the style variants, which are not events) sorts to the end.
 */
export function compareBySchedule<T extends { schedule?: EventSchedule; name: string }>(
	a: T,
	b: T,
	now = new Date(),
): number {
	const left = a.schedule ? daysUntil(a.schedule, now) : Number.MAX_SAFE_INTEGER;
	const right = b.schedule ? daysUntil(b.schedule, now) : Number.MAX_SAFE_INTEGER;
	return left - right || a.name.localeCompare(b.name, "de");
}
