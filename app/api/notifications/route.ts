import { NextRequest, NextResponse } from "next/server"

// Simple in-memory storage for webhook notifications
let notifications: Array<{
  id: string
  timestamp: string
  data: any
}> = []

// Store client subscriptions
let subscribers: Map<string, {
  lastCheck: number
  resolve: (value: any) => void
  timeout: NodeJS.Timeout
}> = new Map()

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') || crypto.randomUUID()
  const lastTimestamp = request.nextUrl.searchParams.get('since') || '0'
  const timeout = 30000 // 30 seconds timeout

  console.log(`[Notifications] Client ${clientId} checking for updates since ${lastTimestamp}`)

  // Check for immediate notifications
  const since = parseInt(lastTimestamp)
  const newNotifications = notifications.filter(n =>
    parseInt(n.timestamp) > since
  )

  if (newNotifications.length > 0) {
    console.log(`[Notifications] Returning ${newNotifications.length} immediate notifications`)
    return NextResponse.json({
      notifications: newNotifications,
      timestamp: Date.now().toString()
    })
  }

  // Long polling - wait for new notifications
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      subscribers.delete(clientId)
      resolve(NextResponse.json({
        notifications: [],
        timestamp: Date.now().toString()
      }))
    }, timeout)

    subscribers.set(clientId, {
      lastCheck: since,
      resolve: (data) => {
        clearTimeout(timeoutId)
        resolve(NextResponse.json(data))
      },
      timeout: timeoutId
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    const notification = await request.json()
    const timestamp = Date.now().toString()

    console.log(`[Notifications] New notification received:`, notification.type)

    const newNotification = {
      id: crypto.randomUUID(),
      timestamp,
      data: notification
    }

    // Add notification
    notifications.unshift(newNotification)
    notifications = notifications.slice(0, 100) // Keep only last 100

    // Notify all waiting subscribers
    const since = parseInt(timestamp) - 1
    subscribers.forEach((subscriber, clientId) => {
      if (subscriber.lastCheck <= since) {
        console.log(`[Notifications] Notifying client ${clientId}`)
        subscriber.resolve({
          notifications: [newNotification],
          timestamp
        })
        subscribers.delete(clientId)
      }
    })

    return NextResponse.json({ success: true, id: newNotification.id })
  } catch (error) {
    console.error('[Notifications] Error:', error)
    return NextResponse.json({ error: 'Failed to process notification' }, { status: 500 })
  }
}

export async function DELETE() {
  console.log('[Notifications] Clearing all notifications')
  notifications = []

  // Clear all subscribers
  subscribers.forEach((subscriber) => {
    clearTimeout(subscriber.timeout)
  })
  subscribers.clear()

  return NextResponse.json({ success: true })
}
