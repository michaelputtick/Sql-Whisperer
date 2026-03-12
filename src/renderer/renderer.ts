import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// Terminal instance
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;

// Initialize terminal when switching to terminal tab
function initTerminal(): void {
  if (terminal) return;

  const terminalContainer = document.getElementById('terminal');
  if (!terminalContainer) return;

  terminal = new Terminal({
    fontFamily: '"Cascadia Code", "Consolas", monospace',
    fontSize: 14,
    theme: {
      background: '#0c0c0c',
      foreground: '#cccccc',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: '#264f78',
      black: '#0c0c0c',
      red: '#c50f1f',
      green: '#13a10e',
      yellow: '#c19c00',
      blue: '#0037da',
      magenta: '#881798',
      cyan: '#3a96dd',
      white: '#cccccc',
      brightBlack: '#767676',
      brightRed: '#e74856',
      brightGreen: '#16c60c',
      brightYellow: '#f9f1a5',
      brightBlue: '#3b78ff',
      brightMagenta: '#b4009e',
      brightCyan: '#61d6d6',
      brightWhite: '#f2f2f2',
    },
    cursorBlink: true,
    cursorStyle: 'block',
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(terminalContainer);
  fitAddon.fit();

  // Handle terminal input
  terminal.onData((data: string) => {
    window.electronAPI.ptyWrite(data);
  });

  // Handle PTY output
  window.electronAPI.onPtyData((data: string) => {
    if (terminal) {
      terminal.write(data);
    }
  });

  // Handle PTY exit
  window.electronAPI.onPtyExit((code: number) => {
    if (terminal) {
      terminal.writeln(`\r\n[Process exited with code ${code}]`);
    }
  });

  // Create PTY
  const dims = fitAddon.proposeDimensions();
  window.electronAPI.ptyCreate(dims?.cols || 80, dims?.rows || 24);

  // Handle resize
  window.addEventListener('resize', () => {
    if (fitAddon && terminal) {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI.ptyResize(dims.cols, dims.rows);
      }
    }
  });

  // Also resize when panel becomes visible
  const observer = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.electronAPI.ptyResize(dims.cols, dims.rows);
      }
    }
  });
  observer.observe(terminalContainer);
}

// Tab switching
function switchTab(tabName: string): void {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.remove('active');
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    }
  });

  // Update panels
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.remove('active');
  });

  const panelId = tabName === 'terminal' ? 'terminal-panel' : tabName;
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.add('active');
  }

  // Initialize terminal if switching to terminal tab
  if (tabName === 'terminal') {
    setTimeout(() => {
      initTerminal();
      if (fitAddon) {
        fitAddon.fit();
      }
    }, 100);
  }
}

// Run Claude in terminal
function runClaude(): void {
  if (!terminal) {
    initTerminal();
    setTimeout(() => {
      window.electronAPI.runClaude();
    }, 500);
  } else {
    window.electronAPI.runClaude();
  }
}

// New shell
function newShell(): void {
  if (terminal) {
    terminal.clear();
    window.electronAPI.ptyKill();
    const dims = fitAddon?.proposeDimensions();
    window.electronAPI.ptyCreate(dims?.cols || 80, dims?.rows || 24);
  }
}

// Clear terminal
function clearTerminal(): void {
  if (terminal) {
    terminal.clear();
  }
}

// Send message (Assistant)
function sendMessage(): void {
  const input = document.getElementById('user-input') as HTMLTextAreaElement;
  const messages = document.getElementById('chat-messages');

  if (!input || !messages || !input.value.trim()) return;

  const userMessage = input.value.trim();
  input.value = '';

  // Add user message
  const userDiv = document.createElement('div');
  userDiv.className = 'message user';
  userDiv.innerHTML = `<p>${escapeHtml(userMessage)}</p>`;
  messages.appendChild(userDiv);

  // TODO: Send to Claude and get response
  // For now, just show a placeholder
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';
  assistantDiv.innerHTML = `<p>Processing your request... (Claude integration pending)</p>`;
  messages.appendChild(assistantDiv);

  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize tab click handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Handle Enter in chat input
  const userInput = document.getElementById('user-input');
  if (userInput) {
    userInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});

// Expose functions to global scope for HTML onclick handlers
(window as any).switchTab = switchTab;
(window as any).runClaude = runClaude;
(window as any).newShell = newShell;
(window as any).clearTerminal = clearTerminal;
(window as any).sendMessage = sendMessage;
