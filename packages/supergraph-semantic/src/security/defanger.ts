import { createHash } from 'node:crypto';

/**
 * Prompt Injection Sandboxing & Defanging Engine.
 * Neutralizes prompt injection sentinels and enforces strict data boundaries.
 */
export class PromptDefanger {
  private static readonly INJECTION_SENTINELS = [
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /<\|eot_id\|>/gi,
    /<\|start_header_id\|>/gi,
    /<\|end_header_id\|>/gi,
    /<<SYS>>/gi,
    /<\/SYS>/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /\[SYSTEM\]/gi,
    /\[\/SYSTEM\]/gi,
  ];

  /**
   * Sanitizes raw content by inserting zero-width spaces (\u200b) into known LLM control tokens.
   */
  public static sanitize(rawText: string): string {
    let sanitized = rawText;
    for (const sentinel of this.INJECTION_SENTINELS) {
      sanitized = sanitized.replace(sentinel, (match) => {
        // Insert zero-width space after first character
        return match[0] + '\u200b' + match.slice(1);
      });
    }
    return sanitized;
  }

  /**
   * Encloses untrusted document content in hash-verified XML boundaries.
   */
  public static wrapUntrusted(filePath: string, rawContent: string): string {
    const sha256 = createHash('sha256').update(rawContent, 'utf8').digest('hex');
    const sanitized = this.sanitize(rawContent);
    return `<untrusted_source path="${filePath}" sha256="${sha256}">\n${sanitized}\n</untrusted_source>`;
  }
}
