import { contextBridge, ipcRenderer } from 'electron';
import { ClaudeUsageState } from '../shared/types';

contextBridge.exposeInMainWorld('claudePulse', {
  onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => {
    ipcRenderer.on('claude:usage-update', (_event, state) => callback(state));
  },
  onVisibility: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('widget:visibility', (_event, visible) => callback(visible));
  },
  requestUpdate: () => {
    ipcRenderer.send('claude:request-update');
  },
});
