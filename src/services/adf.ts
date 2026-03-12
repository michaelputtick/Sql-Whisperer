import { DataFactoryManagementClient } from '@azure/arm-datafactory';
import { DefaultAzureCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';
import { configService, AppConfig } from './config';

export interface PipelineRunResult {
  runId: string;
  status: string;
  message?: string;
  output?: any;
}

export class ADFService {
  private client: DataFactoryManagementClient | null = null;
  private config: AppConfig;

  constructor() {
    this.config = configService.get();
  }

  async connect(): Promise<boolean> {
    try {
      this.config = configService.get();

      if (!this.config.azure.subscriptionId) {
        throw new Error('Azure subscription ID not configured');
      }

      const credential = new DefaultAzureCredential();
      this.client = new DataFactoryManagementClient(credential, this.config.azure.subscriptionId);
      return true;
    } catch (error) {
      console.error('Failed to connect to ADF:', error);
      return false;
    }
  }

  async listPipelines(): Promise<string[]> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Not connected to ADF');
    }

    const pipelines: string[] = [];
    const iterator = this.client.pipelines.listByFactory(
      this.config.azure.resourceGroup,
      this.config.azure.factoryName
    );

    for await (const pipeline of iterator) {
      if (pipeline.name) {
        pipelines.push(pipeline.name);
      }
    }

    return pipelines;
  }

  async runPipeline(pipelineName: string, parameters?: Record<string, any>): Promise<PipelineRunResult> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Not connected to ADF');
    }

    try {
      const runResponse = await this.client.pipelines.createRun(
        this.config.azure.resourceGroup,
        this.config.azure.factoryName,
        pipelineName,
        { parameters }
      );

      return {
        runId: runResponse.runId || '',
        status: 'Queued',
        message: `Pipeline ${pipelineName} started with run ID: ${runResponse.runId}`,
      };
    } catch (error: any) {
      return {
        runId: '',
        status: 'Failed',
        message: error.message,
      };
    }
  }

  async getPipelineRunStatus(runId: string): Promise<PipelineRunResult> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Not connected to ADF');
    }

    try {
      const run = await this.client.pipelineRuns.get(
        this.config.azure.resourceGroup,
        this.config.azure.factoryName,
        runId
      );

      return {
        runId,
        status: run.status || 'Unknown',
        message: run.message,
        output: run.output,
      };
    } catch (error: any) {
      return {
        runId,
        status: 'Error',
        message: error.message,
      };
    }
  }

  async getRecentRuns(pipelineName?: string, count: number = 10): Promise<any[]> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Not connected to ADF');
    }

    try {
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

      const response = await this.client.pipelineRuns.queryByFactory(
        this.config.azure.resourceGroup,
        this.config.azure.factoryName,
        filterParams
      );

      const runs = response.value || [];
      // Sort by run start time descending and take the requested count
      return runs
        .sort((a, b) => {
          const dateA = a.runStart ? new Date(a.runStart).getTime() : 0;
          const dateB = b.runStart ? new Date(b.runStart).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, count);
    } catch (error: any) {
      console.error('Error getting recent runs:', error.message);
      return [];
    }
  }

  async waitForPipelineCompletion(runId: string, timeoutMinutes: number = 5): Promise<PipelineRunResult> {
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getPipelineRunStatus(runId);

      if (['Succeeded', 'Failed', 'Cancelled'].includes(result.status)) {
        return result;
      }

      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return {
      runId,
      status: 'Timeout',
      message: `Pipeline run timed out after ${timeoutMinutes} minutes`,
    };
  }

  // Read pipeline JSON from local ADF repo
  readPipelineJson(pipelineName: string): any {
    const pipelinePath = path.join(
      this.config.paths.adfRepoPath,
      'pipeline',
      `${pipelineName}.json`
    );

    if (!fs.existsSync(pipelinePath)) {
      throw new Error(`Pipeline file not found: ${pipelinePath}`);
    }

    return JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
  }

  // Write pipeline JSON to local ADF repo
  writePipelineJson(pipelineName: string, pipelineJson: any): void {
    const pipelinePath = path.join(
      this.config.paths.adfRepoPath,
      'pipeline',
      `${pipelineName}.json`
    );

    fs.writeFileSync(pipelinePath, JSON.stringify(pipelineJson, null, 2));
  }

  // Update SQL query in the SQLWhisperer pipeline
  updateSqlQuery(query: string): void {
    const pipeline = this.readPipelineJson(this.config.pipeline.name);

    // Find the copy activity and update the query
    // This depends on your pipeline structure
    if (pipeline.properties && pipeline.properties.activities) {
      for (const activity of pipeline.properties.activities) {
        if (activity.type === 'Copy' && activity.typeProperties?.source) {
          activity.typeProperties.source.sqlReaderQuery = query;
          break;
        }
      }
    }

    this.writePipelineJson(this.config.pipeline.name, pipeline);
  }

  // Read results from the configured results path
  readResults(filename: string = 'results.json'): any {
    const resultsPath = path.join(this.config.paths.resultsPath, filename);

    if (!fs.existsSync(resultsPath)) {
      return null;
    }

    const content = fs.readFileSync(resultsPath, 'utf-8');

    // Try to parse as JSON, otherwise return as text
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
}

export const adfService = new ADFService();
