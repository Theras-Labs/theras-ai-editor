// Per-IP request counter in memory. No timer: stale entries are dropped when the map grows.

type Bucket = { minuteStart: number; minute: number; dayStart: number; day: number };

const buckets = new Map<string, Bucket>();
const MINUTE = 60_000;
const DAY = 86_400_000;

export function checkRate(ip: string, perMinute: number, perDay: number): string | null {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [key, b] of buckets) if (now - b.dayStart > DAY) buckets.delete(key);
  }
  let b = buckets.get(ip);
  if (!b) {
    b = { minuteStart: now, minute: 0, dayStart: now, day: 0 };
    buckets.set(ip, b);
  }
  if (now - b.minuteStart >= MINUTE) { b.minuteStart = now; b.minute = 0; }
  if (now - b.dayStart >= DAY) { b.dayStart = now; b.day = 0; }
  if (b.minute >= perMinute) return "Too many AI requests. Wait one minute.";
  if (b.day >= perDay) return "Daily AI request limit reached for this address.";
  b.minute++;
  b.day++;
  return null;
}
