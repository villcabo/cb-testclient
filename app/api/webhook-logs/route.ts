export const dynamic = "force-dynamic"

// Store logs in memory (in production, you might want to use a database)
let webhookLogs: Array<{
  id: string
  timestamp: string
  method: string
  headers: Record<string, string>
  body: any
  type?: string
  status: string
  error?: string
  processedData?: any
  nextAction?: string
  txCode?: string // Added txCode field to track transaction
}> = []

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const txCode = searchParams.get("txCode")

    let filteredLogs = webhookLogs

    if (txCode) {
      filteredLogs = webhookLogs.filter((log) => log.txCode === txCode || log.body?.txCode === txCode)
      console.log(`[v0] GET /api/webhook-logs - filtering by txCode: ${txCode}, found ${filteredLogs.length} logs`)
    } else {
      console.log("[v0] GET /api/webhook-logs - returning all", webhookLogs.length, "logs")
    }

    return new Response(JSON.stringify({ logs: filteredLogs }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("[v0] Error getting webhook logs:", error)
    return new Response(JSON.stringify({ error: "Failed to get logs", logs: [] }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}

export async function POST(request: Request) {
  try {
    const logEntry = await request.json()
    console.log("[v0] POST /api/webhook-logs - adding log:", logEntry.id)

    // Add timestamp and ID if not present
    const newLog = {
      id: logEntry.id || Date.now().toString(),
      timestamp: logEntry.timestamp || new Date().toISOString(),
      txCode: logEntry.body?.txCode || logEntry.txCode,
      ...logEntry,
    }

    // Add to beginning of array (newest first)
    webhookLogs.unshift(newLog)

    // Keep only last 50 logs to prevent memory issues
    if (webhookLogs.length > 50) {
      webhookLogs = webhookLogs.slice(0, 50)
    }

    console.log("[v0] Log added successfully, total logs:", webhookLogs.length)
    return new Response(JSON.stringify({ success: true, logCount: webhookLogs.length }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("[v0] Error adding webhook log:", error)
    return new Response(JSON.stringify({ error: "Failed to add log" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}

export async function DELETE() {
  try {
    console.log("[v0] DELETE /api/webhook-logs - clearing all logs")
    webhookLogs = []
    return new Response(JSON.stringify({ success: true, message: "Logs cleared" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("[v0] Error clearing webhook logs:", error)
    return new Response(JSON.stringify({ error: "Failed to clear logs" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}
