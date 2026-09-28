const PERTH_TIME_ZONE = 'Australia/Perth';

export function perthIsoDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: PERTH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseReportDate(value?: string | null): { year: number; month: number; day: number } | null {
  const raw = (value || '').trim();
  if (!raw) return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const au = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (au) {
    day = Number(au[1]);
    month = Number(au[2]);
    year = Number(au[3]);
  } else {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidReportDate(value?: string | null): boolean {
  return parseReportDate(value) !== null;
}
