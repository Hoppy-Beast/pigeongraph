# Security Policy

## Supported Versions

We release security patches and stability updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

---

## Security Architecture & Guarantees

PigeonGraph is designed with an enterprise-first security model:

1. **Zero External Telemetry**: PigeonGraph runs entirely in local memory and local SQLite (`node:sqlite`). No code snippets, metadata, or AST symbols are ever transmitted over external networks.
2. **Deterministic Layer 1**: All Substrate parsers and dynamic dispatch synthesizers are 100% deterministic, running offline with zero LLM API calls.
3. **Prompt Injection Defanger**: Layer 2 features an active `PromptDefanger` that neutralizes adversarial LLM prompt-injection sentinels (`<|im_start|>`, `<<SYS>>`, `[INST]`, `<|endoftext|>`) by inserting zero-width spaces (`\u200b`) and enclosing untrusted files within verified SHA-256 boundaries.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in PigeonGraph, please report it responsibly:

- **Preferred**: Use [GitHub Private Vulnerability Reporting](https://github.com/Hoppy-Beast/pigeongraph/security/advisories/new) on the repository.
- **Alternative**: Contact the author directly at `hoppy.beast.dev@gmail.com` with the subject line `[SECURITY] PigeonGraph Vulnerability Report`.

Please include:
- A description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal proof-of-concept.
- Affected packages, OS, and Node.js version.

### Response Timelines
- **Initial Acknowledgement**: Within 48 hours.
- **Status Update / Assessment**: Within 5 business days.
- **Coordinated Disclosure**: We aim to release a patch and publish a security advisory within 14 days of confirmation.
