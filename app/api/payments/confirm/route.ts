import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const authHeader = request.headers.get("authorization")
    const baseUrl = request.headers.get("x-base-url")

    if (!authHeader) {
      return NextResponse.json(
        { error: "Missing authorization header" },
        { status: 401 },
      )
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: "Missing X-Base-URL header" },
        { status: 400 },
      )
    }

    console.log("[Confirm] Making request to:", `${baseUrl}/crossborder/v1/payments/confirm`)
    console.log("[Confirm] Request body:", JSON.stringify(body, null, 2))

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    })

    console.log("[Confirm] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[Confirm] Error response:", errorText)
      return NextResponse.json(
        {
          error: "Confirm request failed",
          details: errorText,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log("[Confirm] Success response:", JSON.stringify(data, null, 2))

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Confirm] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to process confirmation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
