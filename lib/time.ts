// lib/time.ts
import { DateTime } from "luxon";

/** Convert local (Europe/London) YYYY-MM-DD + HH:MM to UTC ISO string. */
export function londonLocalToUtcIso(localDate: string, clockHHMM: string | null): string | null {
  if (!clockHHMM) return null;
  const [hh, mm] = clockHHMM.split(":").map(Number);
  const dt = DateTime.fromObject(
    { year: Number(localDate.slice(0, 4)), month: Number(localDate.slice(5, 7)), day: Number(localDate.slice(8, 10)), hour: hh, minute: mm },
    { zone: "Europe/London" }
  );
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

/** Add minutes to a UTC ISO string and return a UTC ISO string. */
export function addMinutesUtc(utcIso: string, minutes: number): string | null {
  const dt = DateTime.fromISO(utcIso, { zone: "utc" });
  return dt.plus({ minutes }).toUTC().toISO();
}

/** Convert a UTC ISO string to a HH:MM label in Europe/London. */
export function utcIsoToLondonHHMM(utcIso?: string | null): string | null {
  if (!utcIso) return null;
  const dt = DateTime.fromISO(utcIso, { zone: "utc" }).setZone("Europe/London");
  if (!dt.isValid) return null;
  return dt.toFormat("HH:mm");
}

/** Format a UTC start/end ISO pair into 'HH:MM–HH:MM' (Europe/London). */
export function formatUtcRangeToLondon(
  startUtcIso?: string | null,
  endUtcIso?: string | null
): string | null {
  const start = utcIsoToLondonHHMM(startUtcIso);
  const end = utcIsoToLondonHHMM(endUtcIso);
  if (!start || !end) return null;
  return `${start}–${end}`;
}



