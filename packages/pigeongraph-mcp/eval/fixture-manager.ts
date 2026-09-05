import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FixtureManagerOptions {
  baseDir?: string;
}

export interface ResolveRepoOptions {
  gitUrl?: string;
  localPath?: string;
}

export class FixtureManager {
  private baseDir: string;

  constructor(options: FixtureManagerOptions = {}) {
    this.baseDir = options.baseDir ?? resolve('eval-sandbox', 'repos');
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async resolveRepo(repoId: string, options: ResolveRepoOptions = {}): Promise<string> {
    if (options.localPath && existsSync(options.localPath)) {
      return options.localPath;
    }

    const targetDir = join(this.baseDir, repoId);
    if (existsSync(targetDir)) {
      return targetDir;
    }

    if (options.gitUrl) {
      mkdirSync(this.baseDir, { recursive: true });
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', options.gitUrl, targetDir]);
        return targetDir;
      } catch (err) {
        throw new Error(`Failed to clone fixture repository ${repoId} from ${options.gitUrl}: ${(err as Error).message}`);
      }
    }

    throw new Error(`Repo fixture '${repoId}' not found and no valid gitUrl provided.`);
  }

  public async createSyntheticFixture(name: string, files: Record<string, string>): Promise<string> {
    const fixtureDir = join(this.baseDir, name);
    mkdirSync(fixtureDir, { recursive: true });

    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = join(fixtureDir, relPath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }

    return fixtureDir;
  }
}
