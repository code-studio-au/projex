export function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

export function parseISODate(iso: string) {
  // Accept yyyy-mm-dd OR yyyy-mm (treated as first of month).
  // Use UTC to avoid local timezone/DST surprises when deriving month keys.
  const d = iso.length === 7 ? `${iso}-01` : iso;
  const [y, m, day] = d.split('-').map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, day));
}

export function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function nextMonthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function monthKeyFromStart(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // yyyy-mm
}

export function parseYearMonth(mk: string) {
  const [y, m] = mk.slice(0, 7).split('-');
  return { year: Number(y), month: Number(m) };
}

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export function quarterOfMonth(month: number): Quarter {
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

export function quarterKey(year: number, q: Quarter) {
  return `${year}_${q}`;
}

export function formatMonthLabel(mk: string) {
  const { year, month } = parseYearMonth(mk);
  const mm = String(month).padStart(2, '0');
  return `${mm}/${year}`;
}
