// src/main/services/update-checker.ts
import https from 'https';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
}

const REPO_OWNER = 'maikelvdb';
const REPO_NAME = 'claude-pulse';
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

let cachedUpdate: UpdateInfo | null = null;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

function getCurrentVersion(): string {
  try {
    const pkg = require('../../../package.json');
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.replace(/^v/, '').split('.').map(Number);
  const l = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function fetchLatestRelease(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      headers: { 'User-Agent': `claude-pulse/${currentVersion}` },
    };

    https.get(options, (res) => {
      if (res.statusCode === 404) {
        resolve({
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: '',
          releaseUrl: '',
        });
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = (release.tag_name || '').replace(/^v/, '');
          const hasUpdate = compareVersions(currentVersion, latestVersion);

          resolve({
            hasUpdate,
            currentVersion,
            latestVersion,
            releaseNotes: release.body || '',
            releaseUrl: release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`,
          });
        } catch {
          reject(new Error('Failed to parse release data'));
        }
      });
    }).on('error', reject);
  });
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    cachedUpdate = await fetchLatestRelease();
  } catch {
    cachedUpdate = {
      hasUpdate: false,
      currentVersion: getCurrentVersion(),
      latestVersion: getCurrentVersion(),
      releaseNotes: '',
      releaseUrl: '',
    };
  }
  return cachedUpdate;
}

export function getCachedUpdate(): UpdateInfo | null {
  return cachedUpdate;
}

export function startUpdateChecker(onUpdate: (info: UpdateInfo) => void): void {
  // Check immediately
  checkForUpdate().then(onUpdate);

  // Then periodically
  checkIntervalId = setInterval(() => {
    checkForUpdate().then(onUpdate);
  }, CHECK_INTERVAL);
}

export function stopUpdateChecker(): void {
  if (checkIntervalId !== null) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}
