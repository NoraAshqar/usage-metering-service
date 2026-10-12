// Returns the first day of the current UTC month as 'YYYY-MM-01'.
// Every usage row and request is stored under this month.
export function currentMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}
