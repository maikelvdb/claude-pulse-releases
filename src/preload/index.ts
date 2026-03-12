import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState, SnapEdge } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
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
});
