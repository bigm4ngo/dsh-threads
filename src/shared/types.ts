export interface ModelSelectionSpec {
  provider: string
  model: string
  reasoningEffort?: string
  label?: string
}

export interface CatalogModelReasoning {
  efforts: Array<{ id: string; name?: string; description?: string }>
  defaultEffort?: string
}

export interface CatalogModelInfo {
  id: string
  name?: string
  displayName?: string
  reasoning?: CatalogModelReasoning
}

export interface CatalogProviderGroup {
  id: string
  name?: string
  models: CatalogModelInfo[]
}

export interface CatalogFailure {
  id: string
  name?: string
  message: string
}

export interface CatalogResponse {
  groups: CatalogProviderGroup[]
  defaultModel?: ModelSelectionSpec
  failures: CatalogFailure[]
}

export interface WorktreeInfo {
  path: string
  branch: string
  baseCommit: string
  repoRoot: string
}

export interface GitRepoInfo {
  isGitRepo: boolean
  repoRoot?: string
  headCommit?: string
  headShort?: string
  branch?: string
  dirty: boolean
  untrackedCount: number
  reason?: string
}

export interface TurnAttachmentSummary {
  kind: 'image' | 'file'
  name?: string
  bytes?: number
  mediaType?: string
}

export interface TurnToolDigest {
  callId: string
  name: string
  ok: boolean
  brief: string
}

export interface TurnSummary {
  turn: number
  turnStartSeq: number
  turnEndSeq: number
  prevCompletedEndSeq: number | null
  userSeq: number
  userText: string
  userAttachments: TurnAttachmentSummary[]
  assistantSeq?: number
  assistantText: string
  toolSummary: TurnToolDigest[]
  time: number
  model?: ModelSelectionSpec
}

export interface SideChatToolCall {
  id: string
  name: string
  summary: string
  status: 'running' | 'done' | 'error'
  outputPreview?: string
  error?: string
}

export interface SideChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  reasoning?: string
  toolCalls?: SideChatToolCall[]
  createdAt: number
  model?: ModelSelectionSpec
  streaming?: boolean
  streamSeq?: number
  error?: string
}

export interface SideChat {
  id: string
  parentSessionId: string
  title: string
  anchorSeq?: number
  anchorTurn?: number
  quote?: string
  contextTurnCount: number
  contextSummary: string
  model: ModelSelectionSpec
  toolsEnabled?: boolean
  messages: SideChatMessage[]
  promotedSessionId?: string
  mergedBackAt?: number
  createdAt: number
  updatedAt: number
}

export type LineageEdgeKind = 'fork' | 'edit-retry' | 'handoff' | 'promoted-side'

export type WorkspaceMode = 'same' | 'worktree'

export type DeliveryMode = 'draft' | 'send'

export interface TransferManifest {
  mode: WorkspaceMode
  fromModel?: ModelSelectionSpec
  toModel?: ModelSelectionSpec
  includedTurnNumbers: number[]
  omittedTurnCount: number
  includedToolDigestCount: number
  excludedItems: string[]
  warnings: string[]
}

export interface LineageEdge {
  id: string
  kind: LineageEdgeKind
  parentSessionId: string
  childSessionId: string
  sourceSideChatId?: string
  anchorSeq?: number
  anchorTurn?: number
  anchorSnippet?: string
  fromModel?: ModelSelectionSpec
  toModel?: ModelSelectionSpec
  workspaceMode: WorkspaceMode
  worktree?: WorktreeInfo
  transferManifest?: TransferManifest
  mergedBackAt?: number
  createdAt: number
}

export interface TreeSessionNode {
  sessionId: string
  title: string
  cwd?: string
  running: boolean
  model?: ModelSelectionSpec
  sideChatCount: number
  updatedAt?: number
  missing?: boolean
}

export interface SessionTreeResponse {
  rootSessionId: string
  currentSessionId: string
  nodes: TreeSessionNode[]
  edges: LineageEdge[]
}

export interface SessionInspectResponse {
  sessionId: string
  title: string
  cwd?: string
  running: boolean
  model?: ModelSelectionSpec
  gitInfo: GitRepoInfo
  turns: TurnSummary[]
  sideChats: SideChat[]
  tree: SessionTreeResponse
}

export interface CreateSideChatRequest {
  parentSessionId: string
  title?: string
  anchorSeq?: number
  anchorTurn?: number
  quote?: string
  question?: string
  maxContextTurns?: number
  model?: ModelSelectionSpec
  toolsEnabled?: boolean
}

export interface SendSideChatMessageRequest {
  text: string
  model?: ModelSelectionSpec
  toolsEnabled?: boolean
}

export interface UpdateSideChatRequest {
  title?: string
  model?: ModelSelectionSpec
  toolsEnabled?: boolean
}

export interface PromoteSideChatRequest {
  workspaceMode?: WorkspaceMode
  delivery?: DeliveryMode
  prompt?: string
  model?: ModelSelectionSpec
  stopSourceIfRunning?: boolean
  allowSameWhileRunning?: boolean
}

export interface ForkSessionRequest {
  sessionId: string
  atSeq?: number
  anchorTurn?: number
  anchorSnippet?: string
  workspaceMode?: WorkspaceMode
  model?: ModelSelectionSpec
  title?: string
  initialDraft?: string
  delivery?: DeliveryMode
  stopSourceIfRunning?: boolean
  allowSameWhileRunning?: boolean
}

export interface LinkSessionsRequest {
  parentSessionId: string
  childSessionId: string
  kind?: LineageEdgeKind
  anchorSeq?: number
  anchorTurn?: number
  anchorSnippet?: string
}

export interface EditAndRetryRequest {
  sessionId: string
  turnNumber: number
  prompt: string
  delivery: DeliveryMode
  workspaceMode?: WorkspaceMode
  model?: ModelSelectionSpec
  stopSourceIfRunning?: boolean
  allowSameWhileRunning?: boolean
}

export interface EditAndRetryResponse {
  sessionId: string
  edge: LineageEdge
  delivery: DeliveryMode
  draftText?: string
  attachmentWarning?: string
}

export interface HandoffPreviewRequest {
  sessionId: string
  toModel: ModelSelectionSpec
  workspaceMode: WorkspaceMode
  selectedTurnNumbers?: number[]
  nextInstruction?: string
}

export interface HandoffPreviewResponse {
  packetText: string
  manifest: TransferManifest
  gitInfo: GitRepoInfo
  sourceRunning: boolean
}

export interface ExecuteHandoffRequest {
  sessionId: string
  toModel: ModelSelectionSpec
  workspaceMode: WorkspaceMode
  delivery: DeliveryMode
  packetText: string
  manifest?: TransferManifest
  title?: string
  stopSourceIfRunning?: boolean
  allowSameWhileRunning?: boolean
}

export interface ExecuteHandoffResponse {
  sessionId: string
  edge: LineageEdge
  delivery: DeliveryMode
  draftText?: string
}

export interface DistillRequest {
  kind: 'merge-back' | 'handoff'
  sessionId: string
  sideChatId?: string
  selectedTurnNumbers?: number[]
  model?: ModelSelectionSpec
  nextInstruction?: string
}

export interface DistillResponse {
  text: string
  model: ModelSelectionSpec
}

export interface MergeBackRequest {
  targetParentSessionId: string
  sourceSideChatId?: string
  sourceChildSessionId?: string
  edgeId?: string
  text: string
  delivery: DeliveryMode
  clientTimeZone?: string
}

export interface MergeBackResponse {
  ok: true
  delivery: DeliveryMode
  targetParentSessionId: string
  draftText?: string
  mergedBackAt: number
}

export interface OpenUiRequest {
  sessionId: string
  tab: 'side' | 'tree' | 'turns' | 'handoff'
  sideChatId?: string
  quote?: string
  anchorTurn?: number
  anchorSeq?: number
  note?: string
}

export type ThreadsSseEvent =
  | {
      type: 'side-chat-updated'
      parentSessionId: string
      sideChat: SideChat
    }
  | {
      type: 'side-chat-delta'
      parentSessionId: string
      sideChatId: string
      messageId: string
      delta: string
      channel?: 'text' | 'reasoning'
      seq?: number
    }
  | {
      type: 'side-chat-tool'
      parentSessionId: string
      sideChatId: string
      messageId: string
      toolCall: SideChatToolCall
      seq?: number
    }
  | {
      type: 'side-chat-deleted'
      parentSessionId: string
      sideChatId: string
    }
  | {
      type: 'lineage-updated'
      sessionIds: string[]
      edge?: LineageEdge
    }
  | ({
      type: 'open-ui'
    } & OpenUiRequest)
