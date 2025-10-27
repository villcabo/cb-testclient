import { type NextRequest, NextResponse } from "next/server"
import { webhookStore } from "@/lib/webhook-store"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("[Webhook] Received webhook:", JSON.stringify(body, null, 2))

    // Generar un ID único si no se proporciona txCode
    const txCode = body.txCode || `webhook-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    if (!body.txCode) {
      console.warn("[Webhook] No se proporcionó txCode, generando uno automático:", txCode);
    }

    // Almacenar el webhook
    webhookStore.save({
      type: body.type || "UNKNOWN",
      txCode: txCode,
      externalReferentId: body.externalReferentId || "",
      status: body.status || "UNKNOWN",
      ...body // Incluir cualquier campo adicional
    })

    console.log(`[Webhook] Successfully stored webhook for txCode: ${txCode}`)

    // Responder al sistema externo
    return NextResponse.json({
      success: true,
      txCode: txCode,
      message: "Webhook received and stored successfully"
    })

  } catch (error) {
    console.error("[Webhook] Error processing webhook:", error)
    return NextResponse.json(
      {
        error: "Failed to process webhook",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// GET endpoint para debugging (obtener estadísticas de todos los webhooks)
export async function GET() {
  try {
    const stats = webhookStore.getStats()
    console.log("[Webhook] Retrieved webhook stats:", stats)

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        message: `Total: ${stats.totalWebhooks}, Unread: ${stats.unreadWebhooks}, Read: ${stats.readWebhooks}`
      }
    })
  } catch (error) {
    console.error("[Webhook] Error getting webhook stats:", error)
    return NextResponse.json(
      {
        error: "Failed to get webhook stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
