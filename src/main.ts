import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as pty from 'node-pty';
import * as os from 'os';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let ptyProcess: pty.IPty | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'SQLWhisperer',
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  // Load from src during development
  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
}

// PTY Management
let ptyCreating = false;

ipcMain.handle('pty-create', async (_event, cols: number, rows: number) => {
  // Prevent multiple simultaneous creates
  if (ptyCreating) return false;
  ptyCreating = true;

  try {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = os.platform() === 'win32' ? ['-NoLogo', '-NoProfile'] : [];
    // Start in the app directory so Claude reads CLAUDE.md
    const appDir = path.join(__dirname, '..');

    ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: appDir,
      env: process.env as { [key: string]: string },
      useConpty: true,
    });

    ptyProcess.onData((data: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-data', data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-exit', exitCode);
      }
      ptyProcess = null;
    });

    return true;
  } finally {
    ptyCreating = false;
  }
});

ipcMain.handle('pty-write', (_event, data: string) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

ipcMain.handle('pty-resize', (_event, cols: number, rows: number) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
});

ipcMain.handle('pty-kill', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});

// Run Claude in terminal
ipcMain.handle('run-claude', () => {
  if (ptyProcess) {
    ptyProcess.write('claude\r');
  }
});

// Config Management
const CONFIG_DIR = path.join(os.homedir(), '.sqlwhisperer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface AppConfig {
  azure: {
    subscriptionId: string;
    resourceGroup: string;
    factoryName: string;
  };
  bc: {
    environmentUrl: string;
    companyId: string;
  };
  paths: {
    adfRepoPath: string;
    extensionPath: string;
    resultsPath: string;
  };
  pipeline: {
    name: string;
    timeoutMinutes: number;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  azure: {
    subscriptionId: '',
    resourceGroup: '',
    factoryName: '',
  },
  bc: {
    environmentUrl: '',
    companyId: '',
  },
  paths: {
    adfRepoPath: '',
    extensionPath: '',
    resultsPath: path.join(os.homedir(), '.sqlwhisperer', 'results'),
  },
  pipeline: {
    name: 'SQLWhisperer',
    timeoutMinutes: 5,
  },
};

ipcMain.handle('config-load', async () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { ...DEFAULT_CONFIG };
});

ipcMain.handle('config-save', async (_event, config: AppConfig) => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error: any) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
