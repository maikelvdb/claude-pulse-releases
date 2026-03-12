import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
  },
  onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => {
    ipcRenderer.on('claude:activity-history', (_event, history) => callback(history));
  },
  onVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('widget:visibility', (_event, visible) => callback(visible));
  },
  onSnapEdge: (callback: (edge: SnapEdge) => void) => {
    ipcRenderer.on('widget:snap-edge', (_event, edge) => callback(edge));
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
