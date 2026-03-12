import { exec } from 'child_process';
import { promisify } from 'util';
import { configService } from './config';

const execAsync = promisify(exec);

export interface GitResult {
  success: boolean;
  message: string;
  output?: string;
}

export class GitService {
  async status(repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    try {
      const { stdout } = await execAsync('git status --short', { cwd: path });
      return {
        success: true,
        message: stdout || 'No changes',
        output: stdout,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async add(files: string = '.', repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    try {
      await execAsync(`git add ${files}`, { cwd: path });
      return {
        success: true,
        message: `Added ${files} to staging`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async commit(message: string, repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    try {
      const { stdout } = await execAsync(`git commit -m "${message}"`, { cwd: path });
      return {
        success: true,
        message: 'Committed successfully',
        output: stdout,
      };
    } catch (error: any) {
      // Check if it's just "nothing to commit"
      if (error.message.includes('nothing to commit')) {
        return {
          success: true,
          message: 'Nothing to commit',
        };
      }
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async push(repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    try {
      const { stdout } = await execAsync('git push', { cwd: path });
      return {
        success: true,
        message: 'Pushed successfully',
        output: stdout,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async pull(repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    try {
      const { stdout } = await execAsync('git pull', { cwd: path });
      return {
        success: true,
        message: 'Pulled successfully',
        output: stdout,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async addCommitPush(message: string, repoPath?: string): Promise<GitResult> {
    const path = repoPath || configService.get().paths.adfRepoPath;

    const addResult = await this.add('.', path);
    if (!addResult.success) return addResult;

    const commitResult = await this.commit(message, path);
    if (!commitResult.success && commitResult.message !== 'Nothing to commit') {
      return commitResult;
    }

    if (commitResult.message === 'Nothing to commit') {
      return commitResult;
    }

    return await this.push(path);
  }
}

export const gitService = new GitService();
