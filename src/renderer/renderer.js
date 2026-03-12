// Use require for node modules (nodeIntegration enabled, contextIsolation disabled)
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { ipcRenderer } = require('electron');

// Terminal instance
let terminal = null;
let fitAddon = null;
let resizeTimeout = null;
let ptyListenersAdded = false;
let ptyCreated = false;

// Initialize terminal when switching to terminal tab
function initTerminal() {
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
    },
    cursorBlink: true,
    cursorStyle: 'block',
    convertEol: false,
    scrollback: 10000,
    scrollOnUserInput: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(terminalContainer);
  fitAddon.fit();

  // Handle terminal input - send to PTY
  terminal.onData((data) => {
    ipcRenderer.invoke('pty-write', data);
  });

  // Only add PTY listeners once
  if (!ptyListenersAdded) {
    ptyListenersAdded = true;

    // Handle PTY output - display in terminal
    ipcRenderer.on('pty-data', (event, data) => {
      if (terminal) {
        terminal.write(data);
      }
    });

    // Handle PTY exit
    ipcRenderer.on('pty-exit', (event, code) => {
      if (terminal) {
        terminal.writeln(`\r\n[Process exited with code ${code}]`);
      }
    });
  }

  // Create PTY only once
  if (!ptyCreated) {
    ptyCreated = true;
    const dims = fitAddon.proposeDimensions();
    ipcRenderer.invoke('pty-create', dims?.cols || 80, dims?.rows || 24);
  }

  // Resize only on window resize, not continuously
  let lastCols = 0;
  let lastRows = 0;

  function doResize() {
    if (fitAddon && terminal) {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && (dims.cols !== lastCols || dims.rows !== lastRows)) {
        lastCols = dims.cols;
        lastRows = dims.rows;
        ipcRenderer.invoke('pty-resize', dims.cols, dims.rows);
      }
    }
  }

  // Only resize on actual window resize
  window.addEventListener('resize', doResize);

  // Initial fit
  setTimeout(doResize, 200);
}

// Tab switching
function switchTab(tabName) {
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
function runClaude() {
  if (!terminal) {
    initTerminal();
    setTimeout(() => {
      ipcRenderer.invoke('run-claude');
    }, 500);
  } else {
    ipcRenderer.invoke('run-claude');
  }
}

// New shell
function newShell() {
  if (terminal) {
    terminal.clear();
    ipcRenderer.invoke('pty-kill');
    ptyCreated = false;
    const dims = fitAddon?.proposeDimensions();
    ipcRenderer.invoke('pty-create', dims?.cols || 80, dims?.rows || 24);
    ptyCreated = true;
  }
}

// Clear terminal
function clearTerminal() {
  if (terminal) {
    terminal.clear();
  }
}

// Send message (Assistant)
function sendMessage() {
  const input = document.getElementById('user-input');
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
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';
  assistantDiv.innerHTML = `<p>Processing your request... (Claude integration pending)</p>`;
  messages.appendChild(assistantDiv);

  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize tab click handlers
document.addEventListener('DOMContentLoaded', () => {
  // Tab buttons
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Feature cards on home page
  document.querySelectorAll('.feature-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tabName = card.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Terminal toolbar buttons
  const runClaudeBtn = document.getElementById('run-claude-btn');
  if (runClaudeBtn) runClaudeBtn.addEventListener('click', runClaude);

  const newShellBtn = document.getElementById('new-shell-btn');
  if (newShellBtn) newShellBtn.addEventListener('click', newShell);

  const clearTerminalBtn = document.getElementById('clear-terminal-btn');
  if (clearTerminalBtn) clearTerminalBtn.addEventListener('click', clearTerminal);

  // Chat send button and Enter key
  const sendMessageBtn = document.getElementById('send-message-btn');
  if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);

  const userInput = document.getElementById('user-input');
  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Mapping panel controls
  const projectSelect = document.getElementById('project-select');
  if (projectSelect) projectSelect.addEventListener('change', loadProject);

  const querySelect = document.getElementById('query-select');
  if (querySelect) querySelect.addEventListener('change', loadQueryFields);

  const mappingSelectEl = document.getElementById('mapping-select');
  if (mappingSelectEl) mappingSelectEl.addEventListener('change', () => {
    loadMappingData(mappingSelectEl.value);
  });

  const targetSelect = document.getElementById('target-select');
  if (targetSelect) targetSelect.addEventListener('change', loadTargetFields);

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshProjects);

  const addMappingBtn = document.getElementById('add-mapping-btn');
  if (addMappingBtn) addMappingBtn.addEventListener('click', addManualMapping);

  const addRuleBtn = document.getElementById('add-rule-btn');
  if (addRuleBtn) addRuleBtn.addEventListener('click', addRule);

  // Mapping area drag and drop
  const mappingArea = document.getElementById('mapping-area');
  if (mappingArea) {
    mappingArea.addEventListener('drop', handleDrop);
    mappingArea.addEventListener('dragover', handleDragOver);
    mappingArea.addEventListener('dragleave', handleDragLeave);
  }

  // Load projects when mapping tab is clicked
  const mappingTab = document.querySelector('[data-tab="mapping"]');
  if (mappingTab) {
    mappingTab.addEventListener('click', refreshProjects);
  }
});

// ============ Mapping System ============

const fs = require('fs');
const path = require('path');
const os = require('os');

// State
let currentProject = null;
let currentQuery = null;
let currentMappings = [];
let currentRules = [];
let availableMappings = []; // All mappings for current query
let currentMappingId = null; // Currently selected mapping
let sourceFields = [];
let targetFields = [];
let draggedField = null;
let dragSource = null; // 'source' or 'target'

// Storage paths
const STORAGE_DIR = path.join(os.homedir(), '.sqlwhisperer', 'projects');
const PROJECTS_INDEX = path.join(STORAGE_DIR, 'index.json');
// Also check app data folder (where Claude might save projects)
// Use multiple possible locations since __dirname varies
const APP_DATA_DIRS = [
  path.join(__dirname, '..', '..', 'data'),
  path.join(os.homedir(), 'Documents', 'SQLWhisperer-TS', 'data'),
];

// BC Target Entities
const BC_ENTITIES = {
  Item: [
    { name: 'number', type: 'string', required: true, maxLength: 20 },
    { name: 'displayName', type: 'string', required: true, maxLength: 100 },
    { name: 'type', type: 'string', required: true },
    { name: 'itemCategoryCode', type: 'string', required: false, maxLength: 20 },
    { name: 'baseUnitOfMeasureCode', type: 'string', required: true, maxLength: 10 },
    { name: 'unitPrice', type: 'number', required: false },
    { name: 'unitCost', type: 'number', required: false },
    { name: 'blocked', type: 'boolean', required: false }
  ],
  Customer: [
    { name: 'number', type: 'string', required: true, maxLength: 20 },
    { name: 'displayName', type: 'string', required: true, maxLength: 100 },
    { name: 'addressLine1', type: 'string', required: false, maxLength: 100 },
    { name: 'addressLine2', type: 'string', required: false, maxLength: 50 },
    { name: 'city', type: 'string', required: false, maxLength: 30 },
    { name: 'state', type: 'string', required: false, maxLength: 30 },
    { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
    { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 },
    { name: 'email', type: 'string', required: false, maxLength: 80 },
    { name: 'blocked', type: 'string', required: false }
  ],
  Vendor: [
    { name: 'number', type: 'string', required: true, maxLength: 20 },
    { name: 'displayName', type: 'string', required: true, maxLength: 100 },
    { name: 'addressLine1', type: 'string', required: false, maxLength: 100 },
    { name: 'addressLine2', type: 'string', required: false, maxLength: 50 },
    { name: 'city', type: 'string', required: false, maxLength: 30 },
    { name: 'state', type: 'string', required: false, maxLength: 30 },
    { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
    { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 },
    { name: 'email', type: 'string', required: false, maxLength: 80 },
    { name: 'blocked', type: 'string', required: false }
  ]
};

// Load projects list from both storage locations
function loadProjectsList() {
  const projects = [];

  // Load from index file (CLI-created projects)
  try {
    if (fs.existsSync(PROJECTS_INDEX)) {
      const indexed = JSON.parse(fs.readFileSync(PROJECTS_INDEX, 'utf-8'));
      projects.push(...indexed);
    }
  } catch (e) {
    console.error('Error loading projects index:', e);
  }

  // Also scan app data folders for project files (Claude-created projects)
  for (const APP_DATA_DIR of APP_DATA_DIRS) {
    try {
      if (fs.existsSync(APP_DATA_DIR)) {
        console.log('Scanning:', APP_DATA_DIR);
        const files = fs.readdirSync(APP_DATA_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const filePath = path.join(APP_DATA_DIR, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            // Check if it looks like a migration project
            if (data.id && data.name && data.queries && data.mappings) {
              console.log('Found project:', data.name, 'with', data.queries.length, 'queries');
              // Don't add duplicates
              if (!projects.find(p => p.id === data.id)) {
                projects.push({
                  id: data.id,
                  name: data.name,
                  updatedAt: data.updatedAt,
                  _filePath: filePath // Store path for loading
                });
              }
            }
          } catch (e) {
            // Skip invalid files
          }
        }
      }
    } catch (e) {
      console.error('Error scanning app data folder:', APP_DATA_DIR, e);
    }
  }

  return projects;
}

// Load a specific project
function loadProjectData(projectId) {
  console.log('loadProjectData called with:', projectId);

  // First try the standard storage location
  const projectPath = path.join(STORAGE_DIR, `${projectId}.json`);
  console.log('Checking storage path:', projectPath);
  try {
    if (fs.existsSync(projectPath)) {
      console.log('Found in storage');
      return JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading project from storage:', e);
  }

  // Then try the app data folders
  for (const APP_DATA_DIR of APP_DATA_DIRS) {
    console.log('Checking app data dir:', APP_DATA_DIR);
    try {
      if (fs.existsSync(APP_DATA_DIR)) {
        const files = fs.readdirSync(APP_DATA_DIR).filter(f => f.endsWith('.json'));
        console.log('Files found:', files);
        for (const file of files) {
          const filePath = path.join(APP_DATA_DIR, file);
          try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            console.log('Checking file:', file, 'id:', data.id, 'looking for:', projectId);
            if (data.id === projectId) {
              console.log('MATCH! Loaded project from:', filePath);
              return data;
            }
          } catch (e) {
            console.error('Error parsing file:', file, e);
          }
        }
      } else {
        console.log('Dir does not exist:', APP_DATA_DIR);
      }
    } catch (e) {
      console.error('Error loading project from app data:', APP_DATA_DIR, e);
    }
  }

  console.log('Project not found');
  return null;
}

// Refresh projects dropdown
function refreshProjects() {
  const select = document.getElementById('project-select');
  const projects = loadProjectsList();

  select.innerHTML = '<option value="">Select Project...</option>';
  projects.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    select.appendChild(option);
  });
}

// Load project when selected
function loadProject() {
  const projectId = document.getElementById('project-select').value;
  const querySelect = document.getElementById('query-select');
  const targetSelect = document.getElementById('target-select');

  querySelect.innerHTML = '<option value="">Select Source Query...</option>';
  const mappingSelect = document.getElementById('mapping-select');
  mappingSelect.style.display = 'none';
  mappingSelect.innerHTML = '<option value="">Select Mapping...</option>';

  currentProject = null;
  currentQuery = null;
  sourceFields = [];
  targetFields = [];
  currentMappings = [];
  currentRules = [];
  availableMappings = [];
  currentMappingId = null;
  renderSourceFields();
  renderTargetFields();
  renderMappings();
  renderRules();

  if (!projectId) return;

  currentProject = loadProjectData(projectId);
  if (!currentProject) {
    console.error('Failed to load project:', projectId);
    return;
  }

  console.log('Loaded project:', currentProject.name);
  console.log('Queries:', currentProject.queries?.length || 0);

  // Populate queries dropdown
  if (!currentProject.queries || currentProject.queries.length === 0) {
    console.warn('No queries found in project');
    return;
  }

  currentProject.queries.forEach(q => {
    const option = document.createElement('option');
    option.value = q.id;
    option.textContent = `${q.name} (${q.rowCount || q.fields?.length || 0} rows)`;
    querySelect.appendChild(option);
  });

  // Populate target entities dropdown from project (if available) or use defaults
  targetSelect.innerHTML = '<option value="">Select Target Entity...</option>';
  const entities = currentProject.targetEntities || Object.keys(BC_ENTITIES).map(name => ({ name, displayName: name }));
  entities.forEach(e => {
    const option = document.createElement('option');
    option.value = e.name;
    option.textContent = e.displayName || e.name;
    targetSelect.appendChild(option);
  });
}

// Load query fields when selected
function loadQueryFields() {
  const queryId = document.getElementById('query-select').value;
  const mappingSelect = document.getElementById('mapping-select');

  sourceFields = [];
  currentMappings = [];
  currentRules = [];
  availableMappings = [];
  currentMappingId = null;

  // Hide mapping selector by default
  mappingSelect.style.display = 'none';
  mappingSelect.innerHTML = '<option value="">Select Mapping...</option>';

  if (!queryId || !currentProject) {
    renderSourceFields();
    renderMappings();
    renderRules();
    return;
  }

  currentQuery = currentProject.queries.find(q => q.id === queryId);
  if (currentQuery) {
    sourceFields = currentQuery.fields;
  }

  // Find ALL mappings for this query
  if (currentProject.mappings) {
    availableMappings = currentProject.mappings.filter(m => m.sourceQueryId === queryId);

    if (availableMappings.length > 1) {
      // Show mapping selector for multiple mappings
      mappingSelect.style.display = 'block';
      availableMappings.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = `${m.name} → ${m.targetEntity}`;
        mappingSelect.appendChild(option);
      });

      // Auto-select the first mapping
      mappingSelect.value = availableMappings[0].id;
      loadMappingData(availableMappings[0].id);
    } else if (availableMappings.length === 1) {
      // Single mapping - load it directly
      loadMappingData(availableMappings[0].id);
    }
  }

  renderSourceFields();
}

// Load a specific mapping's data
function loadMappingData(mappingId) {
  currentMappings = [];
  currentRules = [];
  currentMappingId = mappingId;

  const mapping = availableMappings.find(m => m.id === mappingId);
  if (!mapping) {
    renderMappings();
    renderRules();
    return;
  }

  // Load field mappings
  if (mapping.fieldMappings) {
    currentMappings = mapping.fieldMappings.map(fm => ({
      id: fm.id,
      sourceField: fm.sourceField || '',
      targetField: fm.targetField || '',
      transform: fm.transform || null,
      description: fm.description || ''
    }));
  }

  // Load rules
  if (mapping.rules && mapping.rules.length > 0) {
    currentRules = mapping.rules;
  }

  // Select the target entity
  const targetSelect = document.getElementById('target-select');
  if (mapping.targetEntity) {
    targetSelect.value = mapping.targetEntity;
    loadTargetFields();
  }

  renderMappings();
  renderRules();
}

// Load target fields when entity selected
function loadTargetFields() {
  const entity = document.getElementById('target-select').value;

  // First check if project has custom target entities
  if (currentProject && currentProject.targetEntities) {
    const projectEntity = currentProject.targetEntities.find(e => e.name === entity);
    if (projectEntity) {
      targetFields = projectEntity.fields;
      renderTargetFields();
      return;
    }
  }

  // Fall back to built-in BC entities
  targetFields = entity ? BC_ENTITIES[entity] || [] : [];
  renderTargetFields();
}

// Render source fields
function renderSourceFields() {
  const container = document.getElementById('source-fields');
  const count = document.getElementById('source-count');

  count.textContent = `${sourceFields.length} fields`;

  if (sourceFields.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Select a query to see source fields</p></div>';
    return;
  }

  container.innerHTML = '';
  sourceFields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'field-item';
    div.draggable = true;
    div.innerHTML = `
      <span class="field-name">${f.name}</span>
      <span class="field-type">${f.type}</span>
    `;
    div.addEventListener('dragstart', (e) => handleDragStart(e, 'source', f.name));
    div.addEventListener('dragend', handleDragEnd);
    container.appendChild(div);
  });
}

// Render target fields
function renderTargetFields() {
  const container = document.getElementById('target-fields');
  const count = document.getElementById('target-count');

  count.textContent = `${targetFields.length} fields`;

  if (targetFields.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Select a target entity to see fields</p></div>';
    return;
  }

  container.innerHTML = '';
  targetFields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'field-item' + (f.required ? ' required' : '');
    div.draggable = true;
    div.innerHTML = `
      <span class="field-name">${f.name}</span>
      <span class="field-type">${f.type}${f.maxLength ? `(${f.maxLength})` : ''}</span>
    `;
    div.addEventListener('dragstart', (e) => handleDragStart(e, 'target', f.name));
    div.addEventListener('dragend', handleDragEnd);
    container.appendChild(div);
  });
}

// Drag and drop handlers
function handleDragStart(event, source, fieldName) {
  draggedField = fieldName;
  dragSource = source;
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(event) {
  event.target.classList.remove('dragging');
  draggedField = null;
  dragSource = null;
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  document.getElementById('mapping-area').classList.add('drag-over');
}

function handleDragLeave(event) {
  document.getElementById('mapping-area').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('mapping-area').classList.remove('drag-over');

  if (!draggedField) return;

  // Create a new mapping
  const newMapping = {
    id: Date.now().toString(),
    sourceField: dragSource === 'source' ? draggedField : '',
    targetField: dragSource === 'target' ? draggedField : '',
    transform: null
  };

  currentMappings.push(newMapping);
  renderMappings();
}

// Render current mappings
function renderMappings() {
  const container = document.getElementById('mapping-rows');
  const emptyState = document.getElementById('mapping-empty');

  if (currentMappings.length === 0) {
    emptyState.style.display = 'block';
    container.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = '';

  currentMappings.forEach(m => {
    const row = document.createElement('div');
    row.className = 'mapping-row';
    row.dataset.id = m.id;

    // Create source select
    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'source-field';
    sourceSelect.innerHTML = `<option value="">Select source...</option>` +
      sourceFields.map(f => `<option value="${f.name}" ${f.name === m.sourceField ? 'selected' : ''}>${f.name}</option>`).join('');
    sourceSelect.addEventListener('change', () => updateMapping(m.id, 'source', sourceSelect.value));

    // Create arrow
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    // Create target select
    const targetSelectEl = document.createElement('select');
    targetSelectEl.className = 'target-field';
    targetSelectEl.innerHTML = `<option value="">Select target...</option>` +
      targetFields.map(f => `<option value="${f.name}" ${f.name === m.targetField ? 'selected' : ''}>${f.name}</option>`).join('');
    targetSelectEl.addEventListener('change', () => updateMapping(m.id, 'target', targetSelectEl.value));

    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => deleteMapping(m.id));

    // Add elements to row
    row.appendChild(sourceSelect);
    row.appendChild(arrow);
    row.appendChild(targetSelectEl);

    if (m.transform) {
      const transformBadge = document.createElement('span');
      transformBadge.className = 'transform-badge';
      transformBadge.textContent = m.transform.type;
      row.appendChild(transformBadge);
    }

    row.appendChild(deleteBtn);
    container.appendChild(row);
  });
}

// Update a mapping
function updateMapping(id, field, value) {
  const mapping = currentMappings.find(m => m.id === id);
  if (mapping) {
    if (field === 'source') mapping.sourceField = value;
    if (field === 'target') mapping.targetField = value;
  }
}

// Delete a mapping
function deleteMapping(id) {
  currentMappings = currentMappings.filter(m => m.id !== id);
  renderMappings();
}

// Add manual mapping
function addManualMapping() {
  currentMappings.push({
    id: Date.now().toString(),
    sourceField: '',
    targetField: '',
    transform: null
  });
  renderMappings();
}

// Render rules
function renderRules() {
  const container = document.getElementById('rules-list');

  if (!container) return;

  if (currentRules.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 16px;"><p>No rules defined</p></div>';
    return;
  }

  container.innerHTML = '';
  currentRules.forEach(rule => {
    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'rule-item';
    ruleDiv.dataset.id = rule.id;

    // Rule type badge color
    const typeColors = {
      filter: '#0e639c',
      validate: '#6b2fba',
      lookup: '#2ea043',
      aggregate: '#d29922',
      skip: '#808080',
      custom: '#e34c26'
    };
    const typeColor = typeColors[rule.type] || '#808080';

    // Enable/disable toggle
    const enabledClass = rule.enabled !== false ? '' : 'disabled';
    const enabledIcon = rule.enabled !== false ? '✓' : '○';

    ruleDiv.innerHTML = `
      <span class="rule-toggle ${enabledClass}" title="Toggle rule">${enabledIcon}</span>
      <span class="rule-type" style="background-color: ${typeColor}">${rule.type}</span>
      <span class="rule-name">${rule.name}</span>
      ${rule.description ? `<span class="rule-desc" title="${rule.description}">ℹ</span>` : ''}
      <button class="rule-edit-btn" title="Edit rule">✎</button>
      <button class="rule-delete-btn" title="Delete rule">×</button>
    `;

    // Add event listeners
    const toggle = ruleDiv.querySelector('.rule-toggle');
    toggle.addEventListener('click', () => toggleRule(rule.id));

    const editBtn = ruleDiv.querySelector('.rule-edit-btn');
    editBtn.addEventListener('click', () => editRule(rule.id));

    const deleteBtn = ruleDiv.querySelector('.rule-delete-btn');
    deleteBtn.addEventListener('click', () => deleteRule(rule.id));

    container.appendChild(ruleDiv);
  });
}

// Toggle rule enabled/disabled
function toggleRule(ruleId) {
  const rule = currentRules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = rule.enabled === false ? true : false;
    renderRules();
  }
}

// Edit rule
function editRule(ruleId) {
  const rule = currentRules.find(r => r.id === ruleId);
  if (rule) {
    // Show rule details in an alert for now
    const details = JSON.stringify(rule, null, 2);
    alert(`Rule Details:\n\n${details}\n\nUse the terminal to edit rules in JSON.`);
  }
}

// Delete rule
function deleteRule(ruleId) {
  if (confirm('Are you sure you want to delete this rule?')) {
    currentRules = currentRules.filter(r => r.id !== ruleId);
    renderRules();
  }
}

// Add rule (placeholder)
function addRule() {
  const newRule = {
    id: 'rule-' + Date.now(),
    type: 'filter',
    name: 'New Rule',
    enabled: true,
    condition: ''
  };
  currentRules.push(newRule);
  renderRules();
}


// ============ Settings ============

// Load settings into form
async function loadSettings() {
  try {
    const config = await ipcRenderer.invoke('config-load');

    // BC settings
    document.getElementById('bc-environment-url').value = config.bc?.environmentUrl || '';
    document.getElementById('bc-company-id').value = config.bc?.companyId || '';

    // Azure settings
    document.getElementById('azure-subscription-id').value = config.azure?.subscriptionId || '';
    document.getElementById('azure-resource-group').value = config.azure?.resourceGroup || '';
    document.getElementById('azure-factory-name').value = config.azure?.factoryName || '';

    // Path settings
    document.getElementById('path-adf-repo').value = config.paths?.adfRepoPath || '';
    document.getElementById('path-extension').value = config.paths?.extensionPath || '';
    document.getElementById('path-results').value = config.paths?.resultsPath || '';

    // Pipeline settings
    document.getElementById('pipeline-name').value = config.pipeline?.name || '';
    document.getElementById('pipeline-timeout').value = config.pipeline?.timeoutMinutes || 5;

    console.log('Settings loaded');
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings from form
async function saveSettings() {
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Saving...';
  statusEl.className = '';

  try {
    const config = {
      bc: {
        environmentUrl: document.getElementById('bc-environment-url').value.trim(),
        companyId: document.getElementById('bc-company-id').value.trim(),
      },
      azure: {
        subscriptionId: document.getElementById('azure-subscription-id').value.trim(),
        resourceGroup: document.getElementById('azure-resource-group').value.trim(),
        factoryName: document.getElementById('azure-factory-name').value.trim(),
      },
      paths: {
        adfRepoPath: document.getElementById('path-adf-repo').value.trim(),
        extensionPath: document.getElementById('path-extension').value.trim(),
        resultsPath: document.getElementById('path-results').value.trim(),
      },
      pipeline: {
        name: document.getElementById('pipeline-name').value.trim(),
        timeoutMinutes: parseInt(document.getElementById('pipeline-timeout').value) || 5,
      },
    };

    const result = await ipcRenderer.invoke('config-save', config);

    if (result.success) {
      statusEl.textContent = 'Settings saved successfully!';
      statusEl.className = '';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } else {
      statusEl.textContent = 'Error: ' + result.error;
      statusEl.className = 'error';
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.className = 'error';
  }
}

// Add settings event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Save settings button
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // Load settings when settings tab is clicked
  const settingsTab = document.querySelector('[data-tab="settings"]');
  if (settingsTab) {
    settingsTab.addEventListener('click', loadSettings);
  }
});

// Expose functions to global scope for HTML onclick handlers
window.switchTab = switchTab;
window.runClaude = runClaude;
window.newShell = newShell;
window.clearTerminal = clearTerminal;
window.sendMessage = sendMessage;
window.refreshProjects = refreshProjects;
window.loadProject = loadProject;
window.loadQueryFields = loadQueryFields;
window.loadTargetFields = loadTargetFields;
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.updateMapping = updateMapping;
window.deleteMapping = deleteMapping;
window.addManualMapping = addManualMapping;
window.addRule = addRule;
window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
