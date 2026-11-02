import { describe, expect, it } from "vitest";
import { dateOf, formatWhen } from "./when";

const now = new Date(2026, 9, 28, 18, 0);

/** Intl separates the time from AM/PM with a narrow no-break space; the tests compare plain spaces. */
function format(at: Date, locale = "en-US"): string {
  return formatWhen(at, now, locale).replace(/\s/g, " ");
}

describe("formatWhen", () => {
  it("names today", () => {
    expect(format(new Date(2026, 9, 28, 15, 15))).toBe("Today at 3:15 PM");
  });

  it("names yesterday", () => {
    expect(format(new Date(2026, 9, 27, 9, 2))).toBe("Yesterday at 9:02 AM");
  });

  it("counts calendar days, not hours", () => {
    expect(format(new Date(2026, 9, 27, 23, 59))).toBe("Yesterday at 11:59 PM");
    expect(format(new Date(2026, 9, 26, 23, 59))).toBe("Oct 26 at 11:59 PM");
  });

  it("gives the month and day earlier this year", () => {
    expect(format(new Date(2026, 0, 3, 15, 15))).toBe("Jan 3 at 3:15 PM");
  });

  it("gives the date alone in other years", () => {
    expect(format(new Date(2025, 9, 28, 15, 15))).toBe("Oct 28, 2025");
  });

  it("follows the locale's words and order", () => {
    expect(format(new Date(2026, 9, 28, 15, 15), "pt-PT")).toBe("Hoje às 15:15");
    expect(format(new Date(2026, 9, 27, 9, 2), "en-GB")).toBe("Yesterday at 09:02");
    expect(format(new Date(2025, 9, 28, 15, 15), "en-GB")).toBe("28 Oct 2025");
  });
});

describe("dateOf", () => {
  it("reads the seconds of a tsk timestamp", () => {
    expect(dateOf([1_700_000_000, 5]).getTime()).toBe(1_700_000_000_000);
  });
});
