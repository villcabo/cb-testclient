import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const authHeader = request.headers.get("authorization")
    const baseUrl = request.headers.get("x-base-url") || "https://stage-api.sintesis.com.bo"

    console.log("[v0] Preview payment request body:", JSON.stringify(body, null, 2))
    console.log("[v0] Authorization header:", authHeader?.substring(0, 20) + "...")
    console.log("[v0] Using base URL:", baseUrl)

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader || "",
      },
      body: JSON.stringify(body),
    })

    console.log("[v0] Preview response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Preview error response:", errorText)
      throw new Error(`Failed to preview payment: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Preview response:", JSON.stringify(data, null, 2))
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Preview error:", error)
    return NextResponse.json(
      {
        error: "Failed to preview payment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const authHeader = request.headers.get("authorization")
    const baseUrl = request.headers.get("x-base-url") || "https://stage-api.sintesis.com.bo"

    console.log("[v0] Set amount request body:", JSON.stringify(body, null, 2))
    console.log("[v0] Using base URL:", baseUrl)

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/preview`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader || "",
      },
      body: JSON.stringify(body),
    })

    console.log("[v0] Set amount response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Set amount error response:", errorText)
      throw new Error(`Failed to set amount: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Set amount response:", JSON.stringify(data, null, 2))
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Set amount error:", error)
    return NextResponse.json(
      {
        error: "Failed to set amount",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
