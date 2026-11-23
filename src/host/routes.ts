import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  CreateSideChatRequest,
  DistillRequest,
  EditAndRetryRequest,
  ExecuteHandoffRequest,
  ForkSessionRequest,
  HandoffPreviewRequest,
  LinkSessionsRequest,
  MergeBackRequest,
  PromoteSideChatRequest,
  SendSideChatMessageRequest,
  UpdateSideChatRequest,
} from '../shared/types.ts'
import type { ThreadsEventBus } from './events.ts'
import { BadRequestError, HttpError, type ThreadsService } from './service.ts'

const MAX_BODY_BYTES = 512 * 1024
const PREFIX = '/dsh-threads'

export interface ConnectionLike {
  requestRejection(request: IncomingMessage): 401 | 403 | undefined
}

class PayloadTooLargeError extends HttpError {
  constructor() {
    super(413, 'Request body exceeds 512 KiB limit')
    this.name = 'PayloadTooLargeError'
  }
}

class UnsupportedMediaTypeError extends HttpError {
  constructor() {
    super(415, 'Content-Type must be application/json')
    this.name = 'UnsupportedMediaTypeError'
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204, {
    'cache-control': 'no-store',
  })
  res.end()
}

function sendMethodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, {
    allow,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify({ error: 'Method not allowed' }))
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function normalizePath(rawUrl: string | undefined): {
  pathname: string
  searchParams: URLSearchParams
} {
  const url = new URL(rawUrl ?? '/', 'http://localhost')
  let pathname = url.pathname
  if (pathname === PREFIX) {
    pathname = '/'
  } else if (pathname.startsWith(`${PREFIX}/`)) {
    pathname = pathname.slice(PREFIX.length)
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  return { pathname, searchParams: url.searchParams }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw new BadRequestError('Malformed URL path parameter')
  }
}

async function readJsonBodyCapped<T>(
  req: IncomingMessage,
  options: { allowEmpty?: boolean } = {},
): Promise<T> {
  const contentType = firstHeader(req.headers['content-type'])?.trim().toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) {
    throw new UnsupportedMediaTypeError()
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  let overflowed = false

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      if (overflowed) return
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      totalBytes += buf.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        overflowed = true
        reject(new PayloadTooLargeError())
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (!overflowed) resolve()
    })
    req.on('error', (error) => {
      if (!overflowed) reject(error)
    })
  })

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    if (options.allowEmpty) return {} as T
    throw new BadRequestError('JSON request body is required')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BadRequestError('Invalid JSON request body')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestError('JSON body must be an object')
  }
  return parsed as T
}

export function createThreadsHandler(deps: {
  service: ThreadsService
  bus: ThreadsEventBus
  connection?: ConnectionLike
}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const rejection = deps.connection?.requestRejection(req)
      if (rejection !== undefined) {
        sendJson(res, rejection, {
          error: rejection === 401 ? 'Unauthorized' : 'Forbidden',
        })
        return
      }

      const secFetchSite = firstHeader(req.headers['sec-fetch-site'])?.trim().toLowerCase()
      if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        sendJson(res, 403, { error: 'Cross-site requests are not allowed' })
        return
      }

      const method = (req.method ?? 'GET').toUpperCase()
      const { pathname, searchParams } = normalizePath(req.url)

      if (pathname === '/api/events') {
        if (method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        deps.bus.addClient(res)
        return
      }

      if (pathname === '/api/catalog') {
        if (method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        sendJson(res, 200, await deps.service.getCatalog())
        return
      }

      const inspectMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/inspect$/)
      if (inspectMatch) {
        if (method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        const sessionId = decodeSegment(inspectMatch[1])
        sendJson(res, 200, await deps.service.inspectSession(sessionId))
        return
      }

      const treeMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/tree$/)
      if (treeMatch) {
        if (method !== 'GET') {
          sendMethodNotAllowed(res, 'GET')
          return
        }
        const sessionId = decodeSegment(treeMatch[1])
        sendJson(res, 200, await deps.service.getSessionTree(sessionId))
        return
      }

      if (pathname === '/api/side-chats') {
        if (method === 'GET') {
          const parentSessionId = searchParams.get('sessionId')?.trim() ?? ''
          if (!parentSessionId) {
            throw new BadRequestError('sessionId query parameter is required')
          }
          sendJson(res, 200, {
            sideChats: await deps.service.listSideChats(parentSessionId),
          })
          return
        }
        if (method === 'POST') {
          const body = await readJsonBodyCapped<CreateSideChatRequest>(req)
          const wait = searchParams.get('wait') === '1'
          const sideChat = await deps.service.createSideChat(body, { wait })
          sendJson(res, 201, { sideChat })
          return
        }
        sendMethodNotAllowed(res, 'GET, POST')
        return
      }

      const sideMsgMatch = pathname.match(/^\/api\/side-chats\/([^/]+)\/messages$/)
      if (sideMsgMatch) {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const id = decodeSegment(sideMsgMatch[1])
        const body = await readJsonBodyCapped<SendSideChatMessageRequest>(req)
        const wait = searchParams.get('wait') === '1'
        const sideChat = await deps.service.sendSideChatMessage(id, body, { wait })
        sendJson(res, wait ? 200 : 202, { sideChat })
        return
      }

      const sideAbortMatch = pathname.match(/^\/api\/side-chats\/([^/]+)\/abort$/)
      if (sideAbortMatch) {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const id = decodeSegment(sideAbortMatch[1])
        sendJson(res, 200, { aborted: deps.service.abortSideChat(id) })
        return
      }

      const sidePromoteMatch = pathname.match(/^\/api\/side-chats\/([^/]+)\/promote$/)
      if (sidePromoteMatch) {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const id = decodeSegment(sidePromoteMatch[1])
        const body = await readJsonBodyCapped<PromoteSideChatRequest>(req, { allowEmpty: true })
        sendJson(res, 201, await deps.service.promoteSideChat(id, body))
        return
      }

      const sideChatMatch = pathname.match(/^\/api\/side-chats\/([^/]+)$/)
      if (sideChatMatch) {
        const id = decodeSegment(sideChatMatch[1])
        if (method === 'PATCH') {
          const body = await readJsonBodyCapped<UpdateSideChatRequest>(req)
          sendJson(res, 200, { sideChat: await deps.service.updateSideChat(id, body) })
          return
        }
        if (method === 'DELETE') {
          const deleted = await deps.service.deleteSideChat(id)
          if (!deleted) {
            sendJson(res, 404, { error: `Side chat not found: ${id}` })
            return
          }
          sendNoContent(res)
          return
        }
        sendMethodNotAllowed(res, 'PATCH, DELETE')
        return
      }

      if (pathname === '/api/fork') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<ForkSessionRequest>(req)
        sendJson(res, 201, await deps.service.forkSession(body))
        return
      }

      if (pathname === '/api/link') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<LinkSessionsRequest>(req)
        sendJson(res, 201, { edge: await deps.service.linkSessions(body) })
        return
      }

      if (pathname === '/api/edit-retry') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<EditAndRetryRequest>(req)
        sendJson(res, 201, await deps.service.editAndRetry(body))
        return
      }

      if (pathname === '/api/handoff/preview') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<HandoffPreviewRequest>(req)
        sendJson(res, 200, await deps.service.previewHandoff(body))
        return
      }

      if (pathname === '/api/handoff/execute') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<ExecuteHandoffRequest>(req)
        sendJson(res, 201, await deps.service.executeHandoff(body))
        return
      }

      if (pathname === '/api/distill') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<DistillRequest>(req)
        sendJson(res, 200, await deps.service.distillSummary(body))
        return
      }

      if (pathname === '/api/merge-back') {
        if (method !== 'POST') {
          sendMethodNotAllowed(res, 'POST')
          return
        }
        const body = await readJsonBodyCapped<MergeBackRequest>(req)
        sendJson(res, 200, await deps.service.mergeBack(body))
        return
      }

      sendJson(res, 404, { error: `Route not found: ${pathname}` })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.statusCode, {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, 500, { error: message || 'Internal server error' })
    }
  }
}
