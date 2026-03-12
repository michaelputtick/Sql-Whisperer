import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AppConfig {
  azure: {
    subscriptionId: string;
    resourceGroup: string;
    factoryName: string;
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

const CONFIG_DIR = path.join(os.homedir(), '.sqlwhisperer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  azure: {
    subscriptionId: '',
    resourceGroup: '',
    factoryName: '',
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

export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }

    return { ...DEFAULT_CONFIG };
  }

  save(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  get(): AppConfig {
    return this.config;
  }

  set(config: Partial<AppConfig>): void {
    this.config = { ...this.config, ...config };
    this.save();
  }

  setAzure(azure: Partial<AppConfig['azure']>): void {
    this.config.azure = { ...this.config.azure, ...azure };
    this.save();
  }

  setPaths(paths: Partial<AppConfig['paths']>): void {
    this.config.paths = { ...this.config.paths, ...paths };
    this.save();
  }
}

export const configService = new ConfigService();
