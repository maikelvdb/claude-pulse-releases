import { Notification } from 'electron';

let lastHourlyThreshold = 0;
let lastWeeklyThreshold = 0;

const THRESHOLDS = [90, 80] as const;

function getThresholdLevel(ratio: number): number {
  for (const t of THRESHOLDS) {
    if (ratio >= t / 100) return t;
  }
  return 0;
}

export function checkRateLimits(hourlyUsed: number, weeklyUsed: number): void {
  const hourlyLevel = getThresholdLevel(hourlyUsed);
  const weeklyLevel = getThresholdLevel(weeklyUsed);

  // Only notify when crossing a threshold upward (not on every poll)
  if (hourlyLevel > lastHourlyThreshold) {
    new Notification({
      title: 'Claude Pulse — Hourly Limit Warning',
      body: `You've used ${hourlyLevel}% of your hourly rate limit.`,
      silent: false,
    }).show();
  }

  if (weeklyLevel > lastWeeklyThreshold) {
    new Notification({
      title: 'Claude Pulse — Weekly Limit Warning',
      body: `You've used ${weeklyLevel}% of your weekly rate limit.`,
      silent: false,
    }).show();
  }

  lastHourlyThreshold = hourlyLevel;
  lastWeeklyThreshold = weeklyLevel;
}

export function resetNotifierState(): void {
  lastHourlyThreshold = 0;
  lastWeeklyThreshold = 0;
}
