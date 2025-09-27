import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { broadcastWebhookLog } from "../webhook-stream/route"

interface WebhookPayload {
  type: "PREVIEW" | "CONFIRM" | "REFUND"
  txCode: string
  externalReferentId: string
  status: string
  order?: {
    localTotalAmount: number
    localCurrency: string
    userTotalAmount: number
    userCurrency: string
  }
  collector?: {
    name: string
    identificationNumber: string
    branchOffice: string
  }
  completedDate?: string
  refundId?: string
  refundDate?: string
  paymentDate?: string
  amount?: number
  currency?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: WebhookPayload = await request.json()
    const headers = Object.fromEntries(request.headers.entries())

    console.log("[Webhook] Received webhook:", JSON.stringify(body, null, 2))

    let processedData = null
    let nextAction = null

    switch (body.type) {
      case "PREVIEW":
        if (body.status === "READY_TO_CONFIRM") {
          // QR con monto cerrado - mostrar pantalla de confirmación
          processedData = {
            type: "preview_ready",
            txCode: body.txCode,
            order: body.order,
            collector: body.collector,
          }
          nextAction = "show_confirmation"
        } else if (body.status === "WAITING_AMOUNT") {
          // QR con monto abierto - mostrar pantalla de ingreso de monto
          processedData = {
            type: "preview_waiting_amount",
            txCode: body.txCode,
          }
          nextAction = "show_amount_input"
        }
        break

      case "CONFIRM":
        if (body.status === "COMPLETED") {
          // Transacción completada - mostrar pantalla de éxito
          processedData = {
            type: "payment_completed",
            txCode: body.txCode,
            completedDate: body.completedDate,
          }
          nextAction = "show_success"
        }
        break

      case "REFUND":
        if (body.status === "REFOUNDED" || body.status === "PARTIALLY_REFUNDED") {
          // Reembolso procesado
          processedData = {
            type: "refund_processed",
            txCode: body.txCode,
            refundId: body.refundId,
            refundDate: body.refundDate,
            amount: body.amount,
            currency: body.currency,
            isPartial: body.status === "PARTIALLY_REFUNDED",
            paymentDate: body.paymentDate,
          }
          nextAction = "show_refund_notification"
        }
        break
    }

    const webhookLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: headers,
      body: body,
      status: "success",
      processedData,
      nextAction,
    }

    console.log("[Webhook] Created webhook log with ID:", webhookLog.id)

    // Broadcast via SSE instead of storing in memory/database
    broadcastWebhookLog(webhookLog)

    return NextResponse.json({
      message: "Webhook processed successfully",
      received: body,
      logId: webhookLog.id,
      processedData,
      nextAction,
    })
  } catch (error) {
    console.error("[Webhook] Error processing webhook:", error)

    const errorLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: Object.fromEntries(request.headers.entries()),
      body: null,
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    }

    // Broadcast error via SSE
    broadcastWebhookLog(errorLog)

    return NextResponse.json(
      {
        error: "Failed to process webhook",
        logId: errorLog.id,
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  const webhookLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: "GET",
    headers: Object.fromEntries(request.headers.entries()),
    body: null,
    status: "success",
  }

  console.log("[Webhook] Test webhook called with ID:", webhookLog.id)

  // Broadcast test webhook via SSE
  broadcastWebhookLog(webhookLog)

  return NextResponse.json({
    message: "Webhook endpoint is active",
    logId: webhookLog.id,
  })
}
