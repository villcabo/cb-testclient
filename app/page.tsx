"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  QrCode,
  Settings,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  Activity,
  ChevronDown,
  Trash2,
  Eye,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type PaymentStatus = "idle" | "preview" | "waiting_amount" | "ready_to_confirm" | "processing" | "completed" | "error"

interface PaymentData {
  txCode?: string
  externalReferenceId?: string
  status?: string
  localCurrency?: string
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
}

interface WebhookLog {
  id: string
  timestamp: string
  method: string
  headers: Record<string, string>
  body: any
  error?: string
  status: "success" | "error"
  processedData?: any
  nextAction?: string
}

export default function PaymentClient() {
  const [currentScreen, setCurrentScreen] = useState<
    "config" | "qr-input" | "amount-input" | "confirmation" | "processing" | "success"
  >("config") // Inicializar temporalmente en config, se cambiará en useEffect
  const [apiKey, setApiKey] = useState("")
  const [apiBaseUrl, setApiBaseUrl] = useState("https://stage-api.sintesis.com.bo")
  const [token, setToken] = useState("")
  const [qrCode, setQrCode] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentData, setPaymentData] = useState<PaymentData>({})
  const [status, setStatus] = useState<PaymentStatus>("idle")
  const [loading, setLoading] = useState(false)
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [showWebhookLogs, setShowWebhookLogs] = useState(true) // Cambiar a true por defecto para mostrar logs inmediatamente
  const [sseConnectionStatus, setSseConnectionStatus] = useState<"connecting" | "connected" | "disconnected">(
    "disconnected",
  )
  const [notificationStatus, setNotificationStatus] = useState<"inactive" | "connecting" | "active">("inactive")
  const { toast } = useToast()
  const [currentTxCode, setCurrentTxCode] = useState<string | null>(null) // Added to track current transaction

  // Default user data
  const [userData, setUserData] = useState({
    fullName: "John Doe",
    currency: "BOB",
    accountNumber: "234200234",
    taxId: "20125548964",
    email: "john.doe@localhost",
    phone: "71224332",
    gloss: "Pago de prueba",
  })

  useEffect(() => {
    const savedApiKey = localStorage.getItem("payment-api-key")
    const savedApiBaseUrl = localStorage.getItem("payment-api-base-url")
    const savedWebhookLogs = localStorage.getItem("webhook-logs")

    if (savedApiKey) {
      setApiKey(savedApiKey)
    }
    if (savedApiBaseUrl) {
      setApiBaseUrl(savedApiBaseUrl)
    }
    if (savedWebhookLogs) {
      try {
        setWebhookLogs(JSON.parse(savedWebhookLogs))
      } catch (error) {
        console.error("Error loading webhook logs:", error)
      }
    }

    // Determinar pantalla inicial basada en si existen los valores requeridos
    if (savedApiKey && savedApiBaseUrl) {
      setCurrentScreen("qr-input")
    } else {
      setCurrentScreen("config")
    }

    // Inicializar sistema de notificaciones push (Long Polling)
    console.log("[Notifications] Starting push notification system...")
    setNotificationStatus("connecting")

    const clientId = crypto.randomUUID()
    let lastTimestamp = '0'
    let isActive = true

    const startNotificationListener = async () => {
      while (isActive) {
        try {
          console.log(`[Notifications] Checking for updates since ${lastTimestamp}`)
          setNotificationStatus("active")

          const response = await fetch(`/api/notifications?clientId=${clientId}&since=${lastTimestamp}`, {
            signal: AbortSignal.timeout(35000) // 35 second timeout
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          if (data.notifications && data.notifications.length > 0) {
            console.log(`[Notifications] Received ${data.notifications.length} notifications`)

            data.notifications.forEach((notification: any) => {
              if (notification.data.type === 'webhook-log') {
                const webhookLog = notification.data.data

                // Actualizar logs inmediatamente
                setWebhookLogs(prevLogs => {
                  const updatedLogs = [webhookLog, ...prevLogs].slice(0, 50)
                  localStorage.setItem("webhook-logs", JSON.stringify(updatedLogs))
                  return updatedLogs
                })

                // Manejar acciones del webhook si las hay
                if (webhookLog.processedData && webhookLog.nextAction) {
                  console.log('[Notifications] Executing webhook action:', webhookLog.nextAction)
                  handleWebhookAction(webhookLog.processedData, webhookLog.nextAction)
                }

                // Mostrar notificación toast para webhooks importantes
                if (webhookLog.body?.type) {
                  const typeMessages = {
                    'PREVIEW': 'Webhook Preview recibido',
                    'CONFIRM': 'Webhook Confirm recibido',
                    'REFUND': 'Webhook Refund recibido'
                  }

                  toast({
                    title: "Webhook Recibido",
                    description: typeMessages[webhookLog.body.type] || "Nuevo webhook recibido",
                  })
                }
              }
            })
          }

          // Actualizar timestamp para próxima consulta
          if (data.timestamp) {
            lastTimestamp = data.timestamp
          }

        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('[Notifications] Request timeout, retrying...')
          } else {
            console.error('[Notifications] Error:', error)
            setNotificationStatus("inactive")
            // Esperar 5 segundos antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }
      }
    }

    // Iniciar el listener
    startNotificationListener()

    // Cleanup al desmontar el componente
    return () => {
      console.log('[Notifications] Stopping notification system')
      isActive = false
      setNotificationStatus("inactive")
    }
  }, [])

  const saveWebhookLog = (log: WebhookLog) => {
    const updatedLogs = [log, ...webhookLogs].slice(0, 50) // Keep only last 50 logs
    setWebhookLogs(updatedLogs)
    localStorage.setItem("webhook-logs", JSON.stringify(updatedLogs))

    if (log.processedData && log.nextAction) {
      handleWebhookAction(log.processedData, log.nextAction)
    }
  }

  const clearWebhookLogs = async () => {
    setWebhookLogs([])
    localStorage.removeItem("webhook-logs")

    // También limpiar logs del lado del servidor
    try {
      await fetch("/api/webhook-logs", { method: "DELETE" })
    } catch (error) {
      console.error("Error clearing server logs:", error)
    }

    toast({
      title: "Logs limpiados",
      description: "Se han eliminado todos los logs de webhook",
    })
  }

  const testWebhook = async () => {
    try {
      const response = await fetch("/api/webhook", {
        method: "GET",
      })
      const data = await response.json()

      if (data.logData) {
        saveWebhookLog(data.logData)
      }

      toast({
        title: "Webhook probado",
        description: "Se ha enviado una llamada de prueba al webhook",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo probar el webhook",
        variant: "destructive",
      })
    }
  }

  const saveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa una API Key válida",
        variant: "destructive",
      })
      return
    }
    if (!apiBaseUrl.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa una URL base válida",
        variant: "destructive",
      })
      return
    }
    localStorage.setItem("payment-api-key", apiKey)
    localStorage.setItem("payment-api-base-url", apiBaseUrl)
    toast({
      title: "Configuración guardada",
      description: "La API Key y URL base se han guardado correctamente",
    })
    setCurrentScreen("qr-input")
  }

  const getToken = async () => {
    try {
      setLoading(true)
      console.log("[v0] Requesting token...")

      const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl: apiBaseUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || "Error obteniendo token")
      }

      const data = await response.json()
      console.log("[v0] Token received successfully")
      setToken(data.access_token)
      return data.access_token
    } catch (error) {
      console.error("[v0] Token error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo obtener el token de autenticación",
        variant: "destructive",
      })
      throw error
    } finally {
      setLoading(false)
    }
  }

  const previewPayment = async () => {
    try {
      setLoading(true)
      setStatus("preview")

      let authToken = token
      if (!authToken) {
        authToken = await getToken()
      }

      const requestBody = {
        qr: qrCode,
        externalReferenceId: crypto.randomUUID(),
        gloss: userData.gloss,
        user: {
          fullName: userData.fullName,
          currency: userData.currency,
          accountNumber: userData.accountNumber,
          taxId: userData.taxId,
          email: userData.email,
          phone: userData.phone,
        },
      }

      console.log("[v0] Sending preview request:", requestBody)

      const response = await fetch("/api/payments/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Base-URL": apiBaseUrl,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || "Error en preview")
      }

      const data = await response.json()
      console.log("[v0] Preview response received:", data)
      setPaymentData(data)

      if (data.txCode) {
        setCurrentTxCode(data.txCode)
        console.log("[v0] Starting webhook monitoring for txCode:", data.txCode)
      }

      if (data.status === "PENDING_AMOUNT") {
        setStatus("waiting_amount")
        setCurrentScreen("amount-input")
      } else if (data.status === "CLOSED_AMOUNT") {
        setStatus("ready_to_confirm")
        setCurrentScreen("confirmation")
      }
    } catch (error) {
      console.error("[v0] Preview error:", error)
      setStatus("error")
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al procesar el QR",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const setPaymentAmount = async () => {
    try {
      setLoading(true)

      const response = await fetch("/api/payments/preview", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Base-URL": apiBaseUrl,
        },
        body: JSON.stringify({
          txCode: paymentData.txCode,
          amount: Number.parseFloat(amount),
        }),
      })

      if (!response.ok) throw new Error("Error setting amount")

      const data = await response.json()
      if (data.status === "CONFIRMED_AMOUNT") {
        setStatus("ready_to_confirm")
        setCurrentScreen("confirmation")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al establecer el monto",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const confirmPayment = async () => {
    try {
      setLoading(true)
      setStatus("processing")

      const response = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Base-URL": apiBaseUrl,
        },
        body: JSON.stringify({
          txCode: paymentData.txCode,
          externalReferenceId: crypto.randomUUID(),
          status: "accepted",
        }),
      })

      if (!response.ok) throw new Error("Error confirming payment")

      const data = await response.json()
      if (data.status === "PROCESSING") {
        setCurrentScreen("processing") // Wait for COMPLETED webhook
      }
    } catch (error) {
      setStatus("error")
      toast({
        title: "Error",
        description: "Error al confirmar el pago",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setCurrentScreen("qr-input")
    setQrCode("")
    setAmount("")
    setPaymentData({})
    setStatus("idle")
    setCurrentTxCode(null)
    setWebhookLogs([]) // Clear logs when resetting
  }

  const handleWebhookAction = (processedData: any, nextAction: string) => {
    switch (nextAction) {
      case "show_confirmation":
        setPaymentData({
          txCode: processedData.txCode,
          order: processedData.order,
          collector: processedData.collector,
        })
        setStatus("ready_to_confirm")
        setCurrentScreen("confirmation")
        toast({
          title: "QR Procesado",
          description: "Monto cerrado detectado. Confirma el pago.",
        })
        break

      case "show_amount_input":
        setPaymentData({
          txCode: processedData.txCode,
        })
        setStatus("waiting_amount")
        setCurrentScreen("amount-input")
        toast({
          title: "Monto Requerido",
          description: "Ingresa el monto para continuar.",
        })
        break

      case "show_success":
        setPaymentData((prev) => ({
          ...prev,
          completedDate: processedData.completedDate,
        }))
        setStatus("completed")
        setCurrentScreen("success")
        toast({
          title: "Pago Completado",
          description: "La transacción se procesó exitosamente.",
        })
        break

      case "show_refund_notification":
        toast({
          title: processedData.isPartial ? "Reembolso Parcial" : "Reembolso Total",
          description: `${processedData.amount} ${processedData.currency} reembolsado`,
        })
        break
    }
  }

  const renderConfigScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Configuración API</CardTitle>
          <CardDescription>Configura tu API Key y URL base para comenzar a realizar pruebas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiBaseUrl">URL Base de la API</Label>
            <Input
              id="apiBaseUrl"
              type="url"
              placeholder="https://stage-api.sintesis.com.bo"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="crossborder_qa_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <Button onClick={saveApiKey} className="w-full" disabled={!apiKey.trim() || !apiBaseUrl.trim()}>
            Guardar y Continuar
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  const renderQRInputScreen = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Escanear QR de Pago</CardTitle>
          <CardDescription>Ingresa el código QR o escanéalo para procesar el pago</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="qrCode">Código QR</Label>
            <Textarea
              id="qrCode"
              placeholder="00020101021226880014BR.GOV.BCB.PIX..."
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              rows={4}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nombre Completo</Label>
              <Input
                id="fullName"
                value={userData.fullName}
                onChange={(e) => setUserData({ ...userData, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda</Label>
              <Input
                id="currency"
                value={userData.currency}
                onChange={(e) => setUserData({ ...userData, currency: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Número de Cuenta</Label>
              <Input
                id="accountNumber"
                value={userData.accountNumber}
                onChange={(e) => setUserData({ ...userData, accountNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">ID Fiscal</Label>
              <Input
                id="taxId"
                value={userData.taxId}
                onChange={(e) => setUserData({ ...userData, taxId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={userData.email}
                onChange={(e) => setUserData({ ...userData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={userData.phone}
                onChange={(e) => setUserData({ ...userData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gloss">Descripción</Label>
            <Input
              id="gloss"
              value={userData.gloss}
              onChange={(e) => setUserData({ ...userData, gloss: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setCurrentScreen("config")} variant="outline" className="flex-1">
              Configuración
            </Button>
            <Button onClick={previewPayment} className="flex-1" disabled={!qrCode.trim() || loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Procesar QR
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderAmountInputScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-yellow-500" />
          </div>
          <CardTitle>Monto Requerido</CardTitle>
          <CardDescription>El QR requiere que ingreses el monto del pago</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Código de Transacción</div>
            <div className="font-mono text-sm">{paymentData.txCode}</div>
            <div className="text-sm text-muted-foreground mt-2">Moneda Local</div>
            <div className="font-semibold">{paymentData.localCurrency}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={resetFlow} variant="outline" className="flex-1 bg-transparent">
              Cancelar
            </Button>
            <Button onClick={setPaymentAmount} className="flex-1" disabled={!amount || loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar Monto
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderConfirmationScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Confirmar Pago</CardTitle>
          <CardDescription>Revisa los detalles antes de procesar el pago</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Código TX</span>
              <span className="font-mono text-sm">{paymentData.txCode}</span>
            </div>

            {paymentData.order && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monto Local</span>
                  <span className="font-semibold">
                    {paymentData.order.localTotalAmount} {paymentData.order.localCurrency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monto Usuario</span>
                  <span className="font-semibold">
                    {paymentData.order.userTotalAmount} {paymentData.order.userCurrency}
                  </span>
                </div>
              </>
            )}

            {paymentData.collector && (
              <>
                <Separator />
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Cobrador</div>
                  <div className="font-semibold">{paymentData.collector.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {paymentData.collector.identificationNumber} - {paymentData.collector.branchOffice}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={resetFlow} variant="outline" className="flex-1 bg-transparent">
              Cancelar
            </Button>
            <Button onClick={confirmPayment} className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar Pago
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderProcessingScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
          <CardTitle>Procesando Pago</CardTitle>
          <CardDescription>Esperando confirmación del procesamiento...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-center">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              PROCESSING
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">Código: {paymentData.txCode}</div>
            <div className="mt-2 text-sm text-muted-foreground">El pago está siendo procesado. Por favor espera...</div>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Monitoreando webhooks automáticamente</span>
          </div>

          <Button onClick={resetFlow} variant="outline" className="w-full bg-transparent">
            Cancelar y Volver
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  const renderSuccessScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <CardTitle>Pago Completado</CardTitle>
          <CardDescription>El pago se ha procesado exitosamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              COMPLETED
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">Código: {paymentData.txCode}</div>
            {paymentData.completedDate && (
              <div className="mt-2 text-sm text-muted-foreground">
                Completado: {new Date(paymentData.completedDate).toLocaleString()}
              </div>
            )}
          </div>

          <Button onClick={resetFlow} className="w-full">
            Nuevo Pago
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  const renderWebhookLogsPanel = () => (
    <Card className="h-full">
      <Collapsible open={showWebhookLogs} onOpenChange={setShowWebhookLogs}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">Logs de Webhook</CardTitle>
                  <CardDescription>{webhookLogs.length} llamadas registradas</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      notificationStatus === "active" ? "bg-green-500" :
                      notificationStatus === "connecting" ? "bg-yellow-500 animate-pulse" :
                      "bg-red-500"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {notificationStatus === "active" ? "Push Activo" :
                     notificationStatus === "connecting" ? "Conectando..." :
                     "Desconectado"}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {webhookLogs.filter((log) => log.status === "success").length} exitosas
                </Badge>
                <ChevronDown className={`w-4 h-4 transition-transform ${showWebhookLogs ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 h-[calc(100vh-320px)]">
            <div className="flex gap-2 mb-4">
              <Button onClick={testWebhook} variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                Probar Webhook
              </Button>
              <Button onClick={clearWebhookLogs} variant="outline" size="sm" disabled={webhookLogs.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar Logs
              </Button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No hay llamadas de webhook registradas</p>
                <p className="text-sm">Las llamadas aparecerán aquí automáticamente</p>
              </div>
            ) : (
              <div className="space-y-3 h-full overflow-y-auto pr-2">
                {webhookLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-xs">
                          {log.method}
                        </Badge>
                        {log.body?.type && (
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              log.body.type === "PREVIEW"
                                ? "bg-blue-100 text-blue-800"
                                : log.body.type === "CONFIRM"
                                  ? "bg-green-100 text-green-800"
                                  : log.body.type === "REFUND"
                                    ? "bg-orange-100 text-orange-800"
                                    : ""
                            }`}
                          >
                            {log.body.type}
                          </Badge>
                        )}
                        {log.body?.status && (
                          <Badge variant="outline" className="text-xs">
                            {log.body.status}
                          </Badge>
                        )}
                        <span className="text-sm font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <Badge variant="outline" className={log.status === "success" ? "text-green-600" : "text-red-600"}>
                        {log.status}
                      </Badge>
                    </div>

                    {log.body?.txCode && (
                      <div className="text-sm bg-muted p-2 rounded">
                        <strong>TX Code:</strong> <span className="font-mono">{log.body.txCode}</span>
                        {log.body.externalReferentId && (
                          <>
                            <br />
                            <strong>External Ref:</strong>{" "}
                            <span className="font-mono">{log.body.externalReferentId}</span>
                          </>
                        )}
                      </div>
                    )}

                    {log.error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                        <strong>Error:</strong> {log.error}
                      </div>
                    )}

                    {log.nextAction && (
                      <div className="text-sm text-blue-600 bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
                        <strong>Acción:</strong> {log.nextAction}
                      </div>
                    )}

                    {log.body && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-xs">
                            Ver Detalles Completos <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="text-sm mt-2">
                            <div className="font-medium mb-1">Body:</div>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.body, null, 2)}
                            </pre>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs">
                          Ver Headers <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="text-sm mt-2">
                          <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.headers, null, 2)}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Barra superior compacta */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Cliente de Pruebas</h1>
              <p className="text-xs text-muted-foreground">API de pagos cross-border</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        {currentScreen === "config" ? (
          // Pantalla de configuración en pantalla completa
          renderConfigScreen()
        ) : (
          // Layout de dos columnas para las demás pantallas
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
            {/* Columna izquierda - Logs de Webhook */}
            <div className="order-2 lg:order-1">{renderWebhookLogsPanel()}</div>

            {/* Columna derecha - Formulario */}
            <div className="order-1 lg:order-2 flex items-start">
              <div className="w-full">
                {currentScreen === "qr-input" && renderQRInputScreen()}
                {currentScreen === "amount-input" && renderAmountInputScreen()}
                {currentScreen === "confirmation" && renderConfirmationScreen()}
                {currentScreen === "processing" && renderProcessingScreen()}
                {currentScreen === "success" && renderSuccessScreen()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
