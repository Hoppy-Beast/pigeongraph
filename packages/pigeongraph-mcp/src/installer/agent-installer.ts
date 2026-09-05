import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

export interface InstallOptions {
  projectRoot?: string;
  claudeConfigPath?: string;
  cursorConfigPath?: string;
  antigravityConfigPath?: string;
  geminiConfigPath?: string;
  claudeCodeConfigPath?: string;
  commandOverride?: string;
  argsOverride?: string[];
  mode?: 'auto' | 'absolute' | 'global' | 'npx';
  target?: 'all' | 'claude' | 'cursor' | 'antigravity' | 'gemini';
}

export interface TargetUpdateResult {
  name: string;
  updated: boolean;
  path: string;
  details?: string;
}

export interface InstallResult {
  success: boolean;
  commandUsed: string;
  argsUsed: string[];
  targets: TargetUpdateResult[];
}

export interface UninstallResult {
  success: boolean;
  targets: TargetUpdateResult[];
}

export interface InitResult {
  configPath: string;
  cursorMcpPath: string;
  claudeCodeMcpPath: string;
}

export class AgentInstaller {
  public static resolveCliPath(): string {
    // Determine the absolute path to cli.js
    const currentScript = process.argv[1] ? resolve(process.argv[1]) : '';
    if (currentScript && currentScript.endsWith('.js') && existsSync(currentScript)) {
      return currentScript;
    }
    // Fallback relative to module
    try {
      const { fileURLToPath } = require('node:url');
      const modulePath = fileURLToPath(import.meta.url);
      const cliPath = resolve(dirname(modulePath), '..', 'cli.js');
      if (existsSync(cliPath)) return cliPath;
    } catch {
      // ignore
    }
    return '';
  }

  public static isGlobalBinaryAvailable(): boolean {
    const isWin = platform() === 'win32';
    try {
      const probe = isWin ? 'where.exe pigeongraph' : 'which pigeongraph';
      execSync(probe, { stdio: ['ignore', 'ignore', 'ignore'] });
      return true;
    } catch {
      return false;
    }
  }

  public static resolveCommand(mode: 'auto' | 'absolute' | 'global' | 'npx' = 'auto'): { command: string; args: string[] } {
    if (mode === 'npx') {
      return { command: 'npx', args: ['-y', 'pigeongraph', 'serve-mcp'] };
    }

    if (mode === 'global' || (mode === 'auto' && platform() !== 'darwin' && AgentInstaller.isGlobalBinaryAvailable())) {
      return { command: 'pigeongraph', args: ['serve-mcp'] };
    }

    // Default to absolute node path for GUI apps (prevents ENOENT / command not found)
    const cliPath = AgentInstaller.resolveCliPath();
    if (cliPath) {
      return { command: process.execPath, args: [cliPath, 'serve-mcp'] };
    }

    // Safe fallback
    return { command: 'pigeongraph', args: ['serve-mcp'] };
  }

  public static getClaudeDesktopConfigPath(): string {
    const osPlatform = platform();
    const home = homedir();

    if (osPlatform === 'win32') {
      const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
      return join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (osPlatform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      return join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }
  }

  public static getClaudeCodeUserConfigPath(): string {
    return join(homedir(), '.claude.json');
  }

  public static getClaudeCodeProjectMcpPath(projectRoot = process.cwd()): string {
    return join(projectRoot, '.mcp.json');
  }

  public static getClaudeSettingsPath(scope: 'global' | 'local' = 'global', projectRoot = process.cwd()): string {
    return scope === 'global'
      ? join(homedir(), '.claude', 'settings.json')
      : join(projectRoot, '.claude', 'settings.json');
  }

  public static getCursorConfigPath(projectRoot = process.cwd()): string {
    return join(projectRoot, '.cursor', 'mcp.json');
  }

  public static getAntigravityConfigPath(): string {
    const home = homedir();
    const unifiedMarker = join(home, '.gemini', 'config', '.migrated');
    if (existsSync(unifiedMarker)) {
      return join(home, '.gemini', 'config', 'mcp_config.json');
    }
    return join(home, '.gemini', 'antigravity', 'mcp_config.json');
  }

  public static getGeminiCliConfigPath(): string {
    return join(homedir(), '.gemini', 'settings.json');
  }

  private static safeReadJson(filePath: string): Record<string, any> {
    if (!existsSync(filePath)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      try {
        copyFileSync(filePath, `${filePath}.backup`);
      } catch {
        // ignore
      }
      return {};
    }
  }

  private static safeWriteJson(filePath: string, data: any): boolean {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  public static installMcp(options: InstallOptions = {}): InstallResult {
    const projectRoot = options.projectRoot ?? process.cwd();
    const mode = options.mode ?? 'auto';
    const resolved = AgentInstaller.resolveCommand(mode);

    const mcpEntry = {
      command: options.commandOverride ?? resolved.command,
      args: options.argsOverride ?? resolved.args,
    };

    const targetFilter = options.target ?? 'all';
    const targets: TargetUpdateResult[] = [];

    // 1. Claude Desktop
    if (targetFilter === 'all' || targetFilter === 'claude') {
      const path = options.claudeConfigPath ?? AgentInstaller.getClaudeDesktopConfigPath();
      const json = AgentInstaller.safeReadJson(path);
      json.mcpServers = json.mcpServers || {};
      json.mcpServers.pigeongraph = mcpEntry;
      const ok = AgentInstaller.safeWriteJson(path, json);
      targets.push({ name: 'Claude Desktop', updated: ok, path });
    }

    // 2. Cursor (Project-local .cursor/mcp.json)
    if (targetFilter === 'all' || targetFilter === 'cursor') {
      const path = options.cursorConfigPath ?? AgentInstaller.getCursorConfigPath(projectRoot);
      const json = AgentInstaller.safeReadJson(path);
      json.mcpServers = json.mcpServers || {};
      json.mcpServers.pigeongraph = mcpEntry;
      const ok = AgentInstaller.safeWriteJson(path, json);
      targets.push({ name: 'Cursor (.cursor/mcp.json)', updated: ok, path });
    }

    // 3. Claude Code (Project-local .mcp.json + auto-allow permissions)
    if (targetFilter === 'all' || targetFilter === 'claude') {
      const mcpPath = options.claudeCodeConfigPath ?? AgentInstaller.getClaudeCodeProjectMcpPath(projectRoot);
      const json = AgentInstaller.safeReadJson(mcpPath);
      json.mcpServers = json.mcpServers || {};
      json.mcpServers.pigeongraph = mcpEntry;
      const okMcp = AgentInstaller.safeWriteJson(mcpPath, json);
      targets.push({ name: 'Claude Code (.mcp.json)', updated: okMcp, path: mcpPath });

      // Auto-allow permissions
      const settingsPath = AgentInstaller.getClaudeSettingsPath('local', projectRoot);
      const settingsJson = AgentInstaller.safeReadJson(settingsPath);
      settingsJson.permissions = settingsJson.permissions || {};
      settingsJson.permissions.allow = settingsJson.permissions.allow || [];
      if (!settingsJson.permissions.allow.includes('mcp__pigeongraph__*')) {
        settingsJson.permissions.allow.push('mcp__pigeongraph__*');
        AgentInstaller.safeWriteJson(settingsPath, settingsJson);
      }
    }

    // 4. Google Antigravity
    if (targetFilter === 'all' || targetFilter === 'antigravity') {
      const path = options.antigravityConfigPath ?? AgentInstaller.getAntigravityConfigPath();
      const json = AgentInstaller.safeReadJson(path);
      json.mcpServers = json.mcpServers || {};
      json.mcpServers.pigeongraph = mcpEntry;
      const ok = AgentInstaller.safeWriteJson(path, json);
      targets.push({ name: 'Google Antigravity', updated: ok, path });
    }

    // 5. Gemini CLI
    if (targetFilter === 'all' || targetFilter === 'gemini') {
      const path = options.geminiConfigPath ?? AgentInstaller.getGeminiCliConfigPath();
      const json = AgentInstaller.safeReadJson(path);
      json.mcpServers = json.mcpServers || {};
      json.mcpServers.pigeongraph = mcpEntry;
      const ok = AgentInstaller.safeWriteJson(path, json);
      targets.push({ name: 'Gemini CLI', updated: ok, path });
    }

    const success = targets.some((t) => t.updated);
    return {
      success,
      commandUsed: mcpEntry.command,
      argsUsed: mcpEntry.args,
      targets,
    };
  }

  public static uninstallMcp(options: InstallOptions = {}): UninstallResult {
    const projectRoot = options.projectRoot ?? process.cwd();
    const targetFilter = options.target ?? 'all';
    const targets: TargetUpdateResult[] = [];

    const removeEntry = (name: string, path: string) => {
      if (!existsSync(path)) {
        targets.push({ name, updated: false, path, details: 'File does not exist' });
        return;
      }
      try {
        const json = AgentInstaller.safeReadJson(path);
        if (json.mcpServers && json.mcpServers.pigeongraph) {
          delete json.mcpServers.pigeongraph;
          const ok = AgentInstaller.safeWriteJson(path, json);
          targets.push({ name, updated: ok, path });
        } else {
          targets.push({ name, updated: false, path, details: 'Entry not present' });
        }
      } catch {
        targets.push({ name, updated: false, path, details: 'Failed to parse/write' });
      }
    };

    if (targetFilter === 'all' || targetFilter === 'claude') {
      removeEntry('Claude Desktop', options.claudeConfigPath ?? AgentInstaller.getClaudeDesktopConfigPath());
      removeEntry('Claude Code (.mcp.json)', options.claudeCodeConfigPath ?? AgentInstaller.getClaudeCodeProjectMcpPath(projectRoot));
    }

    if (targetFilter === 'all' || targetFilter === 'cursor') {
      removeEntry('Cursor', options.cursorConfigPath ?? AgentInstaller.getCursorConfigPath(projectRoot));
    }

    if (targetFilter === 'all' || targetFilter === 'antigravity') {
      removeEntry('Google Antigravity', options.antigravityConfigPath ?? AgentInstaller.getAntigravityConfigPath());
    }

    if (targetFilter === 'all' || targetFilter === 'gemini') {
      removeEntry('Gemini CLI', options.geminiConfigPath ?? AgentInstaller.getGeminiCliConfigPath());
    }

    const success = targets.some((t) => t.updated);
    return {
      success,
      targets,
    };
  }

  public static initProject(projectRoot = process.cwd()): InitResult {
    const pigeongraphDir = join(projectRoot, '.pigeongraph');
    mkdirSync(pigeongraphDir, { recursive: true });

    const configPath = join(pigeongraphDir, 'config.json');
    if (!existsSync(configPath)) {
      const defaultConfig = {
        version: '1.0.0',
        wsPort: 5051,
        uiPort: 5052,
        loneDebounceMs: 150,
        burstDebounceMs: 1500,
        excludedDirs: ['node_modules', 'dist', 'build', '.git', 'eval-sandbox'],
      };
      AgentInstaller.safeWriteJson(configPath, defaultConfig);
    }

    const cursorMcpPath = AgentInstaller.getCursorConfigPath(projectRoot);
    if (!existsSync(cursorMcpPath)) {
      const cursorConfig = {
        mcpServers: {
          pigeongraph: {
            command: 'pigeongraph',
            args: ['serve-mcp'],
          },
        },
      };
      AgentInstaller.safeWriteJson(cursorMcpPath, cursorConfig);
    }

    const claudeCodeMcpPath = AgentInstaller.getClaudeCodeProjectMcpPath(projectRoot);
    if (!existsSync(claudeCodeMcpPath)) {
      const claudeCodeConfig = {
        mcpServers: {
          pigeongraph: {
            command: 'pigeongraph',
            args: ['serve-mcp'],
          },
        },
      };
      AgentInstaller.safeWriteJson(claudeCodeMcpPath, claudeCodeConfig);
    }

    return {
      configPath,
      cursorMcpPath,
      claudeCodeMcpPath,
    };
  }
}
