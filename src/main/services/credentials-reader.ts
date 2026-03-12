import fs from 'fs';
import { CREDENTIALS_FILE } from '../../shared/constants';
import { PlanInfo } from '../../shared/types';

export function getPlanInfo(): PlanInfo {
  const defaults: PlanInfo = { subscriptionType: 'unknown', rateLimitTier: 'unknown' };

  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return defaults;

    const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    const oauth = data.claudeAiOauth;

    if (!oauth) return defaults;

    return {
      subscriptionType: oauth.subscriptionType ?? 'unknown',
      rateLimitTier: oauth.rateLimitTier ?? 'unknown',
    };
  } catch {
    return defaults;
  }
}
