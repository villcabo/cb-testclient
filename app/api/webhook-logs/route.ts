export const dynamic = "force-dynamic"

import crypto from "crypto"

// Store logs in memory with automatic cleanup
interface WebhookLog {
  id: string
  clientId: string
  timestamp: string
  createdAt: number // Unix timestamp for cleanup
  method: string
  headers: Record<string, string>
  body: any
  type?: string
  status: string
  error?: string
  processedData?: any
  nextAction?: string
  txCode?: string
}

let webhookLogs: WebhookLog[] = []

// Cleanup logs older than 1 hour
function cleanupOldLogs() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000) // 1 hour in milliseconds
  const initialCount = webhookLogs.length
  webhookLogs = webhookLogs.filter(log => log.createdAt > oneHourAgo)

  if (initialCount > webhookLogs.length) {
    console.log(`[webhook-logs] Cleaned up ${initialCount - webhookLogs.length} old logs, ${webhookLogs.length} remaining`)
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupOldLogs, 15 * 60 * 1000)

export async function GET(request: Request) {
  try {
    cleanupOldLogs() // Clean up before serving

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("clientId")
    const txCode = searchParams.get("txCode")

    console.log(`[webhook-logs] GET request - clientId: ${clientId}, txCode: ${txCode}, total logs in memory: ${webhookLogs.length}`)

    if (!clientId) {
      return new Response(JSON.stringify({
        error: "clientId is required",
        logs: []
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    let filteredLogs = webhookLogs.filter(log => log.clientId === clientId)
    console.log(`[webhook-logs] Logs for clientId ${clientId}: ${filteredLogs.length}`)

    if (txCode) {
      filteredLogs = filteredLogs.filter(log =>
        log.txCode === txCode || log.body?.txCode === txCode
      )
      console.log(`[webhook-logs] GET - Client: ${clientId}, TxCode: ${txCode}, found ${filteredLogs.length} logs`)
    } else {
      console.log(`[webhook-logs] GET - Client: ${clientId}, returning all ${filteredLogs.length} logs`)
    }

    // Debug: log all clientIds in memory
    const allClientIds = [...new Set(webhookLogs.map(log => log.clientId))]
    console.log(`[webhook-logs] All clientIds in memory: ${allClientIds.join(', ')}`)

    return new Response(JSON.stringify({ logs: filteredLogs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[webhook-logs] Error getting logs:", error)
    return new Response(JSON.stringify({
      error: "Failed to get logs",
      logs: []
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export async function POST(request: Request) {
  try {
    cleanupOldLogs() // Clean up before adding new log

    const logEntry = await request.json()
    console.log(`[webhook-logs] POST request received:`, JSON.stringify(logEntry, null, 2))

    if (!logEntry.clientId) {
      console.error(`[webhook-logs] Missing clientId in request:`, logEntry)
      return new Response(JSON.stringify({
        error: "clientId is required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    console.log(`[webhook-logs] POST - Adding log for client: ${logEntry.clientId}`)

    const now = Date.now()
    const newLog: WebhookLog = {
      id: logEntry.id || crypto.randomUUID(),
      clientId: logEntry.clientId,
      timestamp: logEntry.timestamp || new Date().toISOString(),
      createdAt: now,
      txCode: logEntry.body?.txCode || logEntry.txCode,
      method: logEntry.method || 'POST',
      headers: logEntry.headers || {},
      body: logEntry.body || {},
      status: logEntry.status || 'success',
      error: logEntry.error,
      processedData: logEntry.processedData,
      nextAction: logEntry.nextAction,
      type: logEntry.type
    }

    console.log(`[webhook-logs] Created log entry:`, JSON.stringify(newLog, null, 2))

    // Add to beginning of array (newest first)
    webhookLogs.unshift(newLog)

    // Keep only last 200 logs per client to prevent memory issues
    const clientLogs = webhookLogs.filter(log => log.clientId === logEntry.clientId)
    if (clientLogs.length > 200) {
      // Remove oldest logs for this client
      const logsToRemove = clientLogs.slice(200)
      webhookLogs = webhookLogs.filter(log =>
        log.clientId !== logEntry.clientId || !logsToRemove.includes(log)
      )
    }

    console.log(`[webhook-logs] Log added successfully for client: ${logEntry.clientId}, total logs: ${webhookLogs.length}, client logs: ${clientLogs.length}`)
    return new Response(JSON.stringify({
      success: true,
      logCount: webhookLogs.filter(log => log.clientId === logEntry.clientId).length
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[webhook-logs] Error adding log:", error)
    return new Response(JSON.stringify({
      error: "Failed to add log"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("clientId")

    if (!clientId) {
      // Clear all logs if no clientId specified (admin operation)
      console.log("[webhook-logs] DELETE - clearing all logs")
      webhookLogs = []
      return new Response(JSON.stringify({
        success: true,
        message: "All logs cleared"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Clear logs only for specific client
    const initialCount = webhookLogs.length
    webhookLogs = webhookLogs.filter(log => log.clientId !== clientId)
    const clearedCount = initialCount - webhookLogs.length

    console.log(`[webhook-logs] DELETE - cleared ${clearedCount} logs for client: ${clientId}`)

    return new Response(JSON.stringify({
      success: true,
      message: `Cleared ${clearedCount} logs for client`,
      clearedCount
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[webhook-logs] Error clearing logs:", error)
    return new Response(JSON.stringify({
      error: "Failed to clear logs"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
