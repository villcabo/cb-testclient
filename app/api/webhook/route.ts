import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

// Función para guardar webhook log en almacenamiento
async function storeWebhookLog(webhookLog: any) {
  try {
    console.log("[Webhook] Storing log:", JSON.stringify(webhookLog, null, 2))

    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhook-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookLog),
    })

    if (!response.ok) {
      console.error("[Webhook] Failed to store log - HTTP", response.status)
      const errorText = await response.text()
      console.error("[Webhook] Error response:", errorText)
    } else {
      console.log("[Webhook] Log stored successfully")
    }
  } catch (error) {
    console.error("[Webhook] Failed to store log:", error)
  }
}

async function sendNotification(webhookLog: any) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "webhook-log",
        data: webhookLog,
        timestamp: new Date().toISOString(),
      }),
    })
  } catch (error) {
    console.error("[Webhook] Failed to send notification:", error)
  }
}

interface WebhookPayload {
  type: "PREVIEW" | "CONFIRM" | "REFUND"
  txCode: string
  externalReferentId: string
  status: string
  clientId?: string // Add clientId to webhook payload
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

    // Extract clientId from headers or body, fallback to a default for external webhooks
    const clientId = body.clientId || headers['x-client-id'] || 'external-webhook'

    console.log("[Backend] Webhook received for client:", clientId, "- Body:", JSON.stringify(body, null, 2))

    let processedData = null
    let nextAction = null

    switch (body.type) {
      case "PREVIEW":
        if (body.status === "READY_TO_CONFIRM") {
          // QR con monto cerrado - mostrar pantalla de confirmación
          processedData = {
            type: "preview_ready",
            txCode: body.txCode,
            externalReferenceId: body.externalReferentId,
            status: body.status,
            localCurrency: body.order?.localCurrency,
            order: body.order,
            collector: body.collector,
          }
          nextAction = "show_confirmation"
          console.log("[Backend] PREVIEW with READY_TO_CONFIRM - Action: show_confirmation")
        } else if (body.status === "WAITING_AMOUNT") {
          // QR con monto abierto - mostrar pantalla de ingreso de monto
          processedData = {
            type: "preview_waiting_amount",
            txCode: body.txCode,
            localCurrency: body.order?.localCurrency,
          }
          nextAction = "show_amount_input"
          console.log("[Backend] PREVIEW with WAITING_AMOUNT - Action: show_amount_input")
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
          console.log("[Backend] CONFIRM with COMPLETED - Action: show_success")
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
          console.log("[Backend] REFUND - Action: show_refund_notification")
        }
        break
    }

    const webhookLog = {
      id: crypto.randomUUID(),
      clientId: clientId, // Include clientId in log
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: headers,
      body: body,
      status: "success",
      processedData,
      nextAction,
      txCode: body.txCode,
    }

    console.log("[Backend] Created webhook log with ID:", webhookLog.id, "for client:", clientId, "- Storing and sending notification...")

    await storeWebhookLog(webhookLog)
    await sendNotification(webhookLog)

    console.log("[Backend] Webhook log stored and notification sent for log ID:", webhookLog.id)

    return NextResponse.json({
      message: "Webhook processed successfully",
      received: body,
      logId: webhookLog.id,
      clientId: clientId,
      processedData,
      nextAction,
    })
  } catch (error) {
    console.error("[Backend] Error processing webhook:", error)

    const errorLog = {
      id: crypto.randomUUID(),
      clientId: 'error-webhook', // Default clientId for error logs
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: Object.fromEntries(request.headers.entries()),
      body: null,
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    }

    await storeWebhookLog(errorLog)
    await sendNotification(errorLog)

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
  const headers = Object.fromEntries(request.headers.entries())
  const clientId = headers['x-client-id'] || 'test-webhook'

  const webhookLog = {
    id: crypto.randomUUID(),
    clientId: clientId,
    timestamp: new Date().toISOString(),
    method: "GET",
    headers: headers,
    body: { test: true, message: "Test webhook call" },
    status: "success",
  }

  console.log("[Webhook] Test webhook called with ID:", webhookLog.id, "for client:", clientId)

  await storeWebhookLog(webhookLog)
  await sendNotification(webhookLog)

  return NextResponse.json({
    message: "Webhook endpoint is active",
    logId: webhookLog.id,
    clientId: clientId,
    logData: webhookLog,
  })
}
