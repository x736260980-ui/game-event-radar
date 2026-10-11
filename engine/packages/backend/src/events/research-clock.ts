/** Date-only observations must not embargo a same-day manual import until noon. */
export function researchObservationTime(day: string, now = new Date()): Date {
  const nominal = new Date(`${day}T12:00:00+08:00`);
  if (!Number.isFinite(nominal.getTime())) throw new Error('Invalid observation date');
  return new Date(Math.min(nominal.getTime(), now.getTime()));
}
