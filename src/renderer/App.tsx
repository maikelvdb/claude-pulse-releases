// src/renderer/App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';
import { SnapEdge, UpdateInfo } from '../shared/types';

function getTranslateClass(edge: SnapEdge, visible: boolean): string {
  if (visible) return 'translate-x-0 translate-y-0';

  switch (edge) {
    case 'top': return '-translate-y-full';
    case 'bottom': return 'translate-y-full';
    case 'left': return '-translate-x-full';
    case 'right': return 'translate-x-full';
  }
}

function getThinBarClasses(edge: SnapEdge): string {
  switch (edge) {
    case 'top': return 'top-0 left-1/2 -translate-x-1/2 w-48 h-1 cursor-pointer rounded-b';
    case 'bottom': return 'bottom-0 left-1/2 -translate-x-1/2 w-48 h-1 cursor-pointer rounded-t';
    case 'left': return 'left-0 top-1/2 -translate-y-1/2 w-1 h-48 cursor-pointer rounded-r';
    case 'right': return 'right-0 top-1/2 -translate-y-1/2 w-1 h-48 cursor-pointer rounded-l';
  }
}

type UpdateStatus = 'idle' | 'downloading' | 'ready' | 'error';

function UpdateDialog({ updateInfo, onClose }: { updateInfo: UpdateInfo; onClose: () => void }) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [installerPath, setInstallerPath] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const cleanups = [
      window.claudePulse.onUpdateProgress((percent) => {
        setProgress(percent);
      }),
      window.claudePulse.onUpdateReady((path) => {
        setInstallerPath(path);
        setStatus('ready');
        setProgress(100);
      }),
      window.claudePulse.onUpdateError((err) => {
        setError(err);
        setStatus('error');
      }),
    ];
    return () => cleanups.forEach(c => c());
  }, []);

  const startDownload = () => {
    setStatus('downloading');
    setProgress(0);
    window.claudePulse.downloadUpdate();
  };

  const installNow = () => {
    window.claudePulse.installUpdate(installerPath);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-claude-bg border border-claude-border rounded-xl shadow-2xl px-6 py-5 flex flex-col gap-3 min-w-[300px] max-w-[340px] no-drag">
        <div className="flex items-center justify-between">
          <p className="text-claude-text text-sm font-medium">Update Available</p>
          <button onClick={onClose} className="text-claude-text-dim hover:text-claude-text text-lg leading-none cursor-pointer">&times;</button>
        </div>

        <p className="text-claude-text-dim text-xs">
          v{updateInfo.currentVersion} &rarr; v{updateInfo.latestVersion}
        </p>

        {status === 'idle' && (
          <button
            onClick={startDownload}
            className="w-full py-2 rounded-md text-xs bg-claude-orange text-white hover:bg-claude-orange/80 transition-colors cursor-pointer font-medium"
          >
            Download &amp; Install
          </button>
        )}

        {status === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="w-full h-2 bg-claude-border rounded-full overflow-hidden">
              <div
                className="h-full bg-claude-orange rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-claude-text-dim text-[10px] text-center">{progress}% downloading...</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="w-full h-2 bg-claude-orange rounded-full" />
            <button
              onClick={installNow}
              className="w-full py-2 rounded-md text-xs bg-claude-orange text-white hover:bg-claude-orange/80 transition-colors cursor-pointer font-medium"
            >
              Install Now &amp; Restart
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-2">
            <p className="text-red-400 text-xs">{error}</p>
            <button
              onClick={startDownload}
              className="w-full py-2 rounded-md text-xs bg-claude-border text-claude-text hover:bg-claude-border/80 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuitConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-claude-bg border border-claude-border rounded-xl shadow-2xl px-6 py-5 flex flex-col items-center gap-4 min-w-[240px]">
        <p className="text-claude-text text-sm font-medium">Quit Claude Pulse?</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-md text-xs bg-claude-border/40 text-claude-text-dim hover:bg-claude-border transition-colors cursor-pointer no-drag"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-md text-xs bg-claude-orange text-white hover:bg-claude-orange/80 transition-colors cursor-pointer no-drag font-medium"
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { state, snapEdge, activityHistory, isExpanded, toggleExpanded } = useClaudeStats();
  const [visible, setVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  const toggleMinimized = useCallback(() => {
    setMinimized(prev => !prev);
  }, []);

  const openHelp = useCallback(() => {
    window.claudePulse.openHelp();
  }, []);

  useEffect(() => {
    const cleanup = window.claudePulse.onVisibility((v: boolean) => setVisible(v));
    return cleanup;
  }, []);

  // Global shortcut: Ctrl+Shift+P to toggle (registered in main process)
  useEffect(() => {
    const cleanup = window.claudePulse.onToggleMinimize(() => {
      toggleMinimized();
    });
    return cleanup;
  }, [toggleMinimized]);

  // Global shortcut: Ctrl+Shift+Q to quit (with confirm)
  useEffect(() => {
    const cleanup = window.claudePulse.onConfirmQuit(() => {
      setShowQuitConfirm(true);
    });
    return cleanup;
  }, []);

  // Listen for update availability
  useEffect(() => {
    const cleanup = window.claudePulse.onUpdateInfo((info) => {
      setHasUpdate(info.hasUpdate);
      if (info.hasUpdate) setUpdateInfo(info);
    });
    return cleanup;
  }, []);

  const translateClass = getTranslateClass(snapEdge, visible);

  const quitOverlay = showQuitConfirm ? (
    <QuitConfirm
      onConfirm={() => window.claudePulse.quit()}
      onCancel={() => setShowQuitConfirm(false)}
    />
  ) : null;

  if (minimized) {
    return (
      <div className="w-full h-full relative">
        <div
          className={`absolute ${getThinBarClasses(snapEdge)} bg-claude-orange hover:bg-claude-orange transition-colors duration-200 no-drag`}
          onClick={toggleMinimized}
        />
        {quitOverlay}
      </div>
    );
  }

  return (
    <div className={`w-full h-full transition-all duration-300 ease-in-out ${translateClass}`}>
      <StatusBar
        state={state}
        snapEdge={snapEdge}
        activityHistory={activityHistory}
        isExpanded={isExpanded}
        hasUpdate={hasUpdate}
        onToggleExpanded={toggleExpanded}
        onHelp={openHelp}
        onUpdate={() => setShowUpdateDialog(true)}
      />
      {quitOverlay}
      {showUpdateDialog && updateInfo && (
        <UpdateDialog
          updateInfo={updateInfo}
          onClose={() => setShowUpdateDialog(false)}
        />
      )}
    </div>
  );
}
