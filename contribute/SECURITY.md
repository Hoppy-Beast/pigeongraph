# Security policy

## Supported versions

Security updates are provided for the following versions:

| Version | Supported |
| :--- | :---: |
| 1.x | Yes |
| < 1.0 | No |

---

## Security model

PigeonGraph follows these security rules:

1. Local execution: PigeonGraph runs entirely in local memory and local SQLite (`node:sqlite`). No source files, symbol metadata, or AST data are transmitted over the network.
2. Deterministic Layer 1: Substrate parsers and dynamic dispatch synthesizers run locally without external LLM API calls.
3. Prompt injection defense: Layer 2 uses `PromptDefanger` to neutralize control tokens (`<|im_start|>`, `<<SYS>>`, `[INST]`, `<|endoftext|>`) with zero-width spaces (`\u200b`) and wrap untrusted content in `<untrusted_source>` SHA-256 boundaries.

---

## Reporting a vulnerability

If you find a security issue in PigeonGraph, report it through one of the following channels:

- Preferred: Use [GitHub Private Vulnerability Reporting](https://github.com/Hoppy-Beast/pigeongraph/security/advisories/new).
- Alternative: Email the author at `hoppy.beast.dev@gmail.com` with the subject line `[SECURITY] PigeonGraph Vulnerability Report`.

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce or a minimal proof of concept.
- Affected packages, operating system, and Node.js version.

### Response timelines
- Initial acknowledgement: within 48 hours.
- Status update: within 5 business days.
- Fix and advisory: within 14 days of confirmation where feasible.

