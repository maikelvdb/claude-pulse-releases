import fs from 'fs';
import { PULSE_CONFIG_FILE } from '../../shared/constants';
import { SnapEdge, PulseConfig, ThemeName } from '../../shared/types';

const VALID_EDGES: SnapEdge[] = ['top', 'bottom', 'left', 'right'];
const VALID_THEMES: ThemeName[] = ['dark', 'light', 'sunset'];
const DEFAULT_CONFIG: PulseConfig = { snapEdge: 'top', userOffset: null, theme: 'dark', opacity: 1, hoverOpacity: 1, positionLocked: false, autoStart: false, soundMuted: false };

let currentConfig: PulseConfig = { ...DEFAULT_CONFIG };

export function loadConfig(): PulseConfig {
  try {
    if (!fs.existsSync(PULSE_CONFIG_FILE)) {
      currentConfig = { ...DEFAULT_CONFIG };
      return currentConfig;
    }
    const data = JSON.parse(fs.readFileSync(PULSE_CONFIG_FILE, 'utf-8'));
    currentConfig = {
      snapEdge: VALID_EDGES.includes(data.snapEdge) ? data.snapEdge : 'top',
      userOffset: typeof data.userOffset === 'number' ? data.userOffset : null,
      theme: VALID_THEMES.includes(data.theme) ? data.theme : 'dark',
      opacity: typeof data.opacity === 'number' ? Math.max(0.4, Math.min(1, data.opacity)) : 1,
      hoverOpacity: typeof data.hoverOpacity === 'number' ? Math.max(0.4, Math.min(1, data.hoverOpacity)) : 1,
      positionLocked: !!data.positionLocked,
      autoStart: !!data.autoStart,
      soundMuted: !!data.soundMuted,
    };
    return currentConfig;
  } catch {
    currentConfig = { ...DEFAULT_CONFIG };
    return currentConfig;
  }
}

export function saveConfig(partial: Partial<PulseConfig>): void {
  currentConfig = { ...currentConfig, ...partial };
  try {
    fs.writeFileSync(PULSE_CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
  } catch {
    // Silently fail — non-critical
  }
}

export function getConfig(): PulseConfig {
  return currentConfig;
}
