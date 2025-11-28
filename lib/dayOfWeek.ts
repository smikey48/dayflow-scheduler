/**
 * Day of Week Utilities
 * 
 * STANDARD: Monday = 0, Tuesday = 1, ..., Sunday = 6
 * 
 * This differs from JavaScript's Date.getDay() which uses Sunday = 0, Monday = 1, ..., Saturday = 6
 * All database operations, API responses, and UI logic should use this standard.
 */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Convert JavaScript's getDay() (Sun=0) to our standard (Mon=0)
 * 
 * @param jsDay - Result from Date.getDay() where Sunday=0, Monday=1, ..., Saturday=6
 * @returns Day number where Monday=0, Tuesday=1, ..., Sunday=6
 * 
 * @example
 * const date = new Date('2025-11-11'); // Tuesday
 * const jsDay = date.getDay(); // Returns 2 (Tuesday in JS)
 * const ourDay = jsDayToStandard(jsDay); // Returns 1 (Tuesday in our system)
 */
export function jsDayToStandard(jsDay: number): DayOfWeek {
  // JavaScript: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  // Our system: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  return (jsDay === 0 ? 6 : jsDay - 1) as DayOfWeek;
}

/**
 * Convert our standard (Mon=0) to JavaScript's getDay() (Sun=0)
 * 
 * @param standardDay - Day number where Monday=0, Tuesday=1, ..., Sunday=6
 * @returns Day number for Date.setDay() where Sunday=0, Monday=1, ..., Saturday=6
 * 
 * @example
 * const ourDay = 1; // Tuesday in our system
 * const jsDay = standardToJsDay(ourDay); // Returns 2 (Tuesday in JS)
 */
export function standardToJsDay(standardDay: DayOfWeek): number {
  // Our system: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  // JavaScript: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  return standardDay === 6 ? 0 : standardDay + 1;
}

/**
 * Get the current day of week in our standard format (Mon=0) for Europe/London timezone
 * 
 * @returns Current day of week where Monday=0, Tuesday=1, ..., Sunday=6
 */
export function getCurrentDayOfWeek(): DayOfWeek {
  const londonDate = new Date().toLocaleString('en-GB', { 
    timeZone: 'Europe/London',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Parse the London date and get JS day
  const [datePart] = londonDate.split(', ');
  const [day, month, year] = datePart.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();
  
  return jsDayToStandard(jsDay);
}

/**
 * Get day name from our day number
 * 
 * @param day - Day number where Monday=0, Tuesday=1, ..., Sunday=6
 * @returns Full day name (e.g., "Monday", "Tuesday")
 */
export function getDayName(day: DayOfWeek): string {
  return DAY_NAMES[day];
}

/**
 * Get short day name from our day number
 * 
 * @param day - Day number where Monday=0, Tuesday=1, ..., Sunday=6
 * @returns Short day name (e.g., "Mon", "Tue")
 */
export function getDayNameShort(day: DayOfWeek): string {
  return DAY_NAMES_SHORT[day];
}

/**
 * Parse day name to our standard day number
 * 
 * @param name - Day name (case-insensitive, accepts full or short form)
 * @returns Day number where Monday=0, Tuesday=1, ..., Sunday=6, or null if invalid
 * 
 * @example
 * parseDayName('Tuesday') // Returns 1
 * parseDayName('tue') // Returns 1
 * parseDayName('invalid') // Returns null
 */
export function parseDayName(name: string): DayOfWeek | null {
  const lower = name.toLowerCase();
  
  // Check full names
  const fullIndex = DAY_NAMES.findIndex(d => d.toLowerCase() === lower);
  if (fullIndex !== -1) return fullIndex as DayOfWeek;
  
  // Check short names
  const shortIndex = DAY_NAMES_SHORT.findIndex(d => d.toLowerCase() === lower);
  if (shortIndex !== -1) return shortIndex as DayOfWeek;
  
  return null;
}

/**
 * Validate that a number is a valid day of week in our system
 * 
 * @param day - Number to validate
 * @returns true if day is 0-6 (inclusive)
 */
export function isValidDayOfWeek(day: number): day is DayOfWeek {
  return Number.isInteger(day) && day >= 0 && day <= 6;
}

/**
 * REFERENCE CHART (keep this comment for developers):
 * 
 * Our System (Mon=0):
 * ┌────────────┬─────┐
 * │   Monday   │  0  │
 * │  Tuesday   │  1  │
 * │ Wednesday  │  2  │
 * │  Thursday  │  3  │
 * │   Friday   │  4  │
 * │  Saturday  │  5  │
 * │   Sunday   │  6  │
 * └────────────┴─────┘
 * 
 * JavaScript Date.getDay():
 * ┌────────────┬─────┐
 * │   Sunday   │  0  │
 * │   Monday   │  1  │
 * │  Tuesday   │  2  │
 * │ Wednesday  │  3  │
 * │  Thursday  │  4  │
 * │   Friday   │  5  │
 * │  Saturday  │  6  │
 * └────────────┴─────┘
 * 
 * ALWAYS use jsDayToStandard() when converting from Date.getDay()
 * ALWAYS use standardToJsDay() when setting dates in JavaScript
 */
