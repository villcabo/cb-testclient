import { NextRequest } from "next/server"
import crypto from "crypto"

// Store active SSE connections
const connections = new Map<string, ReadableStreamDefaultController>()

export async function GET(request: NextRequest) {
  const clientId = crypto.randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      // Store this connection
      connections.set(clientId, controller)

      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({
        type: 'connection',
        clientId,
        message: 'Conexión SSE establecida'
      })}\n\n`)

      // Keep connection alive with periodic pings
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(`data: ${JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
          })}\n\n`)
        } catch (error) {
          clearInterval(keepAlive)
          connections.delete(clientId)
        }
      }, 30000) // Ping every 30 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        connections.delete(clientId)
        try {
          controller.close()
        } catch (error) {
          // Connection already closed
        }
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}

// Function to broadcast webhook logs to all connected clients
export function broadcastWebhookLog(webhookLog: any) {
  const message = JSON.stringify({
    type: 'webhook-log',
    data: webhookLog
  })

  connections.forEach((controller, clientId) => {
    try {
      controller.enqueue(`data: ${message}\n\n`)
    } catch (error) {
      // Remove dead connections
      connections.delete(clientId)
    }
  })
}
