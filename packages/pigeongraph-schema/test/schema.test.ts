import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSuperNode,
  computeContentHash,
  computeAstStructuralHash,
  computeSemanticValidityHash,
  ClockManager,
  type SuperNode,
} from '../src/index.js';

describe('Super-Node Schema & Versioning Tests', () => {
  const sampleValidNode: SuperNode = {
    id: 'sg://core-backend/src/auth/jwt.ts#JwtService.verifyToken',
    urn: 'urn:supergraph:core-backend:src/auth/jwt.ts#JwtService.verifyToken',
    kind: 'method',
    name: 'verifyToken',
    qualifiedName: 'JwtService.verifyToken',
    repoId: 'core-backend',
    versioning: {
      lamportClock: 1,
      vectorClock: { 'substrate-daemon': 1 },
      layerEpochs: {
        substrateEpoch: 1,
        semanticEpoch: 0,
        processEpoch: 0,
      },
      contentSha256: 'a'.repeat(64),
      astStructuralHash: 'b'.repeat(64),
      semanticValidityHash: 'c'.repeat(64),
      lastModifiedTimestampMs: Date.now(),
    },
    substrate: {
      sourceLocation: {
        filePath: 'src/auth/jwt.ts',
        startLine: 42,
        startColumn: 2,
        endLine: 78,
        endColumn: 3,
        byteRange: {
          startByte: 1024,
          endByte: 2048,
        },
      },
      language: 'typescript',
      symbolSignature: 'verifyToken(token: string): Promise<UserSession>',
      visibility: 'public',
      modifiers: ['async', 'exported'],
      returnType: 'Promise<UserSession>',
      parameters: [
        { name: 'token', type: 'string' },
      ],
      outgoingEdges: [
        {
          targetId: 'sg://core-backend/src/auth/keys.ts#getKey',
          kind: 'CALLS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        },
      ],
      unresolvedReferences: [],
      rawDocstring: 'Validates JWT token against active public keys.',
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: {
      validityStatus: 'VALID',
      conceptualSummary: 'Authenticates incoming HTTP bearer tokens using RSA public keys.',
      rationaleNodes: [
        {
          purpose: 'Stateless session authentication',
          architecturalPattern: 'JWT / Bearer token validation',
          invariants: ['Token signature must match active RSA key'],
        },
      ],
      multimodalAssociations: [
        {
          assetType: 'markdown_doc',
          uri: 'docs/rfcs/002-auth.md',
          title: 'RFC-002: Authentication Architecture',
          relevanceScore: 0.95,
        },
      ],
      adrReferences: [
        {
          adrId: 'ADR-004',
          title: 'Stateless JWT Sessions',
          status: 'ACCEPTED',
          uri: 'docs/adr/004-jwt.md',
        },
      ],
      communityClusters: [
        {
          communityId: 'comm_auth',
          communityLabel: 'Authentication Subsystem',
          cohesionScore: 0.88,
          godNodeScore: 0.72,
          isGodNode: true,
        },
      ],
      semanticEmbeddings: [],
    },
    processFlow: {
      isEntryPoint: true,
      entryPointScore: 0.95,
      entryPointType: 'HTTP_ROUTE',
      processFlowSequences: [
        {
          processId: 'proc_login',
          processName: 'User Authentication Flow',
          stepIndex: 2,
          stepRole: 'VALIDATOR',
          upstreamNodeIds: ['sg://core-backend/src/routes/auth.ts#loginRoute'],
          downstreamNodeIds: ['sg://core-backend/src/db/user.ts#getUserById'],
        },
      ],
      crossRepoContracts: [
        {
          contractId: 'contract_auth_verify',
          role: 'PROVIDER',
          protocol: 'REST_HTTP',
          targetRepoUrn: 'urn:supergraph:frontend-app:src/api/auth.ts',
          complianceStatus: 'COMPLIANT',
        },
      ],
    },
  };

  test('Valid SuperNode passes Draft 2020-12 validation', () => {
    const result = validateSuperNode(sampleValidNode);
    assert.equal(result.valid, true, `Validation failed: ${result.errors.join(', ')}`);
    assert.equal(result.errors.length, 0);
  });

  test('Invalid SuperNode fails with descriptive errors', () => {
    const invalidNode = { ...sampleValidNode, id: 'not a uri', kind: 'invalid_kind' };
    const result = validateSuperNode(invalidNode);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('Invariant Hash calculations are deterministic', () => {
    const content = 'export async function verifyToken(token: string) { return true; }';
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);

    const semHash1 = computeSemanticValidityHash({
      name: 'verifyToken',
      kind: 'function',
      visibility: 'public',
      signature: 'verifyToken(token: string): Promise<boolean>',
      returnType: 'Promise<boolean>',
      parameters: [{ name: 'token', type: 'string' }],
    });

    const semHash2 = computeSemanticValidityHash({
      name: 'verifyToken',
      kind: 'function',
      visibility: 'public',
      signature: 'verifyToken(token: string): Promise<boolean>',
      returnType: 'Promise<boolean>',
      parameters: [{ name: 'token', type: 'string' }],
    });

    assert.equal(semHash1, semHash2);
    assert.equal(semHash1.length, 64);
  });

  test('ClockManager maintains monotonic Lamport and Vector clocks', () => {
    const clock = new ClockManager('daemon-1');
    assert.equal(clock.getLamport(), 0);

    const t1 = clock.tick();
    assert.equal(t1.lamport, 1);
    assert.equal(t1.vector['daemon-1'], 1);

    // Receive message from worker with higher clock
    const t2 = clock.receive(5, { 'worker-1': 3 });
    assert.equal(t2.lamport, 6);
    assert.equal(t2.vector['daemon-1'], 2);
    assert.equal(t2.vector['worker-1'], 3);
  });
});
