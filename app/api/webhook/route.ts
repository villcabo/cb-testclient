import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const headers = Object.fromEntries(request.headers.entries())

    console.log("Webhook received:", JSON.stringify(body, null, 2))

    const webhookLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: "POST",
      headers: headers,
      body: body,
      status: "success",
    }

    // Here you would typically:
    // 1. Validate the webhook signature
    // 2. Process the webhook data
    // 3. Update your database
    // 4. Send notifications to the frontend via WebSocket/SSE

    // For now, we'll just log it and return success
    return NextResponse.json({
      message: "Webhook processed successfully",
      received: body,
      logData: webhookLog,
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

  return NextResponse.json({
    message: "Webhook endpoint is active",
    logData: webhookLog,
  })
}
