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

    console.log(`[WebhookLogs] Searching for webhook with txCode: ${txCode}`)

    const webhook = webhookStore.get(txCode)

    if (!webhook) {
      console.log(`[WebhookLogs] No webhook found for txCode: ${txCode}`)
      return NextResponse.json(
        {
          success: false,
          message: "Webhook not found or expired",
          txCode
        },
        { status: 404 }
      )
    }

    console.log(`[WebhookLogs] Found webhook for txCode: ${txCode}`, webhook)

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

// POST endpoint para forzar limpieza (para testing/debugging)
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

    return NextResponse.json(
      { error: "Invalid action" },
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
