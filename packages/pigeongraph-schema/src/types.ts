/**
 * Unified Super-Node Types & Data Structures
 * Conforming to Draft 2020-12 Super-Node Specification
 */

export type NodeKind =
  | 'file'
  | 'module'
  | 'class'
  | 'struct'
  | 'interface'
  | 'trait'
  | 'function'
  | 'method'
  | 'property'
  | 'field'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'enum_member'
  | 'type_alias'
  | 'namespace'
  | 'route'
  | 'tool'
  | 'document'
  | 'section'
  | 'community'
  | 'process'
  | 'contract'
  | 'basic_block';

export type SubstrateEdgeKind =
  | 'CONTAINS'
  | 'CALLS'
  | 'IMPORTS'
  | 'EXPORTS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'REFERENCES'
  | 'TYPE_OF'
  | 'RETURNS'
  | 'INSTANTIATES'
  | 'OVERRIDES'
  | 'DECORATES'
  | 'DYNAMIC_DISPATCH_CALLBACK'
  | 'DYNAMIC_DISPATCH_EVENT'
  | 'DYNAMIC_DISPATCH_REACT_STATE'
  | 'DYNAMIC_DISPATCH_FPTR'
  | 'HANDLES_ROUTE'
  | 'HANDLES_TOOL'
  | 'QUERIES_ORM';

export type SemanticEdgeKind =
  | 'calls'
  | 'imports'
  | 'implements'
  | 'inherits'
  | 'IMPLEMENTS_SPEC'
  | 'JUSTIFIED_BY_ADR'
  | 'CROSS_MODULE_DATAFLOW'
  | 'CONCURRENT_WITH'
  | 'MUTEX_COUPLED'
  | 'DOCUMENTS_COMPONENT'
  | 'CONCEPTUAL_SIMILARITY';

export type ConfidenceTier = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface SourceLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  byteRange?: {
    startByte: number;
    endByte: number;
  };
}

export interface NodeVersioning {
  lamportClock: number;
  vectorClock: Record<string, number>;
  layerEpochs: {
    substrateEpoch: number;
    semanticEpoch: number;
    processEpoch: number;
  };
  contentSha256: string;
  astStructuralHash: string;
  semanticValidityHash: string;
  lastModifiedTimestampMs?: number;
}

export interface ParameterDefinition {
  name: string;
  type: string;
  defaultValue?: string;
  isOptional?: boolean;
  isRest?: boolean;
}

export interface DecoratorDefinition {
  name: string;
  arguments?: string[];
  line?: number;
}

export interface SubstrateEdge {
  edgeId?: string;
  targetId: string;
  kind: SubstrateEdgeKind;
  confidence: ConfidenceTier;
  confidenceScore: number;
  provenance:
    | 'tree-sitter-ast'
    | 'scip-indexer'
    | 'native-rust-synthesizer'
    | 'heuristic-resolver'
    | 'llm-inference';
  dispatchMechanism?: string;
  location?: SourceLocation;
  sourceAttributeEpoch?: number;
}

export interface UnresolvedReference {
  referenceName: string;
  referenceKind: string;
  line: number;
  col: number;
  status: 'pending' | 'failed' | 'resolved';
  candidates?: string[];
}

export interface Layer1SubstrateData {
  sourceLocation: SourceLocation;
  language: string;
  symbolSignature?: string;
  visibility?: 'public' | 'private' | 'protected' | 'internal' | 'package-private';
  modifiers?: Array<
    | 'async'
    | 'static'
    | 'abstract'
    | 'exported'
    | 'mutating'
    | 'const'
    | 'virtual'
    | 'override'
    | 'final'
    | 'generator'
    | 'readonly'
    | 'default'
  >;
  returnType?: string;
  parameters?: ParameterDefinition[];
  typeParameters?: string[];
  decorators?: DecoratorDefinition[];
  outgoingEdges: SubstrateEdge[];
  unresolvedReferences?: UnresolvedReference[];
  rawDocstring?: string;
  astEpochTimestamp: string;
}

export interface RationaleNode {
  purpose: string;
  architecturalPattern: string;
  invariants?: string[];
  assumptions?: string[];
  tradeoffs?: string[];
  modelMetadata?: {
    modelName?: string;
    promptVersion?: string;
    generatedAt?: string;
  };
}

export interface MultimodalAssociation {
  assetType:
    | 'markdown_doc'
    | 'pdf'
    | 'architecture_diagram'
    | 'video_transcript'
    | 'spreadsheet'
    | 'rfc_adr'
    | 'live_db_schema'
    | 'mcp_tool_spec';
  uri: string;
  title?: string;
  relevanceScore: number;
  extractedSnippet?: string;
  mediaCoordinates?: {
    pageNumber?: number;
    timestampSeconds?: number;
    sectionHeading?: string;
  };
}

export interface AdrReference {
  adrId: string;
  title: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED' | 'REJECTED';
  uri?: string;
  summary?: string;
}

export interface LeidenCommunityMembership {
  communityId: string;
  communityLabel: string;
  hierarchyLevel?: number;
  cohesionScore: number;
  godNodeScore?: number;
  isGodNode?: boolean;
}

export interface SemanticEmbeddingRecord {
  id?: string;
  model: string;
  dimensions: number;
  vector: number[];
  chunkIndex?: number;
  contentHash: string;
  embeddingEpoch?: number;
}

export interface Layer2SemanticData {
  validityStatus:
    | 'VALID'
    | 'SOFT_DIRTY'
    | 'STALE_RETRY_QUEUED'
    | 'INVALIDATED'
    | 'INFERENCE_IN_PROGRESS';
  conceptualSummary?: string;
  rationaleNodes?: RationaleNode[];
  multimodalAssociations?: MultimodalAssociation[];
  adrReferences?: AdrReference[];
  communityClusters: LeidenCommunityMembership[];
  semanticEmbeddings: SemanticEmbeddingRecord[];
  lastInferenceModel?: string;
  lastInferenceTimestamp?: string;
}

export interface ProcessStepSequence {
  processId: string;
  processName: string;
  stepIndex: number;
  stepRole:
    | 'ENTRY_POINT'
    | 'VALIDATOR'
    | 'INTERMEDIATE_TRANSFORMER'
    | 'BUSINESS_LOGIC'
    | 'DB_MUTATION'
    | 'EXTERNAL_GATEWAY'
    | 'TERMINAL_SINK';
  upstreamNodeIds?: string[];
  downstreamNodeIds?: string[];
  branchCondition?: string;
}

export interface CrossRepoContractLinkage {
  contractId: string;
  role: 'PROVIDER' | 'CONSUMER';
  protocol:
    | 'REST_HTTP'
    | 'GRAPHQL'
    | 'GRPC'
    | 'KAFKA_TOPIC'
    | 'SHARED_DB_SCHEMA'
    | 'MCP_PROTOCOL';
  targetRepoUrn: string;
  targetSymbolUid?: string;
  interfaceSchemaDigest?: string;
  complianceStatus:
    | 'COMPLIANT'
    | 'DRIFT_DETECTED'
    | 'BREAKING_MISMATCH'
    | 'UNRESOLVED';
  driftDiagnostics?: string;
}

export interface Layer3ProcessFlowData {
  isEntryPoint: boolean;
  entryPointScore: number;
  entryPointType?:
    | 'HTTP_ROUTE'
    | 'MCP_TOOL'
    | 'CLI_COMMAND'
    | 'EVENT_SUBSCRIBER'
    | 'RPC_HANDLER'
    | 'CRON_JOB'
    | 'NONE';
  processFlowSequences: ProcessStepSequence[];
  crossRepoContracts: CrossRepoContractLinkage[];
}

export interface SuperNode {
  id: string;
  urn: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  repoId: string;
  versioning: NodeVersioning;
  substrate: Layer1SubstrateData;
  semantic: Layer2SemanticData;
  processFlow: Layer3ProcessFlowData;
  customMetadata?: Record<string, unknown>;
}

export interface GraphDeltaEnvelope {
  protocolVersion: 1;
  epochId: number;
  transactionId: string;
  vectorClock: Record<string, number>;
  timestampMs: number;
  projectRoot: string;
  reconcileMode: 'delta' | 'reset_snapshot';
  mutations: GraphMutation[];
}

export type GraphMutation =
  | { type: 'NodeUpsert'; node: SuperNode }
  | { type: 'NodeDelete'; nodeId: string }
  | { type: 'EdgeUpsert'; sourceId: string; targetId: string; edge: SubstrateEdge }
  | { type: 'EdgeDelete'; sourceId: string; targetId: string; kind: string }
  | { type: 'FileDelete'; filePath: string };
