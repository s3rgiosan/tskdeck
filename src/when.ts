import type { Timestamp } from "./api/types";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days from `at` to `now` in local time: 0 today, 1 yesterday, negative in the future. */
function daysBefore(at: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(at)) / DAY);
}

function capitalised(text: string, locale?: string | string[]): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * Puts `day` where the locale writes the date in a date-and-time phrase, keeping the locale's joiner:
 * "Today at 3:15 PM" in English, "Hoje às 15:15" in Portuguese.
 */
function dayAndTime(at: Date, day: string, locale?: string | string[]): string {
  const full = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(at);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(at);
  if (full.includes(date)) return full.replace(date, day);
  return `${day}, ${new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(at)}`;
}

/**
 * A past moment as the system writes it in lists: "Today at 3:15 PM", "Yesterday at 9:02 AM",
 * "Oct 28 at 3:15 PM" earlier this year, and "Oct 28, 2025" in other years.
 */
export function formatWhen(at: Date, now: Date = new Date(), locale?: string | string[]): string {
  const days = daysBefore(at, now);
  if (days === 0 || days === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
    return dayAndTime(at, capitalised(word, locale), locale);
  }
  if (at.getFullYear() === now.getFullYear()) {
    const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(at);
    return dayAndTime(at, date, locale);
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(at);
}

/** The moment a tsk timestamp names. */
export function dateOf(at: Timestamp): Date {
  return new Date(at[0] * 1000);
}
