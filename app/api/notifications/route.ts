import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Simple in-memory storage for webhook notifications with client isolation
let notifications: Array<{
  id: string
  clientId: string
  timestamp: string
  createdAt: number
  data: any
}> = []

// Store client subscriptions
let subscribers: Map<string, {
  clientId: string
  lastCheck: number
  resolve: (value: any) => void
  timeout: NodeJS.Timeout
}> = new Map()

// Cleanup notifications older than 1 hour
function cleanupOldNotifications() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000)
  const initialCount = notifications.length
  notifications = notifications.filter(n => n.createdAt > oneHourAgo)

  if (initialCount > notifications.length) {
    console.log(`[notifications] Cleaned up ${initialCount - notifications.length} old notifications, ${notifications.length} remaining`)
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupOldNotifications, 15 * 60 * 1000)

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  const lastTimestamp = request.nextUrl.searchParams.get('since') || '0'
  const timeout = 30000 // 30 seconds timeout

  if (!clientId) {
    return NextResponse.json({
      error: "clientId is required",
      notifications: [],
      timestamp: Date.now().toString()
    }, { status: 400 })
  }

  cleanupOldNotifications() // Clean before serving

  console.log(`[notifications] Client ${clientId} checking for updates since ${lastTimestamp}`)

  // Check for immediate notifications for this client
  const since = parseInt(lastTimestamp)
  const newNotifications = notifications.filter(n =>
    n.clientId === clientId && parseInt(n.timestamp) > since
  )

  if (newNotifications.length > 0) {
    console.log(`[notifications] Returning ${newNotifications.length} immediate notifications for client ${clientId}`)
    return NextResponse.json({
      notifications: newNotifications,
      timestamp: Date.now().toString()
    })
  }

  // Long polling - wait for new notifications for this specific client
  return new Promise((resolve) => {
    const subscriptionId = `${clientId}_${Date.now()}`

    const timeoutId = setTimeout(() => {
      subscribers.delete(subscriptionId)
      resolve(NextResponse.json({
        notifications: [],
        timestamp: Date.now().toString()
      }))
    }, timeout)

    subscribers.set(subscriptionId, {
      clientId,
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

    // Extract clientId from notification data or headers
    const clientId = notification.data?.clientId ||
                    notification.clientId ||
                    request.headers.get('x-client-id') ||
                    'default-client'

    console.log(`[notifications] New notification received for client: ${clientId}`, notification.type)

    const newNotification = {
      id: crypto.randomUUID(),
      clientId,
      timestamp,
      createdAt: Date.now(),
      data: notification
    }

    // Add notification
    notifications.unshift(newNotification)

    // Keep only last 100 notifications per client
    const clientNotifications = notifications.filter(n => n.clientId === clientId)
    if (clientNotifications.length > 100) {
      const notificationsToRemove = clientNotifications.slice(100)
      notifications = notifications.filter(n =>
        n.clientId !== clientId || !notificationsToRemove.includes(n)
      )
    }

    // Notify all waiting subscribers for this client
    const since = parseInt(timestamp) - 1
    const subscribersToNotify = Array.from(subscribers.entries()).filter(
      ([_, subscriber]) => subscriber.clientId === clientId && subscriber.lastCheck <= since
    )

    subscribersToNotify.forEach(([subscriptionId, subscriber]) => {
      console.log(`[notifications] Notifying subscription ${subscriptionId} for client ${clientId}`)
      subscriber.resolve({
        notifications: [newNotification],
        timestamp
      })
      subscribers.delete(subscriptionId)
    })

    return NextResponse.json({
      success: true,
      id: newNotification.id,
      clientId
    })
  } catch (error) {
    console.error('[notifications] Error:', error)
    return NextResponse.json({
      error: 'Failed to process notification'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')

  if (!clientId) {
    // Clear all notifications if no clientId specified (admin operation)
    console.log('[notifications] Clearing all notifications')
    notifications = []

    // Clear all subscribers
    subscribers.forEach((subscriber) => {
      clearTimeout(subscriber.timeout)
    })
    subscribers.clear()

    return NextResponse.json({ success: true, message: "All notifications cleared" })
  }

  // Clear notifications only for specific client
  const initialCount = notifications.length
  notifications = notifications.filter(n => n.clientId !== clientId)
  const clearedCount = initialCount - notifications.length

  // Clear subscribers for this client
  const subscribersToRemove = Array.from(subscribers.entries()).filter(
    ([_, subscriber]) => subscriber.clientId === clientId
  )

  subscribersToRemove.forEach(([subscriptionId, subscriber]) => {
    clearTimeout(subscriber.timeout)
    subscribers.delete(subscriptionId)
  })

  console.log(`[notifications] Cleared ${clearedCount} notifications and ${subscribersToRemove.length} subscriptions for client: ${clientId}`)

  return NextResponse.json({
    success: true,
    message: `Cleared ${clearedCount} notifications for client`,
    clearedCount
  })
}
