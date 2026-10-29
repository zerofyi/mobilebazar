/**
 * Business dates in the browser must be the LOCAL calendar date.
 *
 * `new Date().toISOString()` is UTC — between midnight and 05:30 IST it
 * still returns yesterday, which stamped early-morning purchases (and
 * supplier payments / credit notes) with the wrong date while sales
 * showed the right one. Always derive a document's default date from
 * local date parts via this helper.
 */
export function localDateISO(d: Date): string {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

/** Today as a local 'Y-m-d' string. */
export function todayLocal(): string {
    return localDateISO(new Date());
}
