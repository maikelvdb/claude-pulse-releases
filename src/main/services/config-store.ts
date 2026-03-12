import fs from 'fs';
import { PULSE_CONFIG_FILE } from '../../shared/constants';
import { SnapEdge, PulseConfig } from '../../shared/types';

const DEFAULT_CONFIG: PulseConfig = { snapEdge: 'top' };

export function loadConfig(): PulseConfig {
  try {
    if (!fs.existsSync(PULSE_CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    const data = JSON.parse(fs.readFileSync(PULSE_CONFIG_FILE, 'utf-8'));
    const edge = data.snapEdge;
    if (['top', 'bottom', 'left', 'right'].includes(edge)) {
      return { snapEdge: edge as SnapEdge };
    }
    return { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PulseConfig): void {
  try {
    fs.writeFileSync(PULSE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // Silently fail — non-critical
  }
}
