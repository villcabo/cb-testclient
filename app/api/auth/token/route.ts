import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { apiKey, baseUrl } = await request.json()

    console.log("[v0] Attempting to get token with API key:", apiKey?.substring(0, 20) + "...")
    console.log("[v0] Using base URL:", baseUrl)

    const response = await fetch(`${baseUrl}/crossborder/v1/auth/token`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    })

    console.log("[v0] Token response status:", response.status)
    console.log("[v0] Token response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Token error response:", errorText)
      throw new Error(`Failed to get token: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log("[v0] Token received successfully")
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Token error:", error)
    return NextResponse.json(
      {
        error: "Failed to get token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
