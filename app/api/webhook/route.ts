import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

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

async function sendLogToEndpoint(logData: any) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/webhook-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logData),
    })
  } catch (error) {
    console.error("Failed to send log to endpoint:", error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: WebhookPayload = await request.json()
    const headers = Object.fromEntries(request.headers.entries())

    console.log("Webhook received:", JSON.stringify(body, null, 2))

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
      type: body.type,
      status: body.status,
      processedData,
      nextAction,
    }

    await sendLogToEndpoint(webhookLog)

    return NextResponse.json({
      message: "Webhook processed successfully",
      received: body,
      logData: webhookLog,
      processedData,
      nextAction,
    })
  } catch (error) {
    console.error("Webhook error:", error)

    const errorLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: Object.fromEntries(request.headers.entries()),
      body: null,
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    }

    await sendLogToEndpoint(errorLog)

    return NextResponse.json(
      {
        error: "Failed to process webhook",
        logData: errorLog,
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

  await sendLogToEndpoint(webhookLog)

  return NextResponse.json({
    message: "Webhook endpoint is active",
    logData: webhookLog,
  })
}
