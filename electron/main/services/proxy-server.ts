import * as http from 'http'
import * as net from 'net'
import { URL } from 'url'
import { EventEmitter } from 'events'

export interface ProxyRule {
  method: string // GET, POST, *, etc.
  pathPattern: string // e.g. /api/trumpet-user/admin/** or /api/users/{id}
  regex?: RegExp
  targetPort: number
  targetHost: string
  source: 'auto' | 'manual' | 'swagger'
  description?: string
  stripPrefix?: string // prefix to strip from path when forwarding, e.g. "/api"
}

export interface ProxyLogEntry {
  id: string
  timestamp: number
  method: string
  path: string
  matched: boolean
  targetHost: string
  targetPort: number
  statusCode?: number
  duration?: number
}

export class ProxyServer extends EventEmitter {
  private server: http.Server | null = null
  private rules: ProxyRule[] = []
  private frontendTarget: { host: string; port: number } = {
    host: 'localhost',
    port: 3000
  }
  private logCounter = 0

  constructor(private port: number = 9000) {
    super()
  }

  setRules(rules: ProxyRule[]): void {
    this.rules = rules.map((rule) => ({
      ...rule,
      regex: this.patternToRegex(rule.pathPattern)
    }))
  }

  setFrontendTarget(host: string, port: number): void {
    this.frontendTarget = { host, port }
  }

  private patternToRegex(pattern: string): RegExp {
    // Convert path pattern to regex
    // /api/users/** → /api/users/.*
    // /api/users/{id} → /api/users/[^/]+
    // /api/users/* → /api/users/[^/]+
    let regex = pattern
      .replace(/\*\*/g, '§DOUBLESTAR§')
      .replace(/\*/g, '[^/]+')
      .replace(/§DOUBLESTAR§/g, '.*')
      .replace(/\{[^}]+\}/g, '[^/]+')

    return new RegExp(`^${regex}$`)
  }

  private matchRule(method: string, path: string): ProxyRule | null {
    for (const rule of this.rules) {
      if (rule.method !== '*' && rule.method.toUpperCase() !== method.toUpperCase()) {
        continue
      }
      if (rule.regex && rule.regex.test(path)) {
        return rule
      }
    }
    return null
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      // Handle WebSocket upgrade for HMR
      this.server.on('upgrade', (req, socket, head) => {
        this.handleWebSocketUpgrade(req, socket as net.Socket, head)
      })

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(this.port, () => {
        console.log(`[Proxy] Server started on :${this.port}, ${this.rules.length} rules loaded, frontend -> :${this.frontendTarget.port}`)
        this.emit('started', this.port)
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null
          this.emit('stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const startTime = Date.now()
    const method = req.method || 'GET'
    const url = req.url || '/'
    const parsedUrl = new URL(url, `http://localhost:${this.port}`)
    const path = parsedUrl.pathname

    const matchedRule = this.matchRule(method, path)

    let targetHost: string
    let targetPort: number

    if (matchedRule) {
      targetHost = matchedRule.targetHost
      targetPort = matchedRule.targetPort
    } else {
      targetHost = this.frontendTarget.host
      targetPort = this.frontendTarget.port
    }

    // Apply path rewriting: strip prefix when forwarding to backend
    let forwardUrl = url
    if (matchedRule?.stripPrefix && path.startsWith(matchedRule.stripPrefix)) {
      const rewrittenPath = path.slice(matchedRule.stripPrefix.length) || '/'
      // Preserve query string
      const queryString = parsedUrl.search || ''
      forwardUrl = rewrittenPath + queryString
    }

    // Proxy the request
    const proxyReq = http.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: forwardUrl,
        method: method,
        headers: {
          ...req.headers,
          host: `${targetHost}:${targetPort}`
        }
      },
      (proxyRes) => {
        // Add CORS headers if proxying to backend
        if (matchedRule) {
          proxyRes.headers['access-control-allow-origin'] = '*'
          proxyRes.headers['access-control-allow-methods'] =
            'GET, POST, PUT, DELETE, PATCH, OPTIONS'
          proxyRes.headers['access-control-allow-headers'] =
            'Content-Type, Authorization, X-Requested-With'
          proxyRes.headers['access-control-allow-credentials'] = 'true'
        }

        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
        proxyRes.pipe(res)

        // Log entry
        const logEntry: ProxyLogEntry = {
          id: `log-${++this.logCounter}`,
          timestamp: startTime,
          method,
          path,
          matched: !!matchedRule,
          targetHost,
          targetPort,
          statusCode: proxyRes.statusCode,
          duration: Date.now() - startTime
        }
        this.emit('request', logEntry)
      }
    )

    proxyReq.on('error', (err) => {
      const logEntry: ProxyLogEntry = {
        id: `log-${++this.logCounter}`,
        timestamp: startTime,
        method,
        path,
        matched: !!matchedRule,
        targetHost,
        targetPort,
        statusCode: 502,
        duration: Date.now() - startTime
      }
      this.emit('request', logEntry)

      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Bad Gateway',
          message: `Failed to connect to ${targetHost}:${targetPort}`,
          detail: err.message
        })
      )
    })

    // Handle CORS preflight
    if (method === 'OPTIONS' && matchedRule) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400'
      })
      res.end()
      proxyReq.destroy()
      return
    }

    req.pipe(proxyReq)
  }

  private handleWebSocketUpgrade(
    req: http.IncomingMessage,
    socket: net.Socket,
    head: Buffer
  ): void {
    const url = req.url || '/'
    const path = new URL(url, `http://localhost:${this.port}`).pathname
    const method = req.method || 'GET'

    // WebSocket requests for HMR should always go to frontend
    const matchedRule = this.matchRule(method, path)
    const targetHost = matchedRule
      ? matchedRule.targetHost
      : this.frontendTarget.host
    const targetPort = matchedRule
      ? matchedRule.targetPort
      : this.frontendTarget.port

    const proxySocket = net.connect(targetPort, targetHost, () => {
      // Reconstruct the HTTP UPGRADE request
      const headers = Object.entries(req.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n')

      proxySocket.write(
        `${req.method} ${url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`
      )

      if (head.length > 0) {
        proxySocket.write(head)
      }

      proxySocket.pipe(socket)
      socket.pipe(proxySocket)
    })

    proxySocket.on('error', () => {
      socket.end()
    })

    socket.on('error', () => {
      proxySocket.end()
    })
  }

  getPort(): number {
    return this.port
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }
}
