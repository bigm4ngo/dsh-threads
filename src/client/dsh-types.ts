import type { ComponentType } from 'react'

export type Unsubscribe = () => void

export interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): Unsubscribe
}

export interface ModelSelectionValue {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export interface ModelSelectionProjection {
  provider?: string
  model?: string
  reasoningEffort?: string
  next?: ModelSelectionValue
  lastUsed?: ModelSelectionValue
}

export interface ListedSessionEntry {
  id: string
  sessionId?: string
  displayTitle?: string
  title?: string
  cwd?: string
  parentId?: string
  origin?: unknown
  running?: boolean
  blank?: boolean
  updatedAt?: number
  projections?: {
    values?: {
      modelSelection?: ModelSelectionProjection
    }
  }
  projectionValues?: {
    modelSelection?: ModelSelectionProjection
  }
}

export interface SessionsListSnapshot {
  ids: readonly string[]
  byId: Record<string, ListedSessionEntry>
  phase?: string
}

export interface SessionBinding {
  session?: ObservableSnapshot<{
    running?: boolean
    removed?: boolean
    subagent?: { address?: { mode?: string }; parentAvailable?: boolean } | null
  }> & {
    projections?: {
      faceOf?(name: string): ObservableSnapshot<ModelSelectionValue | undefined> | undefined
    }
  }
}

export interface SessionReference {
  sessionId: string
  binding: SessionBinding
  release(): void
}

export interface WorkspaceItem {
  id: string
  path: string
  title: string
  sessionIds: readonly string[]
}

export interface WorkspacesListSnapshot {
  items: readonly WorkspaceItem[]
  archivedSessionIds?: ReadonlySet<string> | readonly string[]
  pinnedSessionIds?: ReadonlySet<string> | readonly string[]
  phase?: string
}

export interface SessionStatusEntry {
  running?: boolean
  pendingInteraction?: { kind: string; [key: string]: unknown }
  completionUnread?: boolean
}

export interface SidebarRightTabNavigation {
  readonly address: string
  readonly params?: Record<string, unknown>
  readonly revision: number
}

export interface SidebarRightTabActions {
  bindCommands?(commands: { refresh?: () => void }): () => void
  openTab?(kind: string, options?: { params?: Record<string, unknown>; replaceTab?: boolean }): void
  close?(): void
}

export interface SidebarRightTabInfo {
  readonly sidebar: {
    readonly expanded: boolean
    readonly fullscreen: boolean
  }
  readonly panel: {
    readonly id: string
    readonly isFloating: boolean
  }
  readonly tab: {
    readonly id: string
    readonly kind: string
    readonly title?: string
    readonly visible: boolean
    readonly navigation: SidebarRightTabNavigation
    readonly signal: AbortSignal
    readonly actions: SidebarRightTabActions
  }
}

export interface SidebarRightGuideEntry {
  readonly id: string
  readonly order: number
  readonly title: () => string
  readonly description?: () => string
  readonly icon?: ComponentType<{ size?: number; className?: string }>
}

export interface SidebarRightTabDefinition {
  readonly id: string
  readonly kind: string
  readonly multiple?: boolean
  readonly keepMounted?: boolean
  readonly priority?: 'extension' | 'builtin' | 'fallback'
  readonly title: (address: string) => string
  readonly guide?: readonly SidebarRightGuideEntry[]
}

export interface SidebarRightTabProps {
  sessionId?: string
  useTabInfo?: () => SidebarRightTabInfo
  ctx: DshClientContext
}

export interface DshClientContext {
  slots: {
    inject(slotName: string, factory: () => (() => void) | void | null): () => void
    register(meta: Record<string, unknown>, component: unknown): () => void
  }
  sessions?: {
    list?: ObservableSnapshot<SessionsListSnapshot>
    retain?(sessionId: string, options?: { source?: string }): SessionReference
  }
  workspaces?: {
    list?: ObservableSnapshot<WorkspacesListSnapshot>
  }
  uiWorkspace?: {
    openSession?(sessionId: string): unknown
  }
  uiSession?: {
    sessionStatus?: ObservableSnapshot<ReadonlyMap<string, SessionStatusEntry>>
  }
  uiConversation?: {
    binding?(binding: SessionBinding): {
      target(name: string): ObservableSnapshot<unknown>
    }
  }
  sidebarRight?: {
    readonly mounted?: ObservableSnapshot<string | undefined>
    openTab?(kind: string, options?: { params?: Record<string, unknown> }): void
    isExpanded?(): boolean
    active?(): { id: string; kind: string } | undefined
    tabsIn?(sessionId: string): ReadonlyArray<{ id: string; kind: string }>
    closeIn?(sessionId: string, tabId: string): void
    focus?(tabId: string): void
  }
  sidebarRightTabs?: {
    register(definition: SidebarRightTabDefinition): () => void
  }
  locale?: {
    resolveText?(text: unknown): string
  }
  modelDirectories?: {
    directoryFor?(sessionId: string): {
      store?: ObservableSnapshot<{ current?: ModelSelectionValue }>
    }
  }
  get?(name: string): unknown
}
