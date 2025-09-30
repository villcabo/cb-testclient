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

    console.log("[Preview] Making request to:", `${baseUrl}/crossborder/v1/payments/preview`)
    console.log("[Preview] Request body:", JSON.stringify(body, null, 2))

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    })

    console.log("[Preview] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[Preview] Error response:", errorText)
      return NextResponse.json(
        {
          error: "Preview request failed",
          details: errorText,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log("[Preview] Success response:", JSON.stringify(data, null, 2))

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Preview] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to process preview",
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

    console.log("[Preview PUT] Making request to:", `${baseUrl}/crossborder/v1/payments/preview`)
    console.log("[Preview PUT] Request body:", JSON.stringify(body, null, 2))

    const response = await fetch(`${baseUrl}/crossborder/v1/payments/preview`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    })

    console.log("[Preview PUT] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[Preview PUT] Error response:", errorText)
      return NextResponse.json(
        {
          error: "Preview update failed",
          details: errorText,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log("[Preview PUT] Success response:", JSON.stringify(data, null, 2))

    return NextResponse.json(data)
  } catch (error) {
    console.error("[Preview PUT] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to update preview",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
