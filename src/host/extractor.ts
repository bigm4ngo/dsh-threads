import type {
  GitRepoInfo,
  ModelSelectionSpec,
  SideChatMessage,
  TransferManifest,
  TurnAttachmentSummary,
  TurnSummary,
  TurnToolDigest,
  WorkspaceMode,
} from '../shared/types.ts'

export interface RawSessionEvent {
  type: string
  seq: number
  time: number
  data?: unknown
}

const SYNTHETIC_USER_SOURCE_KINDS = new Set([
  'runtime-context',
  'agent-instructions',
  'tool',
  'subagent',
  'goal',
  'schedule',
  'skill-invocation',
])

const MAX_TOOL_BRIEF_CHARS = 120
const DEFAULT_SIDE_CHAT_MAX_TURNS = 8
const DEFAULT_SIDE_CHAT_MAX_CHARS = 20_000
const DEFAULT_HANDOFF_MAX_CHARS = 28_000

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function collapseOneLine(text: string, limit = MAX_TOOL_BRIEF_CHARS): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= limit) return collapsed
  return `${collapsed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function extractTextFromContent(content: unknown, opts: { includeReasoning?: boolean } = {}): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const rawBlock of content) {
    const block = asRecord(rawBlock)
    if (!block) continue
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      parts.push(block.text)
    } else if (
      opts.includeReasoning &&
      block.type === 'reasoning' &&
      typeof block.text === 'string' &&
      block.text.length > 0
    ) {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function extractAttachmentsFromContent(content: unknown): TurnAttachmentSummary[] {
  if (!Array.isArray(content)) return []
  const attachments: TurnAttachmentSummary[] = []
  for (const rawBlock of content) {
    const block = asRecord(rawBlock)
    if (!block) continue
    if (block.type === 'image') {
      const ref = asRecord(block.attachment)
      attachments.push({
        kind: 'image',
        ...(asString(ref?.name) ? { name: asString(ref?.name) } : {}),
        ...(typeof ref?.bytes === 'number' ? { bytes: ref.bytes } : {}),
        ...(asString(ref?.mediaType) ? { mediaType: asString(ref?.mediaType) } : {}),
      })
    } else if (block.type === 'file') {
      const ref = asRecord(block.attachment)
      attachments.push({
        kind: 'file',
        ...(asString(ref?.name) ? { name: asString(ref?.name) } : {}),
        ...(typeof ref?.bytes === 'number' ? { bytes: ref.bytes } : {}),
      })
    }
  }
  return attachments
}

function isHumanUserMessage(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false
  if (data.role !== undefined && data.role !== 'user') return false
  const source = asRecord(data.source)
  const kind = asString(source?.kind)
  if (!kind) return true
  if (SYNTHETIC_USER_SOURCE_KINDS.has(kind)) return false
  return kind === 'user' || kind === 'user-rpc'
}

function modelFromHeaderEvent(data: Record<string, unknown> | undefined): ModelSelectionSpec | undefined {
  const header = asRecord(data?.header)
  const config = asRecord(header?.config)
  const provider = asString(config?.provider)?.trim()
  const model = asString(config?.model)?.trim()
  if (!provider || !model) return undefined
  const reasoningEffort = asString(config?.reasoningEffort)?.trim()
  return {
    provider,
    model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }
}

function modelFromAssistantMessage(
  msg: Record<string, unknown> | undefined,
  fallback?: ModelSelectionSpec,
): ModelSelectionSpec | undefined {
  const source = asRecord(msg?.source)
  const provider = asString(source?.provider)?.trim()
  const model = asString(source?.model)?.trim()
  if (provider && model) {
    return {
      provider,
      model,
      ...(fallback?.provider === provider && fallback?.model === model && fallback.reasoningEffort
        ? { reasoningEffort: fallback.reasoningEffort }
        : {}),
    }
  }
  return fallback
}

function summarizeToolArgs(name: string, argsRaw: string | undefined): string {
  if (!argsRaw) return name
  try {
    const parsed = JSON.parse(argsRaw) as unknown
    const obj = asRecord(parsed)
    if (obj) {
      const pathVal =
        asString(obj.Path) ??
        asString(obj.path) ??
        asString(obj.filePath) ??
        asString(obj.file_path)
      if (pathVal) return `${name} ${collapseOneLine(pathVal, 80)}`
      const cmdVal = asString(obj.CommandLine) ?? asString(obj.command) ?? asString(obj.query)
      if (cmdVal) return `${name}: ${collapseOneLine(cmdVal, 80)}`
    }
  } catch {
    // Raw args may not be strict JSON; fall back cleanly.
  }
  return `${name} ${collapseOneLine(argsRaw, 70)}`
}

interface PendingTurnBuild {
  turn: number
  turnStartSeq: number
  prevCompletedEndSeq: number | null
  userSeq?: number
  userText: string
  userAttachments: TurnAttachmentSummary[]
  assistantSeq?: number
  assistantParts: string[]
  toolOrder: string[]
  tools: Map<string, TurnToolDigest>
  time: number
  model?: ModelSelectionSpec
}

export function extractTurnsFromEvents(events: readonly RawSessionEvent[]): TurnSummary[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const turns: TurnSummary[] = []
  let latestHeaderModel: ModelSelectionSpec | undefined
  let lastCompletedEndSeq: number | null = null
  let current: PendingTurnBuild | null = null

  const finalize = (endSeq: number, endTime: number) => {
    if (!current) return
    if (current.userSeq !== undefined) {
      turns.push({
        turn: current.turn,
        turnStartSeq: current.turnStartSeq,
        turnEndSeq: endSeq,
        prevCompletedEndSeq: current.prevCompletedEndSeq,
        userSeq: current.userSeq,
        userText: current.userText,
        userAttachments: current.userAttachments,
        ...(current.assistantSeq !== undefined ? { assistantSeq: current.assistantSeq } : {}),
        assistantText: current.assistantParts.join('\n\n').trim(),
        toolSummary: current.toolOrder
          .map((id) => current!.tools.get(id))
          .filter((item): item is TurnToolDigest => Boolean(item)),
        time: current.time || endTime,
        ...(current.model ? { model: current.model } : {}),
      })
    }
    lastCompletedEndSeq = endSeq
    current = null
  }

  for (const event of sorted) {
    const data = asRecord(event.data)

    if (event.type === 'request/header') {
      const m = modelFromHeaderEvent(data)
      if (m) {
        latestHeaderModel = m
        if (current && !current.model) {
          current.model = m
        }
      }
      continue
    }

    if (event.type === 'turn/start') {
      if (current) {
        finalize(Math.max(current.turnStartSeq, event.seq - 1), event.time)
      }
      const turnNum = typeof data?.turn === 'number' ? data.turn : turns.length + 1
      current = {
        turn: turnNum,
        turnStartSeq: event.seq,
        prevCompletedEndSeq: lastCompletedEndSeq,
        userText: '',
        userAttachments: [],
        assistantParts: [],
        toolOrder: [],
        tools: new Map(),
        time: event.time,
        model: latestHeaderModel,
      }
      continue
    }

    if (event.type === 'turn/end') {
      if (current) {
        finalize(event.seq, event.time)
      } else {
        lastCompletedEndSeq = event.seq
      }
      continue
    }

    if (!current) {
      // Handle logs without explicit turn/start wrapper cleanly if a human user message appears.
      if (event.type === 'user/message' && isHumanUserMessage(data)) {
        const text = extractTextFromContent(data?.content).trim()
        const attachments = extractAttachmentsFromContent(data?.content)
        if (text || attachments.length > 0) {
          current = {
            turn: turns.length + 1,
            turnStartSeq: event.seq,
            prevCompletedEndSeq: lastCompletedEndSeq,
            userSeq: event.seq,
            userText: text,
            userAttachments: attachments,
            assistantParts: [],
            toolOrder: [],
            tools: new Map(),
            time: event.time,
            model: latestHeaderModel,
          }
        }
      }
      continue
    }

    if (event.type === 'user/message') {
      if (!isHumanUserMessage(data)) continue
      const text = extractTextFromContent(data?.content).trim()
      const attachments = extractAttachmentsFromContent(data?.content)
      if (!text && attachments.length === 0) continue
      if (current.userSeq === undefined) {
        current.userSeq = event.seq
        current.userText = text
        current.userAttachments = attachments
        current.time = event.time
      } else {
        // Steering message within the same turn: append cleanly to user prompt text.
        if (text) {
          current.userText = current.userText ? `${current.userText}\n\n${text}` : text
        }
        if (attachments.length > 0) {
          current.userAttachments.push(...attachments)
        }
      }
      continue
    }

    if (event.type === 'assistant/message') {
      const msg = asRecord(data?.message)
      const text = extractTextFromContent(msg?.content, { includeReasoning: false }).trim()
      if (text) {
        current.assistantParts.push(text)
      }
      current.assistantSeq = event.seq
      const resolvedModel = modelFromAssistantMessage(msg, latestHeaderModel)
      if (resolvedModel) {
        current.model = resolvedModel
      }
      continue
    }

    if (event.type === 'tool/call') {
      const callId = asString(data?.callId) ?? `call-${event.seq}`
      const name = asString(data?.name) ?? 'tool'
      const argsRaw = asString(data?.arguments)
      if (!current.tools.has(callId)) {
        current.toolOrder.push(callId)
      }
      current.tools.set(callId, {
        callId,
        name,
        ok: true,
        brief: summarizeToolArgs(name, argsRaw),
      })
      continue
    }

    if (event.type === 'tool/result') {
      const msg = asRecord(data?.message)
      const callId = asString(msg?.toolCallId) ?? asString(data?.callId) ?? `call-${event.seq}`
      const isError = msg?.isError === true || Boolean(data?.error)
      const errObj = asRecord(data?.error)
      const errReason = asString(errObj?.reason) ?? asString(errObj?.code)
      const existing = current.tools.get(callId)
      const resultText = extractTextFromContent(msg?.content).trim()
      if (existing) {
        existing.ok = !isError
        if (isError && errReason) {
          existing.brief = `${existing.brief} -> ERR: ${collapseOneLine(errReason, 60)}`
        } else if (isError && resultText) {
          existing.brief = `${existing.brief} -> ERR: ${collapseOneLine(resultText, 60)}`
        }
      } else {
        const name = asString(msg?.toolName) ?? 'tool'
        current.toolOrder.push(callId)
        current.tools.set(callId, {
          callId,
          name,
          ok: !isError,
          brief: isError
            ? `${name} -> ERR: ${collapseOneLine(errReason ?? resultText ?? 'failed', 60)}`
            : name,
        })
      }
    }
  }

  return turns
}

function formatTurnBlock(turn: TurnSummary): string {
  const lines: string[] = []
  const modelLabel = turn.model ? ` [${turn.model.provider}/${turn.model.model}]` : ''
  lines.push(`### Turn ${turn.turn}${modelLabel}`)
  if (turn.userText) {
    lines.push(`**User:** ${turn.userText}`)
  }
  if (turn.userAttachments.length > 0) {
    const names = turn.userAttachments.map((a) => `${a.kind}:${a.name ?? 'unnamed'}`).join(', ')
    lines.push(`**Attachments:** ${names}`)
  }
  if (turn.toolSummary.length > 0) {
    const digest = turn.toolSummary
      .slice(0, 8)
      .map((t) => `${t.ok ? 'ok' : 'err'}(${t.brief})`)
      .join('; ')
    const extra = turn.toolSummary.length > 8 ? ` (+${turn.toolSummary.length - 8} more)` : ''
    lines.push(`**Tools:** ${digest}${extra}`)
  }
  if (turn.assistantText) {
    lines.push(`**Assistant:** ${turn.assistantText}`)
  }
  return lines.join('\n')
}

export function buildBoundedSideChatContext(
  turns: readonly TurnSummary[],
  options: {
    maxTurns?: number
    maxChars?: number
    quote?: string
    anchorTurn?: number
  } = {},
): { contextSummary: string; contextTurnCount: number } {
  const maxTurns = Math.max(1, options.maxTurns ?? DEFAULT_SIDE_CHAT_MAX_TURNS)
  const maxChars = Math.max(1000, options.maxChars ?? DEFAULT_SIDE_CHAT_MAX_CHARS)

  let eligible = [...turns]
  if (options.anchorTurn !== undefined) {
    const anchor = options.anchorTurn
    const upToAnchor = eligible.filter((t) => t.turn <= anchor)
    if (upToAnchor.length > 0) {
      eligible = upToAnchor
    }
  }

  const sliced = eligible.slice(-maxTurns)
  const headerParts: string[] = []
  if (options.quote?.trim()) {
    headerParts.push(`Selected passage from parent session:\n> ${options.quote.trim().replace(/\n/g, '\n> ')}`)
  }

  const keptBlocks: string[] = []
  let usedChars = headerParts.join('\n\n').length

  for (let i = sliced.length - 1; i >= 0; i -= 1) {
    const block = formatTurnBlock(sliced[i])
    if (usedChars + block.length + 2 > maxChars && keptBlocks.length > 0) {
      break
    }
    keptBlocks.unshift(
      block.length + usedChars > maxChars
        ? `${block.slice(0, Math.max(400, maxChars - usedChars - 24))}\n… [truncated]`
        : block,
    )
    usedChars += block.length + 2
  }

  const sections = [...headerParts]
  if (keptBlocks.length > 0) {
    sections.push(`Recent parent session context (${keptBlocks.length} turn${keptBlocks.length === 1 ? '' : 's'}):\n\n${keptBlocks.join('\n\n')}`)
  }

  return {
    contextSummary: sections.join('\n\n'),
    contextTurnCount: keptBlocks.length,
  }
}

export function buildMergeBackBrief(options: {
  sourceLabel: string
  anchorTurn?: number
  quote?: string
  messages?: readonly SideChatMessage[]
  turns?: readonly TurnSummary[]
  text?: string
}): string {
  const headingParts = [`Findings from ${options.sourceLabel}`]
  if (options.anchorTurn !== undefined) {
    headingParts.push(`(anchored at Turn ${options.anchorTurn})`)
  }
  const lines: string[] = [`[${headingParts.join(' ')}]`]

  if (options.quote?.trim()) {
    const snippet = collapseOneLine(options.quote.trim(), 160)
    lines.push(`Context: "${snippet}"`)
  }

  if (options.text?.trim()) {
    lines.push(options.text.trim())
    return lines.join('\n\n')
  }

  if (options.messages && options.messages.length > 0) {
    const recent = options.messages.filter((m) => m.text.trim().length > 0).slice(-6)
    const lastUser = [...recent].reverse().find((m) => m.role === 'user')
    const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant')
    if (lastUser) {
      lines.push(`**Question:** ${lastUser.text.trim()}`)
    }
    if (lastAssistant) {
      lines.push(`**Findings:**\n${lastAssistant.text.trim()}`)
    }
    return lines.join('\n\n')
  }

  if (options.turns && options.turns.length > 0) {
    const recent = options.turns.slice(-3)
    const body = recent
      .map((t) => {
        const chunks: string[] = [`- **Turn ${t.turn}**`]
        if (t.userText) chunks.push(`  Prompt: ${collapseOneLine(t.userText, 180)}`)
        if (t.assistantText) chunks.push(`  Outcome: ${collapseOneLine(t.assistantText, 600)}`)
        if (t.toolSummary.length > 0) {
          chunks.push(
            `  Tools: ${t.toolSummary.slice(0, 5).map((d) => `${d.ok ? 'ok' : 'err'}(${d.brief})`).join(', ')}`,
          )
        }
        return chunks.join('\n')
      })
      .join('\n')
    lines.push(body)
    return lines.join('\n\n')
  }

  lines.push('No findings recorded yet.')
  return lines.join('\n\n')
}

export function buildHandoffPacket(options: {
  sessionId: string
  sessionTitle: string
  turns: readonly TurnSummary[]
  selectedTurnNumbers?: readonly number[]
  fromModel?: ModelSelectionSpec
  toModel?: ModelSelectionSpec
  workspaceMode: WorkspaceMode
  gitInfo?: GitRepoInfo
  nextInstruction?: string
  maxChars?: number
}): { packetText: string; manifest: TransferManifest } {
  const maxChars = Math.max(2000, options.maxChars ?? DEFAULT_HANDOFF_MAX_CHARS)
  const selectedSet =
    options.selectedTurnNumbers && options.selectedTurnNumbers.length > 0
      ? new Set(options.selectedTurnNumbers)
      : undefined

  const includedTurns = selectedSet
    ? options.turns.filter((t) => selectedSet.has(t.turn))
    : [...options.turns]

  const omittedTurnCount = Math.max(0, options.turns.length - includedTurns.length)

  let includedToolDigestCount = 0
  let attachmentCount = 0
  for (const turn of includedTurns) {
    includedToolDigestCount += turn.toolSummary.length
    attachmentCount += turn.userAttachments.length
  }

  const excludedItems = [
    'Hidden model reasoning / thinking blocks',
    'Live external CLI subprocess state (Claude / AGY native process memory)',
    'Pending tool approvals, live terminal PTYs, and ephemeral MCP state',
  ]
  if (omittedTurnCount > 0) {
    excludedItems.push(`${omittedTurnCount} unselected earlier/later turn${omittedTurnCount === 1 ? '' : 's'}`)
  }
  if (attachmentCount > 0) {
    excludedItems.push(`${attachmentCount} raw attachment binary payload${attachmentCount === 1 ? '' : 's'} (listed by name only)`)
  }

  const warnings: string[] = []
  if (options.workspaceMode === 'worktree' && options.gitInfo?.dirty) {
    warnings.push(
      `Source checkout has uncommitted changes${
        options.gitInfo.untrackedCount > 0
          ? ` (${options.gitInfo.untrackedCount} untracked)`
          : ''
      }; the new isolated Git worktree starts from committed HEAD (${options.gitInfo.headShort ?? 'HEAD'}).`,
    )
  }
  if (options.toModel?.provider === 'antigravity' && attachmentCount > 0) {
    warnings.push(
      'Antigravity currently receives text-only handoff context; image/file attachments are referenced by name rather than forwarded as binary attachments.',
    )
  }

  const fromLabel = options.fromModel
    ? `${options.fromModel.provider}/${options.fromModel.model}`
    : 'unknown'
  const toLabel = options.toModel
    ? `${options.toModel.provider}/${options.toModel.model}${
        options.toModel.reasoningEffort ? ` (${options.toModel.reasoningEffort})` : ''
      }`
    : 'selected model'

  const headerLines = [
    `# Provider Handoff Context`,
    `- **Source session:** ${options.sessionTitle || options.sessionId} (\`${options.sessionId}\`)`,
    `- **From:** ${fromLabel} -> **To:** ${toLabel}`,
    `- **Workspace mode:** ${
      options.workspaceMode === 'worktree'
        ? `New isolated Git worktree from ${options.gitInfo?.headShort ?? 'HEAD'}`
        : 'Same local workspace (sequential baton pass)'
    }`,
    `- **Included turns:** ${
      includedTurns.length > 0
        ? includedTurns.map((t) => `T${t.turn}`).join(', ')
        : 'None'
    }${omittedTurnCount > 0 ? ` (${omittedTurnCount} omitted)` : ''}`,
  ]

  const headerText = headerLines.join('\n')
  const footerText = options.nextInstruction?.trim()
    ? `## Next Instruction\n${options.nextInstruction.trim()}`
    : `## Next Instruction\nContinue from the context above. Confirm the current workspace state if needed before making edits.`

  const budgetForTurns = Math.max(1000, maxChars - headerText.length - footerText.length - 120)
  const turnBlocks: string[] = []
  let turnBytes = 0
  for (let i = includedTurns.length - 1; i >= 0; i -= 1) {
    const formatted = formatTurnBlock(includedTurns[i])
    if (turnBytes + formatted.length + 2 > budgetForTurns && turnBlocks.length > 0) {
      warnings.push(
        `Truncated oldest ${i + 1} selected turn${i === 0 ? '' : 's'} to fit the ${maxChars}-character handoff budget.`,
      )
      break
    }
    const piece =
      formatted.length > budgetForTurns
        ? `${formatted.slice(0, budgetForTurns - 24)}\n… [truncated]`
        : formatted
    turnBlocks.unshift(piece)
    turnBytes += piece.length + 2
  }

  const bodyParts = [headerText]
  if (turnBlocks.length > 0) {
    bodyParts.push(`## Conversation & Tool Digest\n\n${turnBlocks.join('\n\n')}`)
  }
  bodyParts.push(footerText)

  const manifest: TransferManifest = {
    mode: options.workspaceMode,
    ...(options.fromModel ? { fromModel: options.fromModel } : {}),
    ...(options.toModel ? { toModel: options.toModel } : {}),
    includedTurnNumbers: includedTurns.map((t) => t.turn),
    omittedTurnCount,
    includedToolDigestCount,
    excludedItems,
    warnings,
  }

  return {
    packetText: bodyParts.join('\n\n'),
    manifest,
  }
}
