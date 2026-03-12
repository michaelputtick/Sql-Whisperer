import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // PTY operations
  ptyCreate: (cols: number, rows: number) => ipcRenderer.invoke('pty-create', cols, rows),
  ptyWrite: (data: string) => ipcRenderer.invoke('pty-write', data),
  ptyResize: (cols: number, rows: number) => ipcRenderer.invoke('pty-resize', cols, rows),
  ptyKill: () => ipcRenderer.invoke('pty-kill'),

  // PTY events
  onPtyData: (callback: (data: string) => void) => {
    ipcRenderer.on('pty-data', (_event, data) => callback(data));
  },
  onPtyExit: (callback: (code: number) => void) => {
    ipcRenderer.on('pty-exit', (_event, code) => callback(code));
  },

  // Claude
  runClaude: () => ipcRenderer.invoke('run-claude'),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      ptyCreate: (cols: number, rows: number) => Promise<boolean>;
      ptyWrite: (data: string) => Promise<void>;
      ptyResize: (cols: number, rows: number) => Promise<void>;
      ptyKill: () => Promise<void>;
      onPtyData: (callback: (data: string) => void) => void;
      onPtyExit: (callback: (code: number) => void) => void;
      runClaude: () => Promise<void>;
    };
  }
}
