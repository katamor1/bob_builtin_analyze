export interface JsonRpcMessage {
  jsonrpc?: "2.0"
  id?: string | number | null
  method?: string
  params?: unknown
  result?: unknown
  error?: unknown
}

export function respond(id: JsonRpcMessage["id"], result: unknown): void {
  if (id === undefined) return
  write({ jsonrpc: "2.0", id, result })
}

export function respondError(id: JsonRpcMessage["id"], code: number, message: string): void {
  if (id === undefined) return
  write({ jsonrpc: "2.0", id, error: { code, message } })
}

function write(message: JsonRpcMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

export class McpStdioReader {
  private buffer = Buffer.alloc(0)
  private discardingOversizedLine = false

  constructor(
    private readonly onMessage: (message: JsonRpcMessage) => void | Promise<void>,
    private readonly maxRequestBytes: number,
    private readonly onProtocolError: (code: number, message: string) => void = (code, message) => respondError(null, code, message)
  ) {}

  push(chunk: Buffer): void {
    let offset = 0
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset)
      const end = newline === -1 ? chunk.length : newline
      if (this.discardingOversizedLine) {
        if (newline === -1) return
        this.discardingOversizedLine = false
        offset = newline + 1
        continue
      }
      const part = chunk.subarray(offset, end)
      const length = this.buffer.length + part.length
      const lastByte = part.length ? part[part.length - 1] : this.buffer[this.buffer.length - 1]
      const contentLength = length - (lastByte === 13 ? 1 : 0)
      if (contentLength > this.maxRequestBytes) {
        this.buffer = Buffer.alloc(0)
        this.discardingOversizedLine = newline === -1
        this.onProtocolError(-32000, `Request exceeds maximum ${this.maxRequestBytes} bytes.`)
        if (newline === -1) return
        offset = newline + 1
        continue
      }
      this.buffer = Buffer.concat([this.buffer, part])
      if (newline === -1) return
      const body = this.buffer.subarray(0, contentLength).toString("utf8")
      this.buffer = Buffer.alloc(0)
      offset = newline + 1
      if (!body.trim()) continue
      let message: JsonRpcMessage
      try {
        message = JSON.parse(body)
      } catch (error) {
        this.onProtocolError(-32700, `Parse error: ${formatError(error)}`)
        continue
      }

      void Promise.resolve(this.onMessage(message)).catch((error) => {
        process.stderr.write(`message handling error: ${formatError(error)}\n`)
      })
    }
  }

}
