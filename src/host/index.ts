import type { IncomingMessage, ServerResponse } from 'node:http'
import { ThreadsEventBus } from './events.ts'
import { createThreadsHandler, type ConnectionLike } from './routes.ts'
import {
  type AgentsServiceLike,
  type SkillRegistryLike,
  type ToolsServiceLike,
  type WebServiceLike,
} from './side-chat-tools.ts'
import {
  type LlmServiceLike,
  type PermissionPresetsLike,
  type SessionControllerLike,
  type SessionQueryLike,
  type SessionsServiceLike,
  ThreadsService,
  type WorkspaceRegistryLike,
} from './service.ts'
import { ThreadsStore } from './store.ts'

interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  }): (() => void | Promise<void>) | void
}

interface CommandsRuntimeLike {
  register(definition: {
    name: string
    description: string
    input?: { hint: string; attachments?: boolean }
    handler: (invocation: {
      agent: { id: string; session?: { id?: string } }
      rawInput: string
    }) => { kind: 'success' | 'error'; text?: string }
  }): () => void
}

interface HostScopedContext {
  webServer: WebServerLike
  connection: ConnectionLike
  sessionController: SessionControllerLike
  llm: LlmServiceLike
  logger?: {
    info?(message: string): void
    warn?(message: string): void
    error?(message: string): void
  }
  get?<T>(name: string): T | undefined
  effect(execute: () => (() => void | Promise<void>) | void, label?: string): () => void
  [key: string]: unknown
}

export interface HostPluginContext {
  inject(deps: string[], callback: (scoped: HostScopedContext) => void): unknown
}

function getOptionalService<T>(ctx: HostScopedContext, name: string): T | undefined {
  if (typeof ctx.get === 'function') {
    return ctx.get<T>(name)
  }
  return ctx[name] as T | undefined
}

export const name = 'dsh-threads'

export const inject: string[] = []

export const Config = {
  '~standard': {
    version: 1 as const,
    vendor: 'dsh-threads',
    validate(value: unknown) {
      return {
        value: value && typeof value === 'object' ? value : {},
      }
    },
  },
}

export function apply(ctx: HostPluginContext): void {
  ctx.inject(['webServer', 'connection', 'sessionController', 'llm'], (scoped) => {
    const store = new ThreadsStore({
      logger: scoped.logger?.warn
        ? { warn: (msg) => scoped.logger?.warn?.(msg) }
        : undefined,
    })
    const bus = new ThreadsEventBus()

    const service = new ThreadsService({
      store,
      bus,
      sessionController: scoped.sessionController,
      llm: scoped.llm,
      sessionQuery: getOptionalService<SessionQueryLike>(scoped, 'sessionQuery'),
      workspaceRegistry: getOptionalService<WorkspaceRegistryLike>(scoped, 'workspaceRegistry'),
      permissionPresets: getOptionalService<PermissionPresetsLike>(scoped, 'permissionPresets'),
      sessions: getOptionalService<SessionsServiceLike>(scoped, 'sessions'),
      tools: getOptionalService<ToolsServiceLike>(scoped, 'tools'),
      web: getOptionalService<WebServiceLike>(scoped, 'web'),
      skills: getOptionalService<SkillRegistryLike>(scoped, 'skills'),
      agents: getOptionalService<AgentsServiceLike>(scoped, 'agents'),
      logger: scoped.logger,
    })

    const handler = createThreadsHandler({
      service,
      bus,
      connection: scoped.connection,
    })

    scoped.effect(() => () => {
      service.dispose()
      bus.close()
    }, 'dsh-threads: service')

    scoped.effect(() => {
      const disposeRoute = scoped.webServer.register({
        kind: 'prefix',
        path: '/dsh-threads',
        handler,
      })
      return () => {
        if (typeof disposeRoute === 'function') {
          void disposeRoute()
        }
      }
    }, 'dsh-threads: http route')

    const commands = getOptionalService<CommandsRuntimeLike>(scoped, 'commands')
    if (commands && typeof commands.register === 'function') {
      scoped.effect(() => {
        const cmdDisposers: Array<() => void> = []
        try {
          cmdDisposers.push(
            commands.register({
              name: 'side',
              description: 'Open or ask a provider-neutral side chat in the Threads sidebar',
              input: { hint: 'Optional question about the current conversation' },
              handler: ({ agent, rawInput }) => {
                const sid = agent.session?.id ?? agent.id
                return service.handleSlashSide(sid, rawInput)
              },
            }),
          )
          cmdDisposers.push(
            commands.register({
              name: 'handoff',
              description: 'Open portable provider handoff in the Threads sidebar',
              input: { hint: 'Optional handoff instruction for the next model' },
              handler: ({ agent, rawInput }) => {
                const sid = agent.session?.id ?? agent.id
                return service.handleSlashHandoff(sid, rawInput)
              },
            }),
          )
        } catch (error) {
          scoped.logger?.warn?.(
            `dsh-threads: failed to register slash commands: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
        return () => {
          for (const dispose of cmdDisposers.reverse()) {
            try {
              dispose()
            } catch {
              // Ignore individual disposer failures on teardown.
            }
          }
        }
      }, 'dsh-threads: slash commands')
    }
  })
}
