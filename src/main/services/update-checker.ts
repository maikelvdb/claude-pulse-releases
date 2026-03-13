// src/main/services/update-checker.ts
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  latestDownloadUrl: string;
  latestDownloadSize: number;
  releaseNotes: string;
  releaseUrl: string;
}

const REPO_OWNER = 'maikelvdb';
const REPO_NAME = 'claude-pulse-releases';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let cachedUpdate: UpdateInfo | null = null;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

function getCurrentVersion(): string {
  return app.getVersion();
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
          latestDownloadUrl: '',
          latestDownloadSize: 0,
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

          const exeAsset = (release.assets || []).find((a: any) => a.name.endsWith('.exe'));

          resolve({
            hasUpdate,
            currentVersion,
            latestVersion,
            latestDownloadUrl: exeAsset?.browser_download_url || '',
            latestDownloadSize: exeAsset?.size || 0,
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
      latestDownloadUrl: '',
      latestDownloadSize: 0,
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

function followRedirects(url: string, onResponse: (res: http.IncomingMessage) => void, onError: (err: Error) => void): void {
  const client = url.startsWith('https') ? https : http;
  client.get(url, { headers: { 'User-Agent': 'claude-pulse' } }, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
      followRedirects(res.headers.location, onResponse, onError);
    } else {
      onResponse(res);
    }
  }).on('error', onError);
}

export function downloadUpdate(
  downloadUrl: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  const fileName = path.basename(new URL(downloadUrl).pathname);
  const destPath = path.join(os.tmpdir(), fileName);

  return new Promise((resolve, reject) => {
    followRedirects(downloadUrl, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const file = fs.createWriteStream(destPath);

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          onProgress(Math.round((downloaded / totalSize) * 100));
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }, reject);
  });
}

export function runInstaller(installerPath: string): void {
  const { spawn } = require('child_process');
  spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}
