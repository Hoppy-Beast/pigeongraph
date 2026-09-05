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
            summary: 'Newly added symbol declaration',
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
              summary: 'Safe internal refactor: public signature unchanged, 0 external blast radius.',
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
              summary: `Signature Changed: ${newNode.substrate.symbolSignature ?? 'interface modified'}`,
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
            summary: 'Symbol removed from public module interface',
          });
        }
      }
    }

    // Determine overall risk
    let overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (breakingInterfaceChanges >= 3 || deletedSymbols >= 2) {
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
      tableRows += `| \`${d.qualifiedName}\` | \`${d.filePath}\` | ${typeBadge} | ${blast} | ${d.summary} |\n`;
    }

    return `### 🐦 PigeonGraph PR Blast Radius Audit

| Overall Risk | Changed Files | Breaking Interfaces | Internal Refactors |
| :---: | :---: | :---: | :---: |
| ${riskBadge} | **${data.totalFilesChanged}** | **${data.breakingInterfaceChanges}** | **${data.safeInternalRefactors}** |

#### Symbol Impact Breakdown
| Symbol | File | Change Type | Blast Radius | Downstream Impact |
| :--- | :--- | :---: | :---: | :--- |
${tableRows || '| - | - | No symbol changes detected | 0 files | - |\n'}
> **PigeonGraph Invariant Hash (H_semantic_inv)** differentiates pure internal refactors from breaking signature alterations at zero token cost.
`;
  }
}
