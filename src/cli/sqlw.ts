#!/usr/bin/env node
/**
 * SQLWhisperer CLI - Tools for Claude to interact with ADF pipelines and BC APIs
 * Usage: npx ts-node sqlw.ts <command> [args]
 *
 * Commands:
 *   config get                    - Show current configuration
 *   config set <key> <value>      - Set a configuration value
 *   adf list-pipelines            - List available ADF pipelines
 *   adf run <pipeline> [params]   - Run a pipeline
 *   adf status <runId>            - Check pipeline run status
 *   adf wait <runId>              - Wait for pipeline completion
 *   adf query <sql>               - Set SQL query and run SQLWhisperer pipeline
 *   adf results [file]            - Read pipeline results
 *   bc results [options]          - Fetch migration results from BC
 *   bc errors                     - Show migration errors only
 *   bc summary                    - Show migration summary statistics
 *   git status                    - Show git status of ADF repo
 *   git push <message>            - Commit and push changes
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DataFactoryManagementClient } from '@azure/arm-datafactory';
import { InteractiveBrowserCredential, AzureCliCredential, useIdentityPlugin } from '@azure/identity';
import { cachePersistencePlugin } from '@azure/identity-cache-persistence';
import { mappingStorage, analyzeQueryResults } from '../services/mappingStorage';
import { SavedQuery, generateId } from '../types/mapping';

// Enable credential caching to persist login across sessions
useIdentityPlugin(cachePersistencePlugin);

// Inline config to avoid import issues when running standalone
const CONFIG_DIR = path.join(os.homedir(), '.sqlwhisperer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface AppConfig {
  azure: {
    subscriptionId: string;
    resourceGroup: string;
    factoryName: string;
  };
  bc: {
    environmentUrl: string;  // e.g., https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name
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
    environmentUrl: '',  // Set via: sqlw config set bc.environmentUrl "https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name"
    companyId: '',       // Set via: sqlw config set bc.companyId "company-guid"
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

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: AppConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Git operations
async function gitStatus(repoPath: string): Promise<string> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync('git status --short', { cwd: repoPath });
    return stdout || 'No changes';
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

async function gitPush(message: string, repoPath: string): Promise<string> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    await execAsync('git add .', { cwd: repoPath });
    await execAsync(`git commit -m "${message}"`, { cwd: repoPath });
    await execAsync('git push', { cwd: repoPath });
    return 'Successfully committed and pushed changes';
  } catch (error: any) {
    if (error.message.includes('nothing to commit')) {
      return 'Nothing to commit';
    }
    return `Error: ${error.message}`;
  }
}

// BC API operations
interface MigrationResult {
  entryNo: number;
  migrationType: string;
  recordId: string;
  status: string;
  errorMessage: string;
  createdDateTime: string;
  parentRecordId: string;
  batchId: number;
}

async function getBCAccessToken(): Promise<string> {
  // Try Azure CLI first (if user is logged in via az login)
  try {
    const cliCredential = new AzureCliCredential();
    const tokenResponse = await cliCredential.getToken('https://api.businesscentral.dynamics.com/.default');
    return tokenResponse.token;
  } catch {
    // Fall back to interactive browser login with persistent cache
    if (!cachedCredential) {
      cachedCredential = new InteractiveBrowserCredential({
        redirectUri: 'http://localhost:8400',
        tokenCachePersistenceOptions: {
          enabled: true,
          name: 'sqlwhisperer'
        }
      });
    }
    const tokenResponse = await cachedCredential.getToken('https://api.businesscentral.dynamics.com/.default');
    return tokenResponse.token;
  }
}

async function fetchMigrationResults(
  config: AppConfig,
  filter?: { migrationType?: string; status?: string; batchId?: number; top?: number }
): Promise<MigrationResult[]> {
  if (!config.bc.environmentUrl || !config.bc.companyId) {
    throw new Error('BC environment URL and company ID must be configured. Run:\n  sqlw config set bc.environmentUrl "https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name"\n  sqlw config set bc.companyId "company-guid"');
  }

  const token = await getBCAccessToken();

  // Build OData filter
  const filters: string[] = [];
  if (filter?.migrationType) {
    filters.push(`migrationType eq '${filter.migrationType}'`);
  }
  if (filter?.status) {
    filters.push(`status eq '${filter.status}'`);
  }
  if (filter?.batchId !== undefined) {
    filters.push(`batchId eq ${filter.batchId}`);
  }

  let url = `${config.bc.environmentUrl}/api/VOLT/VOLT/v1.0/companies(${config.bc.companyId})/migrationResults`;
  const params: string[] = [];
  if (filters.length > 0) {
    params.push(`$filter=${encodeURIComponent(filters.join(' and '))}`);
  }
  if (filter?.top) {
    params.push(`$top=${filter.top}`);
  }
  params.push('$orderby=entryNo desc');

  if (params.length > 0) {
    url += '?' + params.join('&');
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BC API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.value || [];
}

function formatMigrationResults(results: MigrationResult[], format: 'table' | 'json' | 'summary' = 'table'): string {
  if (results.length === 0) {
    return 'No migration results found.';
  }

  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }

  if (format === 'summary') {
    const stats = {
      total: results.length,
      success: results.filter(r => r.status === 'Success').length,
      error: results.filter(r => r.status === 'Error').length,
      skipped: results.filter(r => r.status === 'Skipped').length,
      warning: results.filter(r => r.status === 'Warning').length,
    };

    const byType: Record<string, { total: number; errors: number }> = {};
    results.forEach(r => {
      if (!byType[r.migrationType]) {
        byType[r.migrationType] = { total: 0, errors: 0 };
      }
      byType[r.migrationType].total++;
      if (r.status === 'Error') {
        byType[r.migrationType].errors++;
      }
    });

    let output = `Migration Results Summary\n`;
    output += `========================\n\n`;
    output += `Total: ${stats.total}\n`;
    output += `  ✓ Success: ${stats.success}\n`;
    output += `  ✗ Error: ${stats.error}\n`;
    output += `  ⊘ Skipped: ${stats.skipped}\n`;
    output += `  ⚠ Warning: ${stats.warning}\n\n`;
    output += `By Migration Type:\n`;
    Object.entries(byType).forEach(([type, data]) => {
      output += `  ${type}: ${data.total} (${data.errors} errors)\n`;
    });

    return output;
  }

  // Table format
  let output = `\nMigration Results (${results.length} records)\n`;
  output += '─'.repeat(100) + '\n';
  output += `${'Entry'.padEnd(8)} ${'Type'.padEnd(15)} ${'Record ID'.padEnd(25)} ${'Status'.padEnd(10)} ${'Error Message'.substring(0, 40)}\n`;
  output += '─'.repeat(100) + '\n';

  results.forEach(r => {
    const status = r.status === 'Success' ? '✓' : r.status === 'Error' ? '✗' : r.status === 'Skipped' ? '⊘' : '⚠';
    const errorMsg = (r.errorMessage || '').substring(0, 40);
    output += `${String(r.entryNo).padEnd(8)} ${r.migrationType.padEnd(15)} ${r.recordId.padEnd(25)} ${(status + ' ' + r.status).padEnd(10)} ${errorMsg}\n`;
  });

  return output;
}

// ADF operations
async function listPipelines(config: AppConfig): Promise<string> {
  const pipelineDir = path.join(config.paths.adfRepoPath, 'pipeline');

  if (!fs.existsSync(pipelineDir)) {
    return `Pipeline directory not found: ${pipelineDir}`;
  }

  const files = fs.readdirSync(pipelineDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  return files.length > 0 ? files.join('\n') : 'No pipelines found';
}

function readPipelineJson(pipelineName: string, config: AppConfig): any {
  const pipelinePath = path.join(config.paths.adfRepoPath, 'pipeline', `${pipelineName}.json`);

  if (!fs.existsSync(pipelinePath)) {
    throw new Error(`Pipeline not found: ${pipelinePath}`);
  }

  return JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
}

function writePipelineJson(pipelineName: string, pipelineJson: any, config: AppConfig): void {
  const pipelinePath = path.join(config.paths.adfRepoPath, 'pipeline', `${pipelineName}.json`);
  fs.writeFileSync(pipelinePath, JSON.stringify(pipelineJson, null, '\t'));
}

function updateSqlQuery(query: string, config: AppConfig): string {
  try {
    const pipeline = readPipelineJson(config.pipeline.name, config);

    // Method 1: Update pipeline parameter default value (for Lookup activity pipelines)
    if (pipeline.properties?.parameters?.SqlQuery) {
      pipeline.properties.parameters.SqlQuery.defaultValue = query;
      writePipelineJson(config.pipeline.name, pipeline, config);
      return `Updated SQL query in ${config.pipeline.name} pipeline parameter`;
    }

    // Method 2: Find and update Copy activity SQL query directly
    if (pipeline.properties?.activities) {
      for (const activity of pipeline.properties.activities) {
        if (activity.type === 'Copy' && activity.typeProperties?.source) {
          activity.typeProperties.source.sqlReaderQuery = query;
          writePipelineJson(config.pipeline.name, pipeline, config);
          return `Updated SQL query in ${config.pipeline.name} pipeline`;
        }
      }
    }

    return 'Could not find SqlQuery parameter or Copy activity in pipeline';
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

function readResults(filename: string, config: AppConfig): string {
  const resultsPath = path.join(config.paths.resultsPath, filename);

  if (!fs.existsSync(resultsPath)) {
    // Try looking in ADF repo output folder
    const altPath = path.join(config.paths.adfRepoPath, 'output', filename);
    if (fs.existsSync(altPath)) {
      return fs.readFileSync(altPath, 'utf-8');
    }
    return `Results file not found: ${resultsPath}`;
  }

  return fs.readFileSync(resultsPath, 'utf-8');
}

// Azure ADF SDK operations
let cachedCredential: InteractiveBrowserCredential | null = null;

async function getAdfClient(config: AppConfig): Promise<DataFactoryManagementClient> {
  if (!config.azure.subscriptionId) {
    throw new Error('Azure subscription ID not configured. Run: sqlw config set azure.subscriptionId <id>');
  }

  // Try Azure CLI first (if user is logged in via az login)
  try {
    const cliCredential = new AzureCliCredential();
    await cliCredential.getToken('https://management.azure.com/.default');
    return new DataFactoryManagementClient(cliCredential, config.azure.subscriptionId);
  } catch {
    // Fall back to interactive browser login with persistent cache
    if (!cachedCredential) {
      cachedCredential = new InteractiveBrowserCredential({
        redirectUri: 'http://localhost:8400',
        tokenCachePersistenceOptions: {
          enabled: true,
          name: 'sqlwhisperer'
        }
      });
    }
    return new DataFactoryManagementClient(cachedCredential, config.azure.subscriptionId);
  }
}

async function triggerPipeline(pipelineName: string, config: AppConfig): Promise<string> {
  try {
    const client = await getAdfClient(config);
    const result = await client.pipelines.createRun(
      config.azure.resourceGroup,
      config.azure.factoryName,
      pipelineName
    );
    return `Pipeline triggered successfully!\nRun ID: ${result.runId}\n\nCheck status with: npm run sqlw -- adf status ${result.runId}`;
  } catch (error: any) {
    return `Error triggering pipeline: ${error.message}`;
  }
}

async function getPipelineStatus(runId: string, config: AppConfig): Promise<string> {
  try {
    const client = await getAdfClient(config);
    const run = await client.pipelineRuns.get(
      config.azure.resourceGroup,
      config.azure.factoryName,
      runId
    );

    const status = run.status || 'Unknown';
    const duration = run.durationInMs ? `${Math.round(run.durationInMs / 1000)}s` : 'N/A';

    let output = `Pipeline: ${run.pipelineName}\n`;
    output += `Status: ${status}\n`;
    output += `Duration: ${duration}\n`;

    if (run.message) {
      output += `Message: ${run.message}\n`;
    }

    return output;
  } catch (error: any) {
    return `Error getting status: ${error.message}`;
  }
}

async function waitForPipeline(runId: string, config: AppConfig): Promise<string> {
  const maxWaitMs = config.pipeline.timeoutMinutes * 60 * 1000;
  const pollIntervalMs = 5000;
  const startTime = Date.now();

  console.log(`Waiting for pipeline run ${runId}...`);

  try {
    const client = await getAdfClient(config);

    while (Date.now() - startTime < maxWaitMs) {
      const run = await client.pipelineRuns.get(
        config.azure.resourceGroup,
        config.azure.factoryName,
        runId
      );

      const status = run.status || 'Unknown';

      if (status === 'Succeeded') {
        return `Pipeline completed successfully!\nDuration: ${Math.round((run.durationInMs || 0) / 1000)}s`;
      } else if (status === 'Failed') {
        return `Pipeline failed!\nMessage: ${run.message || 'No error message'}`;
      } else if (status === 'Cancelled') {
        return `Pipeline was cancelled.`;
      }

      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return `Timeout waiting for pipeline after ${config.pipeline.timeoutMinutes} minutes`;
  } catch (error: any) {
    return `Error waiting for pipeline: ${error.message}`;
  }
}

async function getActivityOutput(runId: string, config: AppConfig): Promise<string> {
  try {
    const client = await getAdfClient(config);

    // Query activity runs for this pipeline run
    const activityRuns = await client.activityRuns.queryByPipelineRun(
      config.azure.resourceGroup,
      config.azure.factoryName,
      runId,
      {
        lastUpdatedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        lastUpdatedBefore: new Date()
      }
    );

    if (!activityRuns.value || activityRuns.value.length === 0) {
      return 'No activity runs found for this pipeline run.';
    }

    let output = '';
    for (const activity of activityRuns.value) {
      output += `Activity: ${activity.activityName}\n`;
      output += `Status: ${activity.status}\n`;

      if (activity.output) {
        output += `\nOutput:\n${JSON.stringify(activity.output, null, 2)}\n`;
      }

      if (activity.error) {
        output += `\nError:\n${JSON.stringify(activity.error, null, 2)}\n`;
      }

      output += '\n---\n';
    }

    return output;
  } catch (error: any) {
    return `Error getting activity output: ${error.message}`;
  }
}

async function getRecentRuns(pipelineName: string | undefined, config: AppConfig): Promise<string> {
  try {
    const client = await getAdfClient(config);

    const lastUpdatedAfter = new Date();
    lastUpdatedAfter.setDate(lastUpdatedAfter.getDate() - 7); // Last 7 days
    const lastUpdatedBefore = new Date();

    const filterParams: any = {
      lastUpdatedAfter,
      lastUpdatedBefore,
    };

    if (pipelineName) {
      filterParams.filters = [
        {
          operand: 'PipelineName',
          operator: 'Equals',
          values: [pipelineName],
        },
      ];
    }

    const response = await client.pipelineRuns.queryByFactory(
      config.azure.resourceGroup,
      config.azure.factoryName,
      filterParams
    );

    const runs = response.value || [];
    if (runs.length === 0) {
      return 'No recent pipeline runs found.';
    }

    // Sort by run start time descending
    const sortedRuns = runs
      .sort((a, b) => {
        const dateA = a.runStart ? new Date(a.runStart).getTime() : 0;
        const dateB = b.runStart ? new Date(b.runStart).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    let output = 'Recent Pipeline Runs:\n\n';
    for (const run of sortedRuns) {
      const startTime = run.runStart ? new Date(run.runStart).toLocaleString() : 'N/A';
      const duration = run.durationInMs ? `${Math.round(run.durationInMs / 1000)}s` : 'N/A';
      output += `Run ID: ${run.runId}\n`;
      output += `  Pipeline: ${run.pipelineName}\n`;
      output += `  Status: ${run.status}\n`;
      output += `  Started: ${startTime}\n`;
      output += `  Duration: ${duration}\n`;
      if (run.message) {
        output += `  Message: ${run.message}\n`;
      }
      output += '\n';
    }

    return output;
  } catch (error: any) {
    return `Error getting recent runs: ${error.message}`;
  }
}

async function triggerAndWait(pipelineName: string, config: AppConfig): Promise<string> {
  try {
    const client = await getAdfClient(config);
    const result = await client.pipelines.createRun(
      config.azure.resourceGroup,
      config.azure.factoryName,
      pipelineName
    );

    console.log(`Pipeline triggered. Run ID: ${result.runId}`);
    const waitResult = await waitForPipeline(result.runId!, config);

    // If succeeded, also fetch and display the output
    if (waitResult.includes('successfully')) {
      console.log('\nFetching results...\n');
      const activityOutput = await getActivityOutput(result.runId!, config);
      return waitResult + '\n\n' + activityOutput;
    }

    return waitResult;
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();

  if (args.length === 0) {
    console.log(`
SQLWhisperer CLI - ADF Pipeline Tools for Claude

Commands:
  config get                    Show current configuration
  config set <key> <value>      Set a configuration value

  adf list                      List available ADF pipelines
  adf query <sql>               Set SQL query in SQLWhisperer pipeline
  adf read-pipeline <name>      Read pipeline JSON
  adf trigger [pipeline]        Trigger a pipeline run (default: SQLWhisperer)
  adf status <runId>            Check pipeline run status
  adf wait <runId>              Wait for pipeline to complete
  adf run [pipeline]            Trigger and wait for completion (includes results)
  adf output <runId>            Get activity output/results from a run
  adf recent-runs [pipeline]    List recent pipeline runs

  project list                  List all migration projects
  project create <name>         Create a new migration project
  project show <id>             Show project details
  project delete <id>           Delete a project

  query save <projectId> <name> <runId>   Save query results from a pipeline run
  query list <projectId>        List saved queries in a project
  query show <projectId> <queryId>        Show query details and results

  mapping list-targets          List available BC target entities
  mapping show-target <entity>  Show target entity fields

  git status                    Show git status of ADF repo
  git push <message>            Commit and push changes

Examples:
  sqlw project create "My Migration Project"
  sqlw adf query "SELECT TOP 100 * FROM IV00101"
  sqlw adf run
  sqlw query save proj-123 "Item Master" run-456
  sqlw mapping list-targets
`);
    return;
  }

  const command = args[0];
  const subCommand = args[1];

  switch (command) {
    case 'config':
      if (subCommand === 'get') {
        console.log(JSON.stringify(config, null, 2));
      } else if (subCommand === 'set' && args[2] && args[3]) {
        const key = args[2];
        const value = args[3];
        // Simple key setting (e.g., "azure.subscriptionId")
        const keys = key.split('.');
        let obj: any = config;
        for (let i = 0; i < keys.length - 1; i++) {
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        saveConfig(config);
        console.log(`Set ${key} = ${value}`);
      } else {
        console.log('Usage: sqlw config get | config set <key> <value>');
      }
      break;

    case 'adf':
      if (subCommand === 'list') {
        console.log(await listPipelines(config));
      } else if (subCommand === 'query' && args[2]) {
        const sql = args.slice(2).join(' ');
        console.log(updateSqlQuery(sql, config));
      } else if (subCommand === 'read-pipeline' && args[2]) {
        try {
          const pipeline = readPipelineJson(args[2], config);
          console.log(JSON.stringify(pipeline, null, 2));
        } catch (error: any) {
          console.log(`Error: ${error.message}`);
        }
      } else if (subCommand === 'results') {
        const filename = args[2] || 'results.json';
        console.log(readResults(filename, config));
      } else if (subCommand === 'trigger') {
        const pipelineName = args[2] || config.pipeline.name;
        console.log(await triggerPipeline(pipelineName, config));
      } else if (subCommand === 'status' && args[2]) {
        console.log(await getPipelineStatus(args[2], config));
      } else if (subCommand === 'wait' && args[2]) {
        console.log(await waitForPipeline(args[2], config));
      } else if (subCommand === 'run') {
        const pipelineName = args[2] || config.pipeline.name;
        console.log(await triggerAndWait(pipelineName, config));
      } else if (subCommand === 'output' && args[2]) {
        console.log(await getActivityOutput(args[2], config));
      } else if (subCommand === 'recent-runs' || subCommand === 'recent') {
        const pipelineName = args[2]; // Optional pipeline name filter
        console.log(await getRecentRuns(pipelineName, config));
      } else {
        console.log('Usage: sqlw adf list | query <sql> | trigger | status <runId> | wait <runId> | run | output <runId> | recent-runs [pipeline]');
      }
      break;

    case 'git':
      if (subCommand === 'status') {
        console.log(await gitStatus(config.paths.adfRepoPath));
      } else if (subCommand === 'push' && args[2]) {
        const message = args.slice(2).join(' ');
        console.log(await gitPush(message, config.paths.adfRepoPath));
      } else {
        console.log('Usage: sqlw git status | push <message>');
      }
      break;

    case 'bc':
      if (subCommand === 'results') {
        // Parse options: --type, --status, --batch, --top, --format
        const typeIndex = args.indexOf('--type');
        const statusIndex = args.indexOf('--status');
        const batchIndex = args.indexOf('--batch');
        const topIndex = args.indexOf('--top');
        const formatIndex = args.indexOf('--format');

        const filter: { migrationType?: string; status?: string; batchId?: number; top?: number } = {};
        let format: 'table' | 'json' | 'summary' = 'table';

        if (typeIndex !== -1 && args[typeIndex + 1]) {
          filter.migrationType = args[typeIndex + 1];
        }
        if (statusIndex !== -1 && args[statusIndex + 1]) {
          filter.status = args[statusIndex + 1];
        }
        if (batchIndex !== -1 && args[batchIndex + 1]) {
          filter.batchId = parseInt(args[batchIndex + 1], 10);
        }
        if (topIndex !== -1 && args[topIndex + 1]) {
          filter.top = parseInt(args[topIndex + 1], 10);
        } else {
          filter.top = 50; // Default to last 50 results
        }
        if (formatIndex !== -1 && args[formatIndex + 1]) {
          const fmt = args[formatIndex + 1].toLowerCase();
          if (fmt === 'json' || fmt === 'summary' || fmt === 'table') {
            format = fmt;
          }
        }

        try {
          console.log('Fetching migration results from Business Central...');
          const results = await fetchMigrationResults(config, filter);
          console.log(formatMigrationResults(results, format));
        } catch (error: any) {
          console.error('Error:', error.message);
        }
      } else if (subCommand === 'errors') {
        // Shortcut for errors only
        try {
          console.log('Fetching migration errors from Business Central...');
          const results = await fetchMigrationResults(config, { status: 'Error', top: 100 });
          console.log(formatMigrationResults(results, 'table'));
        } catch (error: any) {
          console.error('Error:', error.message);
        }
      } else if (subCommand === 'summary') {
        // Shortcut for summary view
        try {
          console.log('Fetching migration summary from Business Central...');
          const results = await fetchMigrationResults(config, { top: 1000 });
          console.log(formatMigrationResults(results, 'summary'));
        } catch (error: any) {
          console.error('Error:', error.message);
        }
      } else {
        console.log('Usage: sqlw bc results [--type Customer|Item|Vendor] [--status Success|Error|Skipped] [--batch 123] [--top 50] [--format table|json|summary]');
        console.log('       sqlw bc errors                    - Show only errors');
        console.log('       sqlw bc summary                   - Show summary statistics');
        console.log('\nConfiguration required:');
        console.log('  sqlw config set bc.environmentUrl "https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name"');
        console.log('  sqlw config set bc.companyId "company-guid"');
      }
      break;

    case 'project':
      if (subCommand === 'list') {
        const projects = mappingStorage.listProjects();
        if (projects.length === 0) {
          console.log('No projects found. Create one with: sqlw project create <name> [--source GP|NAV|AX]');
        } else {
          console.log('Migration Projects:\n');
          projects.forEach(p => {
            console.log(`  ID: ${p.id}`);
            console.log(`  Name: ${p.name}`);
            console.log(`  Source: ${p.sourceSystem || 'GP'}`);
            console.log(`  Updated: ${p.updatedAt}`);
            console.log('');
          });
        }
      } else if (subCommand === 'create' && args[2]) {
        // Parse --source flag
        const sourceIndex = args.indexOf('--source');
        let sourceSystem: 'GP' | 'NAV' | 'AX' | 'OTHER' = 'GP';
        let nameArgs = args.slice(2);

        if (sourceIndex !== -1 && args[sourceIndex + 1]) {
          const sourceArg = args[sourceIndex + 1].toUpperCase();
          if (['GP', 'NAV', 'AX', 'OTHER'].includes(sourceArg)) {
            sourceSystem = sourceArg as 'GP' | 'NAV' | 'AX' | 'OTHER';
          }
          nameArgs = nameArgs.filter((_, i) => i !== sourceIndex - 2 && i !== sourceIndex - 1);
        }

        const name = nameArgs.join(' ');
        const project = mappingStorage.createProject(name, sourceSystem);
        console.log(`Created project: ${project.name}`);
        console.log(`Project ID: ${project.id}`);
        console.log(`Source System: ${project.sourceSystemConfig?.displayName || sourceSystem}`);
      } else if (subCommand === 'show' && args[2]) {
        const project = mappingStorage.loadProject(args[2]);
        if (!project) {
          console.log('Project not found');
        } else {
          console.log(`Project: ${project.name}`);
          console.log(`ID: ${project.id}`);
          console.log(`Source System: ${project.sourceSystemConfig?.displayName || project.sourceSystem}`);
          console.log(`Target System: ${project.targetSystem}`);
          console.log(`Created: ${project.createdAt}`);
          console.log(`Updated: ${project.updatedAt}`);
          console.log(`\nQueries: ${project.queries.length}`);
          project.queries.forEach(q => {
            console.log(`  - ${q.name} (${q.rowCount} rows)`);
          });
          console.log(`\nMappings: ${project.mappings.length}`);
          project.mappings.forEach(m => {
            console.log(`  - ${m.name} (${m.status})`);
          });
        }
      } else if (subCommand === 'delete' && args[2]) {
        mappingStorage.deleteProject(args[2]);
        console.log('Project deleted');
      } else {
        console.log('Usage: sqlw project list | create <name> [--source GP|NAV|AX] | show <id> | delete <id>');
      }
      break;

    case 'query':
      if (subCommand === 'save' && args[2] && args[3] && args[4]) {
        const projectId = args[2];
        const queryName = args[3];
        const runId = args[4];

        // Get the activity output from the pipeline run
        console.log('Fetching query results from pipeline run...');
        const output = await getActivityOutput(runId, config);

        // Try to parse results from the output
        try {
          // The output contains JSON with the query results
          const outputMatch = output.match(/Output:\s*(\{[\s\S]*?\})\s*---/);
          if (outputMatch) {
            const activityOutput = JSON.parse(outputMatch[1]);

            // Extract results - they might be in different places depending on activity type
            let results: any[] = [];
            if (activityOutput.value) {
              results = activityOutput.value;
            } else if (activityOutput.output?.value) {
              results = activityOutput.output.value;
            } else if (Array.isArray(activityOutput)) {
              results = activityOutput;
            }

            if (results.length === 0) {
              console.log('No results found in pipeline output');
              console.log('Raw output:', output);
              break;
            }

            // Analyze the fields
            const fields = analyzeQueryResults(results);

            // Get the SQL query from the pipeline
            const pipelineJson = readPipelineJson(config.pipeline.name, config);
            let sql = 'Unknown';
            if (pipelineJson.properties?.parameters?.SqlQuery?.defaultValue) {
              sql = pipelineJson.properties.parameters.SqlQuery.defaultValue;
            }

            // Save to project
            const savedQuery = mappingStorage.addQueryToProject(projectId, {
              name: queryName,
              sql,
              executedAt: new Date().toISOString(),
              rowCount: results.length,
              fields,
              results
            });

            if (savedQuery) {
              console.log(`\nQuery saved successfully!`);
              console.log(`Query ID: ${savedQuery.id}`);
              console.log(`Rows: ${results.length}`);
              console.log(`Fields: ${fields.map(f => f.name).join(', ')}`);
            } else {
              console.log('Failed to save query. Check project ID.');
            }
          } else {
            console.log('Could not parse results from pipeline output');
            console.log('Raw output:', output);
          }
        } catch (error: any) {
          console.log(`Error parsing results: ${error.message}`);
        }
      } else if (subCommand === 'list' && args[2]) {
        const project = mappingStorage.loadProject(args[2]);
        if (!project) {
          console.log('Project not found');
        } else {
          console.log(`Queries in ${project.name}:\n`);
          project.queries.forEach(q => {
            console.log(`  ID: ${q.id}`);
            console.log(`  Name: ${q.name}`);
            console.log(`  Rows: ${q.rowCount}`);
            console.log(`  Fields: ${q.fields.map(f => f.name).join(', ')}`);
            console.log(`  Executed: ${q.executedAt}`);
            console.log('');
          });
        }
      } else if (subCommand === 'show' && args[2] && args[3]) {
        const project = mappingStorage.loadProject(args[2]);
        if (!project) {
          console.log('Project not found');
        } else {
          const query = project.queries.find(q => q.id === args[3]);
          if (!query) {
            console.log('Query not found');
          } else {
            console.log(`Query: ${query.name}`);
            console.log(`ID: ${query.id}`);
            console.log(`SQL: ${query.sql}`);
            console.log(`Rows: ${query.rowCount}`);
            console.log(`\nFields:`);
            query.fields.forEach(f => {
              console.log(`  ${f.name}: ${f.type}${f.nullable ? ' (nullable)' : ''}`);
            });
            console.log(`\nSample Data (first 5 rows):`);
            console.log(JSON.stringify(query.results.slice(0, 5), null, 2));
          }
        }
      } else {
        console.log('Usage: sqlw query save <projectId> <name> <runId> | list <projectId> | show <projectId> <queryId>');
      }
      break;

    case 'mapping':
      if (subCommand === 'list-targets') {
        console.log('Available Business Central Target Entities:\n');
        mappingStorage.BC_TARGET_ENTITIES.forEach(e => {
          console.log(`  ${e.name} - ${e.displayName}`);
          console.log(`    Fields: ${e.fields.length}`);
          console.log(`    API: ${e.apiEndpoint}`);
          console.log('');
        });
      } else if (subCommand === 'show-target' && args[2]) {
        const entity = mappingStorage.getTargetEntity(args[2]);
        if (!entity) {
          console.log('Entity not found. Use "sqlw mapping list-targets" to see available entities.');
        } else {
          console.log(`Entity: ${entity.name} (${entity.displayName})`);
          console.log(`API: ${entity.apiEndpoint}`);
          console.log(`\nFields:`);
          entity.fields.forEach(f => {
            const req = f.required ? '*' : ' ';
            const len = f.maxLength ? `(${f.maxLength})` : '';
            console.log(`  ${req} ${f.name}: ${f.type}${len}`);
          });
          console.log('\n* = required field');
        }
      } else {
        console.log('Usage: sqlw mapping list-targets | show-target <entity>');
      }
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run "sqlw" without arguments for help');
  }
}

main().catch(console.error);
