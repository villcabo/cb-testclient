import { NextRequest } from "next/server"

// Store active SSE connections
const connections = new Map<string, ReadableStreamDefaultController>()

export async function GET(request: NextRequest) {
  const clientId = crypto.randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      // Store this connection
      connections.set(clientId, controller)
      console.log(`[SSE] New connection established: ${clientId}`)

      // Send initial connection message
      const welcomeMessage = {
        type: 'connection',
        clientId,
        message: 'Conexión SSE establecida',
        timestamp: new Date().toISOString()
      }

      controller.enqueue(`data: ${JSON.stringify(welcomeMessage)}\n\n`)

      // Keep connection alive with periodic pings
      const keepAlive = setInterval(() => {
        try {
          const pingMessage = {
            type: 'ping',
            timestamp: new Date().toISOString()
          }
          controller.enqueue(`data: ${JSON.stringify(pingMessage)}\n\n`)
        } catch (error) {
          console.log(`[SSE] Connection ${clientId} closed during ping`)
          clearInterval(keepAlive)
          connections.delete(clientId)
        }
      }, 30000) // Ping every 30 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        console.log(`[SSE] Connection ${clientId} aborted`)
        clearInterval(keepAlive)
        connections.delete(clientId)
        try {
          controller.close()
        } catch (error) {
          // Connection already closed
        }
      })
    },

    cancel() {
      connections.delete(clientId)
      console.log(`[SSE] Connection ${clientId} cancelled`)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    }
  })
}

// Function to broadcast webhook logs to all connected clients
export function broadcastWebhookLog(webhookLog: any) {
  console.log(`[SSE] Broadcasting webhook log to ${connections.size} connected clients`)

  const message = JSON.stringify({
    type: 'webhook-log',
    data: webhookLog,
    timestamp: new Date().toISOString()
  })

  const disconnectedClients: string[] = []

  connections.forEach((controller, clientId) => {
    try {
      controller.enqueue(`data: ${message}\n\n`)
      console.log(`[SSE] Sent webhook log to client ${clientId}`)
    } catch (error) {
      console.log(`[SSE] Failed to send to client ${clientId}, marking for removal`)
      disconnectedClients.push(clientId)
    }
  })

  // Remove disconnected clients
  disconnectedClients.forEach(clientId => {
    connections.delete(clientId)
    console.log(`[SSE] Removed disconnected client ${clientId}`)
  })

  console.log(`[SSE] Active connections after broadcast: ${connections.size}`)
}
