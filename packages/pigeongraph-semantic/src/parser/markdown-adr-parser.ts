import type { AdrReference, RationaleNode, MultimodalAssociation } from '@pigeongraph/schema';

export interface ParsedDocResult {
  docUri: string;
  title: string;
  adr?: AdrReference;
  rationaleNodes: RationaleNode[];
  requirements: Array<{ id: string; title: string; description: string; line: number }>;
  association: MultimodalAssociation;
}

export class MarkdownAdrParser {
  public parseDocument(filePath: string, content: string): ParsedDocResult {
    const lines = content.split(/\r?\n/);
    const title = this.extractTitle(lines, filePath);
    const isAdr = filePath.toLowerCase().includes('adr') || filePath.toLowerCase().includes('decision');

    const adr = isAdr ? this.extractAdr(filePath, title, lines, content) : undefined;
    const rationaleNodes = this.extractRationale(lines);
    const requirements = this.extractRequirements(lines);

    const association: MultimodalAssociation = {
      assetType: isAdr ? 'rfc_adr' : 'markdown_doc',
      uri: filePath,
      title,
      relevanceScore: isAdr ? 0.95 : 0.8,
      extractedSnippet: lines.slice(0, 8).join('\n'),
    };

    return {
      docUri: filePath,
      title,
      adr,
      rationaleNodes,
      requirements,
      association,
    };
  }

  private extractTitle(lines: string[], defaultName: string): string {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim();
      }
    }
    return defaultName.split('/').pop() ?? defaultName;
  }

  private extractAdr(filePath: string, title: string, lines: string[], _content: string): AdrReference {
    let status: AdrReference['status'] = 'ACCEPTED';
    const id = filePath.split('/').pop()?.replace(/\.md$/i, '') ?? 'ADR';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('status:')) {
        const val = trimmed.split(':')[1]?.trim().toUpperCase();
        if (val?.includes('PROPOSED')) status = 'PROPOSED';
        else if (val?.includes('SUPERSEDED')) status = 'SUPERSEDED';
        else if (val?.includes('REJECTED')) status = 'REJECTED';
        else if (val?.includes('ACCEPTED')) status = 'ACCEPTED';
      }
    }

    return {
      adrId: id,
      title,
      status,
      uri: filePath,
      summary: lines.slice(0, 15).join('\n'),
    };
  }

  private extractRationale(lines: string[]): RationaleNode[] {
    const nodes: RationaleNode[] = [];
    let currentPurpose = '';
    let currentInvariants: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('#WHY:') || trimmed.includes('@rationale:')) {
        const rationaleText = trimmed.replace(/^.*(?:#WHY:|@rationale:)/i, '').trim();
        nodes.push({
          purpose: rationaleText,
          architecturalPattern: 'Documented Design Rationale',
          invariants: [],
        });
      }

      if (trimmed.toLowerCase().startsWith('## decision') || trimmed.toLowerCase().startsWith('### decision')) {
        currentPurpose = 'Architecture Decision';
      }

      if (trimmed.startsWith('- invariant:') || trimmed.startsWith('* invariant:')) {
        currentInvariants.push(trimmed.replace(/^[-*]\s*invariant:\s*/i, ''));
      }
    }

    if (currentPurpose) {
      nodes.push({
        purpose: currentPurpose,
        architecturalPattern: 'ADR Decision Block',
        invariants: currentInvariants,
      });
    }

    return nodes;
  }

  private extractRequirements(lines: string[]): Array<{ id: string; title: string; description: string; line: number }> {
    const requirements: Array<{ id: string; title: string; description: string; line: number }> = [];
    const reqRegex = /^\s*[-*]\s*(?:\[([ xX])\]\s*)?(?:(REQ[-_0-9A-Za-z]+|Requirement\s+[0-9]+):?\s*)(.*)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(reqRegex);
      if (match) {
        const reqId = match[2]?.trim() ?? `REQ_${i + 1}`;
        const desc = match[3]?.trim() ?? '';
        requirements.push({
          id: reqId,
          title: `${reqId}: ${desc.substring(0, 50)}`,
          description: desc,
          line: i + 1,
        });
      }
    }

    return requirements;
  }
}
