## 🐦 Description
<!-- Provide a concise summary of the changes and the architectural motivation. -->

## 📦 Packages Affected
- [ ] `@pigeongraph/schema` (Layer 0)
- [ ] `@pigeongraph/substrate` (Layer 1)
- [ ] `@pigeongraph/semantic` (Layer 2)
- [ ] `@pigeongraph/client` (Layer 3)
- [ ] `@pigeongraph/mcp` (Consumer / CLI / UI)
- [ ] Documentation / CI / Templates

## 🔍 Invariant Hash & Blast Radius Audit
<!-- Run: pigeongraph audit-pr and paste output below -->
```text
```
- [ ] Safe internal refactor (`H_semantic_inv` preserved)
- [ ] Interface signature modified (justified and documented)

## ✅ Contributor Verification Checklist
- [ ] My code adheres to the clean-room MIT licensing standard (zero proprietary / C++ binaries).
- [ ] Deterministic Layer 1 is preserved (0 LLM tokens required for AST parsing).
- [ ] I have added/updated unit tests in `packages/*/test/`.
- [ ] `npm run build` exits with code 0.
- [ ] `npm test` passes all test suites.
- [ ] Any UI changes were verified in `pigeongraph ui` on port 5052.
