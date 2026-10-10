import { AstExtractor } from '@pigeongraph/substrate';
import type { ClientGraphStore } from '@pigeongraph/client';
import type { SuperNode } from '@pigeongraph/schema';

export interface ChangedFileSpec {
  filePath: string;
  oldContent: string;
  newContent: string;
}

export interface SymbolAuditDetail {
  symbolName: string;
  qualifiedName: string;
  filePath: string;
  kind: string;
  changeCategory: 'SAFE_INTERNAL_REFACTOR' | 'BREAKING_INTERFACE_CHANGE' | 'NEW_SYMBOL' | 'DELETED_SYMBOL';
  blastRadiusFiles: number;
  blastRadiusSymbols: number;
  summary: string;
  testOnly?: boolean;
}

export interface PrAuditOptions {
  store?: ClientGraphStore;
  extractor?: AstExtractor;
}

export interface AuditFilesInput {
  repoId: string;
  changedFiles: ChangedFileSpec[];
}

export interface PrAuditResult {
  totalFilesChanged: number;
  safeInternalRefactors: number;
  breakingInterfaceChanges: number;
  newSymbols: number;
  deletedSymbols: number;
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: SymbolAuditDetail[];
  markdownReport: string;
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note' | 'none';
  message: { text: string };
  locations: Array<{
    physicalLocation: { artifactLocation: { uri: string } };
  }>;
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: SarifResult['level'] };
}

export interface SarifLog {
  version: '2.1.0';
  $schema: string;
  runs: Array<{
    tool: { driver: { name: string; version: string; rules: SarifRule[] } };
    results: SarifResult[];
  }>;
}

/** True for test-only files: __tests__ dirs, .test./.spec. infixes, test(s)/ dirs. */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('__tests__') ||
    normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    normalized.includes('/test/') ||
    normalized.startsWith('test/') ||
    normalized.includes('/tests/') ||
    normalized.startsWith('tests/')
  );
}

const SARIF_RULES: SarifRule[] = [
  {
    id: 'BREAKING_INTERFACE_CHANGE',
    name: 'BreakingInterfaceChange',
    shortDescription: { text: 'Public symbol signature changed in a breaking way' },
    defaultConfiguration: { level: 'error' },
  },
  {
    id: 'DELETED_SYMBOL',
    name: 'DeletedSymbol',
    shortDescription: { text: 'Public symbol removed from the module interface' },
    defaultConfiguration: { level: 'error' },
  },
  {
    id: 'NEW_SYMBOL',
    name: 'NewSymbol',
    shortDescription: { text: 'Newly added symbol declaration' },
    defaultConfiguration: { level: 'warning' },
  },
];

/**
 * Pure SARIF 2.1.0 builder: one result per breaking/deleted finding
 * (level error) plus one per new symbol (level warning). Safe internal
 * refactors are not findings and are omitted. Deterministic, no I/O.
 */
export function buildSarif(result: PrAuditResult): SarifLog {
  const results: SarifResult[] = [];
  for (const d of result.details) {
    if (d.changeCategory === 'SAFE_INTERNAL_REFACTOR') continue;
    results.push({
      ruleId: d.changeCategory,
      level: d.changeCategory === 'NEW_SYMBOL' ? 'warning' : 'error',
      message: { text: `${d.qualifiedName}: ${d.summary}` },
      locations: [
        {
          physicalLocation: { artifactLocation: { uri: d.filePath } },
        },
      ],
    });
  }
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'PigeonGraph PR Audit',
            version: '1.0.0',
            rules: SARIF_RULES,
          },
        },
        results,
      },
    ],
  };
}

export class PrAuditor {
  private store: ClientGraphStore | undefined;
  private extractor: AstExtractor;

  constructor(options?: PrAuditOptions) {
    this.store = options?.store;
    this.extractor = options?.extractor ?? new AstExtractor();
  }

  public auditFiles(input: AuditFilesInput): PrAuditResult {
    const details: SymbolAuditDetail[] = [];
    let safeInternalRefactors = 0;
    let breakingInterfaceChanges = 0;
    let newSymbols = 0;
    let deletedSymbols = 0;

    for (const file of input.changedFiles) {
      const testOnly = isTestFile(file.filePath);
      const prefix = testOnly ? '[test-only] ' : '';
      const oldParse = this.extractor.parseFile({
        repoId: input.repoId,
        filePath: file.filePath,
        content: file.oldContent,
        epoch: 1,
        lamportClock: 1,
      });

      const newParse = this.extractor.parseFile({
        repoId: input.repoId,
        filePath: file.filePath,
        content: file.newContent,
        epoch: 2,
        lamportClock: 2,
      });

      const oldNodes = oldParse.nodes.filter((n) => n.kind !== 'file');
      const newNodes = newParse.nodes.filter((n) => n.kind !== 'file');

      // Check modified and new symbols
      for (const newNode of newNodes) {
        const oldNode = oldNodes.find((o) => o.qualifiedName === newNode.qualifiedName);
        if (!oldNode) {
          newSymbols++;
          details.push({
            symbolName: newNode.name,
            qualifiedName: newNode.qualifiedName,
            filePath: file.filePath,
            kind: newNode.kind,
            changeCategory: 'NEW_SYMBOL',
            blastRadiusFiles: 0,
            blastRadiusSymbols: 0,
            summary: `${prefix}Newly added symbol declaration`,
            testOnly,
          });
          continue;
        }

        // Check if content changed
        if (oldNode.versioning.contentSha256 !== newNode.versioning.contentSha256) {
          // Check if semantic invariant hash is identical
          if (oldNode.versioning.semanticValidityHash === newNode.versioning.semanticValidityHash) {
            safeInternalRefactors++;
            details.push({
              symbolName: newNode.name,
              qualifiedName: newNode.qualifiedName,
              filePath: file.filePath,
              kind: newNode.kind,
              changeCategory: 'SAFE_INTERNAL_REFACTOR',
              blastRadiusFiles: 0,
              blastRadiusSymbols: 0,
              summary: `${prefix}Safe internal refactor: public signature unchanged, 0 external blast radius.`,
              testOnly,
            });
          } else {
            breakingInterfaceChanges++;
            let blastRadiusSymbols = 0;
            let blastRadiusFiles = 0;

            if (this.store) {
              const blast = this.store.bfsBlastRadius(newNode.id, 3);
              blastRadiusSymbols = blast.nodes.length;
              blastRadiusFiles = new Set(blast.nodes.map((n) => n.substrate.sourceLocation.filePath)).size;
            }

            details.push({
              symbolName: newNode.name,
              qualifiedName: newNode.qualifiedName,
              filePath: file.filePath,
              kind: newNode.kind,
              changeCategory: 'BREAKING_INTERFACE_CHANGE',
              blastRadiusFiles,
              blastRadiusSymbols,
              summary: `${prefix}Signature Changed: ${newNode.substrate.symbolSignature ?? 'interface modified'}`,
              testOnly,
            });
          }
        }
      }

      // Check deleted symbols
      for (const oldNode of oldNodes) {
        const stillExists = newNodes.some((n) => n.qualifiedName === oldNode.qualifiedName);
        if (!stillExists) {
          deletedSymbols++;
          let blastRadiusSymbols = 0;
          let blastRadiusFiles = 0;

          if (this.store) {
            const blast = this.store.bfsBlastRadius(oldNode.id, 3);
            blastRadiusSymbols = blast.nodes.length;
            blastRadiusFiles = new Set(blast.nodes.map((n) => n.substrate.sourceLocation.filePath)).size;
          }

          details.push({
            symbolName: oldNode.name,
            qualifiedName: oldNode.qualifiedName,
            filePath: file.filePath,
            kind: oldNode.kind,
            changeCategory: 'DELETED_SYMBOL',
            blastRadiusFiles,
            blastRadiusSymbols,
            summary: `${prefix}Symbol removed from public module interface`,
            testOnly,
          });
        }
      }
    }

    // Determine overall risk. CRITICAL when the blast is clearly release-blocking:
    // >=3 breaking changes, >=2 deletions, or any breaking change fanning out
    // to >=5 downstream files. HIGH for >=2 breaking changes or a deletion
    // with downstream blast; otherwise MEDIUM when anything broke, else LOW.
    const totalBlastFiles = details.reduce(
      (sum, d) =>
        sum +
        (d.changeCategory === 'BREAKING_INTERFACE_CHANGE' || d.changeCategory === 'DELETED_SYMBOL'
          ? d.blastRadiusFiles
          : 0),
      0
    );
    let overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (
      breakingInterfaceChanges >= 3 ||
      deletedSymbols >= 2 ||
      (breakingInterfaceChanges >= 1 && totalBlastFiles >= 5)
    ) {
      overallRiskLevel = 'CRITICAL';
    } else if (breakingInterfaceChanges >= 2 || (deletedSymbols >= 1 && totalBlastFiles > 0)) {
      overallRiskLevel = 'HIGH';
    } else if (breakingInterfaceChanges > 0 || deletedSymbols > 0) {
      overallRiskLevel = 'MEDIUM';
    }

    const markdownReport = this.generateMarkdownReport({
      totalFilesChanged: input.changedFiles.length,
      safeInternalRefactors,
      breakingInterfaceChanges,
      newSymbols,
      deletedSymbols,
      overallRiskLevel,
      details,
    });

    return {
      totalFilesChanged: input.changedFiles.length,
      safeInternalRefactors,
      breakingInterfaceChanges,
      newSymbols,
      deletedSymbols,
      overallRiskLevel,
      details,
      markdownReport,
    };
  }

  private generateMarkdownReport(data: {
    totalFilesChanged: number;
    safeInternalRefactors: number;
    breakingInterfaceChanges: number;
    newSymbols: number;
    deletedSymbols: number;
    overallRiskLevel: string;
    details: SymbolAuditDetail[];
  }): string {
    const riskBadge =
      data.overallRiskLevel === 'LOW'
        ? '🟢 **LOW**'
        : data.overallRiskLevel === 'MEDIUM'
        ? '🟡 **MEDIUM**'
        : data.overallRiskLevel === 'HIGH'
        ? '🔴 **HIGH**'
        : '🚨 **CRITICAL**';

    let tableRows = '';
    for (const d of data.details) {
      const typeBadge =
        d.changeCategory === 'SAFE_INTERNAL_REFACTOR'
          ? '⚡ **Safe Internal Refactor**'
          : d.changeCategory === 'BREAKING_INTERFACE_CHANGE'
          ? '⚠️ **Signature Changed**'
          : d.changeCategory === 'DELETED_SYMBOL'
          ? '❌ **Deleted Symbol**'
          : '✨ **New Symbol**';

      const blast = d.blastRadiusFiles > 0 ? `${d.blastRadiusFiles} files (${d.blastRadiusSymbols} symbols)` : '0 files';
      const testBadge = d.testOnly ? '🧪 test-only' : '—';
      tableRows += `| \`${d.qualifiedName}\` | \`${d.filePath}\` | ${typeBadge} | ${blast} | ${testBadge} | ${d.summary} |\n`;
    }

    return `### 🐦 PigeonGraph PR Blast Radius Audit

| Overall Risk | Changed Files | Breaking Interfaces | Internal Refactors |
| :---: | :---: | :---: | :---: |
| ${riskBadge} | **${data.totalFilesChanged}** | **${data.breakingInterfaceChanges}** | **${data.safeInternalRefactors}** |

#### Symbol Impact Breakdown
| Symbol | File | Change Type | Blast Radius | Test | Downstream Impact |
| :--- | :--- | :---: | :---: | :---: | :--- |
${tableRows || '| - | - | No symbol changes detected | 0 files | — | - |\n'}
> **PigeonGraph Invariant Hash (H_semantic_inv)** differentiates pure internal refactors from breaking signature alterations at zero token cost.
`;
  }
}
