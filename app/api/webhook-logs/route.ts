export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { webhookStore } from "@/lib/webhook-store"

// GET endpoint para consultar webhooks por txCode
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const txCode = searchParams.get('txCode')

    if (!txCode) {
      return NextResponse.json(
        { error: "txCode parameter is required" },
        { status: 400 }
      )
    }

    console.log(`[WebhookLogs] Searching for unread webhook with txCode: ${txCode}`)

    const webhook = webhookStore.get(txCode)

    if (!webhook) {
      console.log(`[WebhookLogs] No unread webhook found for txCode: ${txCode}`)
      return NextResponse.json(
        {
          success: false,
          message: "Webhook not found, expired, or already read",
          txCode
        },
        { status: 404 }
      )
    }

    console.log(`[WebhookLogs] Found unread webhook for txCode: ${txCode}`, webhook)

    // Marcar como leído después de encontrarlo
    webhookStore.markAsRead(txCode)
    console.log(`[WebhookLogs] Marked webhook as read for txCode: ${txCode}`)

    return NextResponse.json({
      success: true,
      webhook,
      age: Date.now() - webhook.timestamp
    })

  } catch (error) {
    console.error("[WebhookLogs] Error retrieving webhook:", error)
    return NextResponse.json(
      {
        error: "Failed to retrieve webhook",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// POST endpoint para operaciones especiales
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.action === 'cleanup') {
      webhookStore.forceCleanup()
      const stats = webhookStore.getStats()

      return NextResponse.json({
        success: true,
        message: "Cleanup completed",
        stats
      })
    }

    if (body.action === 'mark_read' && body.txCode) {
      const success = webhookStore.markAsRead(body.txCode)

      return NextResponse.json({
        success,
        message: success ? `Marked txCode ${body.txCode} as read` : `TxCode ${body.txCode} not found`,
        txCode: body.txCode
      })
    }

    if (body.action === 'get_any' && body.txCode) {
      // Obtener webhook independientemente del estado de lectura (para debugging)
      const webhook = webhookStore.getAny(body.txCode)

      return NextResponse.json({
        success: !!webhook,
        webhook,
        message: webhook ? "Webhook found" : "Webhook not found or expired"
      })
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: cleanup, mark_read, get_any" },
      { status: 400 }
    )

  } catch (error) {
    console.error("[WebhookLogs] Error in POST:", error)
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
