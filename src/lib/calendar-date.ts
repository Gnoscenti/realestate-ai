/** Parse a real calendar date at local midnight, rejecting normalized impossible dates. */
export function parseLocalCalendarDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== year ||
      parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;
  return parsed;
}
