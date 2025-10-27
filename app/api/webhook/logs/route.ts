export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { webhookStore } from "@/lib/webhook-store"

// GET endpoint para consultar webhooks
// Si se proporciona txCode, devuelve el webhook específico
// Si no se proporciona txCode, devuelve todos los webhooks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const txCode = searchParams.get('txCode')

    // Si no hay txCode, devolver todos los webhooks (incluyendo leídos)
    if (!txCode) {
      // Usamos getAny para cada webhook para incluir tanto leídos como no leídos
      const allWebhooks = webhookStore.getAll()
        .filter(webhook => {
          // Filtrar webhooks expirados
          const now = Date.now();
          const oneHour = 60 * 60 * 1000;
          return (now - webhook.timestamp) <= oneHour;
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Ordenar por timestamp descendente

      return NextResponse.json({
        success: true,
        webhooks: allWebhooks,
        count: allWebhooks.length,
        message: `Found ${allWebhooks.length} webhooks`
      });
    }

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

    if (body.action === 'cleanup' || body.action === 'clear_all') {
      // Limpiar todos los webhooks
      webhookStore.clearAll()
      
      return NextResponse.json({
        success: true,
        message: "Todos los webhooks han sido eliminados",
        count: 0,
        webhooks: []
      })
    }

    if (body.action === 'mark_read' && body.txCode) {
      const success = webhookStore.markAsRead(body.txCode)

      return NextResponse.json({
        success,
        message: success ? `Webhook ${body.txCode} marcado como leído` : `No se encontró el webhook ${body.txCode}`,
        txCode: body.txCode
      })
    }

    return NextResponse.json(
      {
        error: "Invalid action",
        details: "Invalid action provided",
      },
      { status: 400 }
    )
  } catch (error) {
    console.error("[WebhookLogs] Error handling POST request:", error)
    return NextResponse.json(
      {
        error: "Failed to handle POST request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
