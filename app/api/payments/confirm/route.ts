import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const authHeader = request.headers.get("authorization")
    const baseUrl = request.headers.get("x-base-url") || "https://stage.api.sintesis.com.bo"

    console.log("[v0] Confirm payment request body:", JSON.stringify(body, null, 2))
    console.log("[v0] Using base URL:", baseUrl)

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader || "",
      },
      body: JSON.stringify(body),
    })

    console.log("[v0] Confirm response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Confirm error response:", errorText)
      throw new Error(`Failed to confirm payment: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Confirm response:", JSON.stringify(data, null, 2))
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Confirm error:", error)
    return NextResponse.json(
      {
        error: "Failed to confirm payment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
