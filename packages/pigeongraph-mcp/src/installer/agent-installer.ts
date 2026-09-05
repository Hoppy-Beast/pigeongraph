import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';

export interface InstallOptions {
  projectRoot?: string;
  claudeConfigPath?: string;
  cursorConfigPath?: string;
  commandOverride?: string;
  argsOverride?: string[];
}

export interface InstallResult {
  claudeUpdated: boolean;
  cursorUpdated: boolean;
  claudePath?: string;
  cursorPath?: string;
}

export interface UninstallResult {
  claudeUpdated: boolean;
  cursorUpdated: boolean;
  claudePath?: string;
  cursorPath?: string;
}

export interface InitResult {
  configPath: string;
  cursorMcpPath: string;
}

export class AgentInstaller {
  public static getClaudeConfigPath(): string {
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

  public static getCursorConfigPath(projectRoot = process.cwd()): string {
    return join(projectRoot, '.cursor', 'mcp.json');
  }

  public static installMcp(options: InstallOptions = {}): InstallResult {
    const projectRoot = options.projectRoot ?? process.cwd();
    const claudePath = options.claudeConfigPath ?? AgentInstaller.getClaudeConfigPath();
    const cursorPath = options.cursorConfigPath ?? AgentInstaller.getCursorConfigPath(projectRoot);

    const mcpEntry = {
      command: options.commandOverride ?? 'pigeongraph',
      args: options.argsOverride ?? ['serve-mcp'],
    };

    let claudeUpdated = false;
    let cursorUpdated = false;

    // Install Claude Desktop MCP
    try {
      mkdirSync(dirname(claudePath), { recursive: true });
      let claudeJson: Record<string, any> = { mcpServers: {} };
      if (existsSync(claudePath)) {
        try {
          claudeJson = JSON.parse(readFileSync(claudePath, 'utf-8'));
        } catch {
          claudeJson = { mcpServers: {} };
        }
      }
      if (!claudeJson.mcpServers || typeof claudeJson.mcpServers !== 'object') {
        claudeJson.mcpServers = {};
      }
      claudeJson.mcpServers.pigeongraph = mcpEntry;
      writeFileSync(claudePath, JSON.stringify(claudeJson, null, 2), 'utf-8');
      claudeUpdated = true;
    } catch {
      claudeUpdated = false;
    }

    // Install Cursor MCP
    try {
      mkdirSync(dirname(cursorPath), { recursive: true });
      let cursorJson: Record<string, any> = { mcpServers: {} };
      if (existsSync(cursorPath)) {
        try {
          cursorJson = JSON.parse(readFileSync(cursorPath, 'utf-8'));
        } catch {
          cursorJson = { mcpServers: {} };
        }
      }
      if (!cursorJson.mcpServers || typeof cursorJson.mcpServers !== 'object') {
        cursorJson.mcpServers = {};
      }
      cursorJson.mcpServers.pigeongraph = mcpEntry;
      writeFileSync(cursorPath, JSON.stringify(cursorJson, null, 2), 'utf-8');
      cursorUpdated = true;
    } catch {
      cursorUpdated = false;
    }

    return {
      claudeUpdated,
      cursorUpdated,
      claudePath,
      cursorPath,
    };
  }

  public static uninstallMcp(options: InstallOptions = {}): UninstallResult {
    const projectRoot = options.projectRoot ?? process.cwd();
    const claudePath = options.claudeConfigPath ?? AgentInstaller.getClaudeConfigPath();
    const cursorPath = options.cursorConfigPath ?? AgentInstaller.getCursorConfigPath(projectRoot);

    let claudeUpdated = false;
    let cursorUpdated = false;

    // Uninstall from Claude Desktop
    if (existsSync(claudePath)) {
      try {
        const claudeJson = JSON.parse(readFileSync(claudePath, 'utf-8'));
        if (claudeJson.mcpServers && claudeJson.mcpServers.pigeongraph) {
          delete claudeJson.mcpServers.pigeongraph;
          writeFileSync(claudePath, JSON.stringify(claudeJson, null, 2), 'utf-8');
          claudeUpdated = true;
        }
      } catch {
        claudeUpdated = false;
      }
    }

    // Uninstall from Cursor
    if (existsSync(cursorPath)) {
      try {
        const cursorJson = JSON.parse(readFileSync(cursorPath, 'utf-8'));
        if (cursorJson.mcpServers && cursorJson.mcpServers.pigeongraph) {
          delete cursorJson.mcpServers.pigeongraph;
          writeFileSync(cursorPath, JSON.stringify(cursorJson, null, 2), 'utf-8');
          cursorUpdated = true;
        }
      } catch {
        cursorUpdated = false;
      }
    }

    return {
      claudeUpdated,
      cursorUpdated,
      claudePath,
      cursorPath,
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
        excludedDirs: ['node_modules', 'dist', 'build', '.git'],
      };
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }

    const cursorDir = join(projectRoot, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    const cursorMcpPath = join(cursorDir, 'mcp.json');

    if (!existsSync(cursorMcpPath)) {
      const cursorConfig = {
        mcpServers: {
          pigeongraph: {
            command: 'pigeongraph',
            args: ['serve-mcp'],
          },
        },
      };
      writeFileSync(cursorMcpPath, JSON.stringify(cursorConfig, null, 2), 'utf-8');
    }

    return {
      configPath,
      cursorMcpPath,
    };
  }
}
