import React from 'react';

interface ResetCountdownProps {
  resetTime: string | null; // e.g. "2am (Europe/Amsterdam)" or "Mar 17, 8am (Europe/Amsterdam)"
}

function parseResetTime(resetStr: string): Date | null {
  // Extract timezone: "(Europe/Amsterdam)" or "(America/New_York)"
  const tzMatch = resetStr.match(/\(([^)]+)\)/);
  const tz = tzMatch?.[1];
  if (!tz) return null;

  // Remove timezone part for parsing
  const timePart = resetStr.replace(/\([^)]+\)/, '').trim();

  const now = new Date();

  // Try "Mar 17, 8am" format (date + time)
  const dateTimeMatch = timePart.match(/^(\w+)\s+(\d+),?\s+(\d+)(am|pm)$/i);
  if (dateTimeMatch) {
    const [, month, day, hour, ampm] = dateTimeMatch;
    const dateStr = `${month} ${day}, ${now.getFullYear()} ${hour}:00 ${ampm.toUpperCase()}`;
    return parseDateInTz(dateStr, tz);
  }

  // Try simple "2am" or "10pm" format
  const timeMatch = timePart.match(/^(\d+)(am|pm)$/i);
  if (timeMatch) {
    const [, hourStr, ampm] = timeMatch;
    let hour = parseInt(hourStr, 10);
    if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;

    // Build target date in the given timezone
    // Use today; if the time has passed, use tomorrow
    const target = getNextOccurrence(hour, tz);
    return target;
  }

  return null;
}

function getNextOccurrence(hour: number, tz: string): Date | null {
  try {
    const now = new Date();
    // Get current time in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);

    const currentHourInTz = get('hour');

    // Calculate target: today or tomorrow
    const target = new Date(now);
    const diffHours = hour - currentHourInTz;
    if (diffHours <= 0) {
      // Already passed today, target is tomorrow
      target.setHours(target.getHours() + diffHours + 24);
    } else {
      target.setHours(target.getHours() + diffHours);
    }
    target.setMinutes(0, 0, 0);
    return target;
  } catch {
    return null;
  }
}

function parseDateInTz(dateStr: string, tz: string): Date | null {
  try {
    // Parse loosely and adjust — this is approximate but good enough
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function useResetCountdown(resetTime: string | null): string | null {
  const [countdown, setCountdown] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!resetTime) {
      setCountdown(null);
      return;
    }

    const update = () => {
      const target = parseResetTime(resetTime);
      if (!target) {
        setCountdown(null);
        return;
      }
      const ms = target.getTime() - Date.now();
      setCountdown(ms > 0 ? formatCountdown(ms) : 'now');
    };

    update();
    const interval = setInterval(update, 60_000); // update every minute
    return () => clearInterval(interval);
  }, [resetTime]);

  return countdown;
}
