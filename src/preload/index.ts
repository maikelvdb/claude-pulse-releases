import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: ClaudeUsageState) => callback(state);
    ipcRenderer.on('claude:usage-update', handler);
    return () => { ipcRenderer.removeListener('claude:usage-update', handler); };
  },
  onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, history: ActivitySnapshot[]) => callback(history);
    ipcRenderer.on('claude:activity-history', handler);
    return () => { ipcRenderer.removeListener('claude:activity-history', handler); };
  },
  onVisibility: (callback: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('widget:visibility', handler);
    return () => { ipcRenderer.removeListener('widget:visibility', handler); };
  },
  onSnapEdge: (callback: (edge: SnapEdge) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, edge: SnapEdge) => callback(edge);
    ipcRenderer.on('widget:snap-edge', handler);
    return () => { ipcRenderer.removeListener('widget:snap-edge', handler); };
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
});
