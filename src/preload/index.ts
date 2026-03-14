import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, CliStatus, SnapEdge, ActivitySnapshot, UpdateInfo, ThemeName, DailyRollups, Achievement } from '../shared/types';

function makeListener<T>(channel: string) {
  return (callback: (value: T) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, value: T) => callback(value);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  };
}

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: makeListener<ClaudeUsageState>('claude:usage-update'),
  onActivityHistory: makeListener<ActivitySnapshot[]>('claude:activity-history'),
  onVisibility: makeListener<boolean>('widget:visibility'),
  onSnapEdge: makeListener<SnapEdge>('widget:snap-edge'),
  onHover: makeListener<boolean>('widget:hover'),
  onToggleMinimize: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('widget:toggle-minimize', handler);
    return () => { ipcRenderer.removeListener('widget:toggle-minimize', handler); };
  },
  requestUpdate: () => {
    ipcRenderer.send('claude:request-update');
  },
  requestSnapEdge: () => {
    ipcRenderer.send('widget:request-snap-edge');
  },
  requestResize: (expanded: boolean) => {
    ipcRenderer.send('widget:resize', expanded);
  },
  setCompact: (compact: boolean) => {
    ipcRenderer.send('widget:compact', compact);
  },
  openHelp: () => {
    ipcRenderer.send('widget:open-help');
  },
  onUpdateInfo: makeListener<UpdateInfo>('widget:update-info'),
  onConfirmQuit: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('widget:confirm-quit', handler);
    return () => { ipcRenderer.removeListener('widget:confirm-quit', handler); };
  },
  quit: () => {
    ipcRenderer.send('widget:quit');
  },
  downloadUpdate: () => {
    ipcRenderer.send('widget:download-update');
  },
  onUpdateProgress: makeListener<number>('widget:update-progress'),
  onUpdateReady: makeListener<string>('widget:update-ready'),
  onUpdateError: makeListener<string>('widget:update-error'),
  installUpdate: (path: string) => {
    ipcRenderer.send('widget:install-update', path);
  },
  onConversationPreview: makeListener<string>('claude:conversation-preview'),
  onDailyRollups: makeListener<DailyRollups>('claude:daily-rollups'),
  onCliStatus: makeListener<CliStatus | null>('claude:cli-status'),
  onSoundMuted: makeListener<boolean>('widget:sound-muted'),
  onThemeChange: makeListener<ThemeName>('widget:theme-change'),
  setTheme: (theme: ThemeName) => {
    ipcRenderer.send('widget:set-theme', theme);
  },
  requestTheme: () => {
    ipcRenderer.send('widget:request-theme');
  },
  getAchievements: (): Promise<Achievement[]> => ipcRenderer.invoke('achievements:list'),
  unlockAchievement: (id: string): Promise<boolean> => ipcRenderer.invoke('achievements:unlock', id),
  getMilestoneMap: (): Promise<Record<number, string>> => ipcRenderer.invoke('achievements:milestone-map'),
});
