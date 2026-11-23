import type { ServerResponse } from 'node:http'
import type { ThreadsSseEvent } from '../shared/types.ts'

export class ThreadsEventBus {
  private readonly clients = new Set<ServerResponse>()
  private pingTimer: ReturnType<typeof setInterval> | undefined

  addClient(res: ServerResponse): void {
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('connection', 'keep-alive')
    res.setHeader('x-accel-buffering', 'no')
    res.writeHead(200)
    res.socket?.setNoDelay?.(true)
    res.flushHeaders?.()
    res.write(': connected\n\n')
    this.clients.add(res)

    const cleanup = () => {
      this.clients.delete(res)
      if (this.clients.size === 0 && this.pingTimer) {
        clearInterval(this.pingTimer)
        this.pingTimer = undefined
      }
    }

    res.on('close', cleanup)
    res.on('error', cleanup)

    if (!this.pingTimer) {
      this.pingTimer = setInterval(() => {
        for (const client of [...this.clients]) {
          try {
            client.write(': ping\n\n')
          } catch {
            this.clients.delete(client)
          }
        }
      }, 25_000)
      this.pingTimer.unref()
    }
  }

  emit(event: ThreadsSseEvent): void {
    if (this.clients.size === 0) return
    const payload = `event: message\ndata: ${JSON.stringify(event)}\n\n`
    for (const client of [...this.clients]) {
      try {
        client.write(payload)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  clientCount(): number {
    return this.clients.size
  }

  close(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = undefined
    }
    for (const client of [...this.clients]) {
      try {
        client.end()
      } catch {
        // Ignore stream close errors during teardown.
      }
    }
    this.clients.clear()
  }
}
