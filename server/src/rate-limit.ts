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

// ── Hosted demo quota: AI prompts per visitor and for all visitors, per UTC day ──
// One prompt (one message from the user) can make several model calls (director, tool loop
// steps). The editor sends the same "x-theras-run" id with every call of one prompt, so the
// quota counts prompts, not calls. A call without an id counts as a new prompt. Counters are
// in memory: a restart starts them again. No timer and no database.

export type PromptQuota = {
  /** Prompts per client IP per UTC day. 0 = no limit. */
  perIp: number;
  /** Prompts for all clients per UTC day. 0 = no limit. */
  total: number;
  /** Model calls that one prompt may make. 0 = no limit. */
  callsPerPrompt: number;
  /** After this time (ms), the hosted AI is off. 0 = no end. */
  endsAt: number;
};

export const QUOTA_HELP =
  "To keep building, run Theras AI on your own computer with your own OpenAI API key (or another provider): see \"Run it\" in the README.";

type PromptBucket = { day: number; prompts: number; runs: Map<string, number> };
const promptBuckets = new Map<string, PromptBucket>();
const total = { day: 0, prompts: 0 };
const MAX_RUNS_PER_IP = 50;

const utcDay = (now: number) => Math.floor(now / DAY);

/** Admits one model call. Returns null, or the message for the user (HTTP 429). */
export function admitPrompt(ip: string, runId: string | null, quota: PromptQuota): string | null {
  const now = Date.now();
  if (quota.endsAt > 0 && now > quota.endsAt) return `The free AI of this hosted demo has ended. ${QUOTA_HELP}`;
  if (quota.perIp <= 0 && quota.total <= 0 && quota.callsPerPrompt <= 0) return null;
  const day = utcDay(now);
  if (total.day !== day) {
    total.day = day;
    total.prompts = 0;
    promptBuckets.clear();
  }
  let b = promptBuckets.get(ip);
  if (!b) {
    b = { day, prompts: 0, runs: new Map() };
    promptBuckets.set(ip, b);
  }
  const id = runId && /^[\w:-]{8,64}$/.test(runId) ? runId : null;
  const calls = id ? b.runs.get(id) : undefined;
  if (calls !== undefined) {
    // A further call of a prompt that was already admitted.
    if (quota.callsPerPrompt > 0 && calls >= quota.callsPerPrompt) return "This prompt has used all of its AI steps. Send a new prompt to continue.";
    b.runs.set(id!, calls + 1);
    return null;
  }
  if (quota.perIp > 0 && b.prompts >= quota.perIp) {
    return `You have used your ${quota.perIp} free AI prompts for today on this hosted demo. The quota resets at 00:00 UTC. ${QUOTA_HELP}`;
  }
  if (quota.total > 0 && total.prompts >= quota.total) {
    return `The hosted demo has used its free AI quota for today (${quota.total} prompts for all visitors). It resets at 00:00 UTC. ${QUOTA_HELP}`;
  }
  b.prompts++;
  total.prompts++;
  if (id) {
    b.runs.set(id, 1);
    if (b.runs.size > MAX_RUNS_PER_IP) b.runs.delete(b.runs.keys().next().value!);
  }
  return null;
}

/** Prompts left today (for the config route). null = no limit. */
export function promptsLeft(ip: string, quota: PromptQuota): { you: number | null; all: number | null } {
  const day = utcDay(Date.now());
  const b = promptBuckets.get(ip);
  const used = b && b.day === day && total.day === day ? b.prompts : 0;
  const usedAll = total.day === day ? total.prompts : 0;
  return {
    you: quota.perIp > 0 ? Math.max(0, quota.perIp - used) : null,
    all: quota.total > 0 ? Math.max(0, quota.total - usedAll) : null
  };
}
