"use client"

import { useState, useEffect, useRef } from "react"
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
  X,
  Code2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type PaymentStatus = "idle" | "preview" | "waiting_amount" | "ready_to_confirm" | "processing" | "completed" | "cancelled" | "error"

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

// Función para generar y obtener ID único del cliente basado en el navegador
function getClientId(): string {
  if (typeof window === 'undefined') return 'server-side'

  let clientId = localStorage.getItem('client-id')

  if (!clientId) {
    // Generar ID único basado en información del navegador
    const browserInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory || 0,
      timestamp: Date.now(),
      random: Math.random().toString(36).substring(2, 15)
    }

    // Crear hash simple del fingerprint del navegador
    const fingerprint = JSON.stringify(browserInfo)
    let hash = 0
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }

    clientId = `client_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`
    localStorage.setItem('client-id', clientId)
    console.log('[Client] Generated new client ID:', clientId)
  }

  return clientId
}

export default function PaymentClient() {
  const [currentScreen, setCurrentScreen] = useState<
    "config" | "qr-input" | "waiting-webhook" | "amount-input" | "confirmation" | "processing" | "success" | "cancelled"
  >("config") // Inicializar temporalmente en config, se cambiará en useEffect
  const [apiKey, setApiKey] = useState("")
  const [apiBaseUrl, setApiBaseUrl] = useState("https://stage-api.sintesis.com.bo")
  const [token, setToken] = useState("")
  const [qrCode, setQrCode] = useState("00020101021102080000000041370012com.TESTbind98113069226478599020143220018B00000461195ET000Z5015001130707101020512600220000531909000067076630520454115802AR5918GRANJAS CARNAVE SA6012BUENOS AIRES61041000530303262100706S0301281050001Z6304F127")
  const [amount, setAmount] = useState("")
  const [paymentData, setPaymentData] = useState<PaymentData>({})
  const [status, setStatus] = useState<PaymentStatus>("idle")
  const [loading, setLoading] = useState(false)
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [showWebhookLogs, setShowWebhookLogs] = useState(false) // Cambiar a false para ocultar por defecto
  const [showWebhookModal, setShowWebhookModal] = useState(false) // Estado para el modal de logs
  const [isPolling, setIsPolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()
  const [currentTxCode, setCurrentTxCode] = useState<string | null>(null) // Added to track current transaction
  const [clientId, setClientId] = useState<string>('')

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
    // Inicializar clientId al cargar la página
    const id = getClientId()
    setClientId(id)
    console.log('[Client] Using client ID:', id)

    const savedApiKey = localStorage.getItem("payment-api-key")
    const savedApiBaseUrl = localStorage.getItem("payment-api-base-url")
    const savedWebhookLogs = localStorage.getItem(`webhook-logs-${id}`) // Usar clientId específico

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
  }, [])

  useEffect(() => {
    if (!currentTxCode || !isPolling) {
      return
    }

    console.log(`[Polling] Starting polling for txCode: ${currentTxCode}`)

    const pollWebhooks = async () => {
      try {
        // Usar solo txCode en lugar de clientId + txCode
        const response = await fetch(`/api/webhook-logs?txCode=${currentTxCode}`)

        if (!response.ok) {
          console.error(`[Polling] Error: HTTP ${response.status}`)
          return
        }

        const data = await response.json()

        // Verificar si encontró el webhook (nueva estructura de respuesta)
        if (data.success && data.webhook) {
          console.log(`[Polling] Found webhook for txCode: ${currentTxCode}`, data.webhook)

          // Procesar directamente el webhook encontrado
          const webhook = data.webhook

          // Determinar la acción basada en el tipo y estado del webhook
          let nextAction = null
          let processedData = null

          if (webhook.type === "PREVIEW" && webhook.status === "READY_TO_CONFIRM") {
            nextAction = "show_confirmation"
            processedData = {
              type: "preview_ready",
              txCode: webhook.txCode,
              externalReferenceId: webhook.externalReferentId,
              status: webhook.status,
              localCurrency: webhook.order?.localCurrency || webhook.localCurrency,
              order: webhook.order,
              collector: webhook.collector,
            }
            console.log("[Polling] READY_TO_CONFIRM webhook received - showing confirmation screen")
          } else if (webhook.type === "PREVIEW" && webhook.status === "WAITING_AMOUNT") {
            nextAction = "show_amount_input"
            processedData = {
              type: "preview_waiting_amount",
              txCode: webhook.txCode,
              localCurrency: webhook.localCurrency,
            }
            console.log("[Polling] WAITING_AMOUNT webhook received - showing amount input screen")
          } else if (webhook.type === "CONFIRM" && webhook.status === "COMPLETED") {
            nextAction = "show_success"
            processedData = {
              type: "payment_completed",
              txCode: webhook.txCode,
              completedDate: webhook.completedDate,
            }
            console.log("[Polling] COMPLETED webhook received - showing success screen")
          } else if (webhook.type === "CONFIRM" && webhook.status === "CANCELLED") {
            nextAction = "show_cancelled"
            processedData = {
              type: "payment_cancelled",
              txCode: webhook.txCode,
              externalReferenceId: webhook.externalReferentId,
              status: webhook.status,
            }
            console.log("[Polling] CANCELLED webhook received - showing cancellation screen")
          } else {
            console.log(`[Polling] Unhandled webhook state: ${webhook.type} - ${webhook.status}`)
          }

          // Agregar webhook a los logs locales para mostrar en la vista
          const webhookLog = {
            id: `webhook-${Date.now()}`,
            timestamp: new Date().toISOString(),
            method: "WEBHOOK",
            headers: {},
            body: webhook,
            status: "success" as const
          }
          setWebhookLogs(prev => [webhookLog, ...prev])

          if (nextAction && processedData) {
            console.log("[Polling] Processing webhook action:", nextAction)
            handleWebhookAction(processedData, nextAction)

            // Stop polling after receiving expected webhook
            if (
              nextAction === "show_confirmation" ||
              nextAction === "show_amount_input" ||
              nextAction === "show_success" ||
              nextAction === "show_cancelled"
            ) {
              setIsPolling(false)
            }
          }
        } else {
          console.log(`[Polling] No webhook found for txCode: ${currentTxCode}`)
        }
      } catch (error) {
        console.error("[Polling] Error:", error)
      }
    }

    // Poll immediately
    pollWebhooks()

    // Then poll every 2 seconds
    pollingIntervalRef.current = setInterval(pollWebhooks, 2000)

    return () => {
      if (pollingIntervalRef.current) {
        console.log("[Polling] Stopping polling")
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [currentTxCode, isPolling]) // Removed clientId dependency

  const saveWebhookLog = (log: WebhookLog) => {
    const updatedLogs = [log, ...webhookLogs].slice(0, 50) // Keep only last 50 logs
    setWebhookLogs(updatedLogs)
    localStorage.setItem(`webhook-logs-${clientId}`, JSON.stringify(updatedLogs))

    if (log.processedData && log.nextAction) {
      handleWebhookAction(log.processedData, log.nextAction)
    }
  }

  const clearWebhookLogs = async () => {
    setWebhookLogs([])
    localStorage.removeItem(`webhook-logs-${clientId}`)

    toast({
      title: "Logs limpiados",
      description: "Se han eliminado todos los logs de webhook",
    })
  }

  const testWebhook = async () => {
    try {
      // Simular un webhook de prueba usando el nuevo sistema
      const testWebhookData = {
        type: "PREVIEW",
        txCode: `test-${Date.now()}`,
        externalReferentId: `test-ref-${Date.now()}`,
        status: "WAITING_AMOUNT"
      }

      const response = await fetch("/api/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(testWebhookData)
      })

      if (response.ok) {
        toast({
          title: "Webhook probado",
          description: `Se ha creado un webhook de prueba con txCode: ${testWebhookData.txCode}`,
        })

        // Agregar el webhook de prueba a los logs locales para visualización
        const testLog = {
          id: `test-${Date.now()}`,
          timestamp: new Date().toISOString(),
          method: "POST",
          headers: {},
          body: testWebhookData,
          status: "success" as const
        }
        setWebhookLogs(prev => [testLog, ...prev])
      } else {
        throw new Error("Error en respuesta del webhook")
      }
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
    }
    // Quitar el finally con setLoading(false) - el loading se maneja en previewPayment
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

      if (data.txCode) {
        setCurrentTxCode(data.txCode)
        setPaymentData({ txCode: data.txCode })
        console.log("[v0] TxCode received:", data.txCode, "- Starting polling for webhooks...")

        setIsPolling(true)
        setCurrentScreen("waiting-webhook")

        toast({
          title: "Procesando QR",
          description: "Esperando respuesta del webhook...",
        })
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

      console.log("[v0] Amount set successfully, waiting for webhook with READY_TO_CONFIRM status...")

      // Volver a la pantalla de espera y continuar polling
      setCurrentScreen("waiting-webhook")
      setIsPolling(true)

      toast({
        title: "Monto Confirmado",
        description: "Esperando confirmación del servidor...",
      })
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
        setIsPolling(true)
        setCurrentScreen("processing")
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

  const rejectPayment = async () => {
    try {
      setLoading(true)

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
          status: "rejected",
        }),
      })

      if (!response.ok) throw new Error("Error rejecting payment")

      console.log("[v0] Payment rejected successfully - showing cancellation screen directly")

      // Actualizar datos y mostrar pantalla de cancelación directamente
      setPaymentData((prev) => ({
        ...prev,
        status: "CANCELLED",
      }))
      setStatus("cancelled")
      setCurrentScreen("cancelled")

      toast({
        title: "Pago Rechazado",
        description: "La transacción ha sido rechazada exitosamente.",
        variant: "destructive",
      })
    } catch (error) {
      setStatus("error")
      toast({
        title: "Error",
        description: "Error al rechazar el pago",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setIsPolling(false)
    setCurrentScreen("qr-input")
    setQrCode("")
    setAmount("")
    setPaymentData({})
    setStatus("idle")
    setCurrentTxCode(null)
    setWebhookLogs([])
  }

  const handleWebhookAction = (processedData: any, nextAction: string) => {
    console.log("[Frontend] handleWebhookAction called:", { processedData, nextAction })

    switch (nextAction) {
      case "show_confirmation":
        setPaymentData({
          txCode: processedData.txCode,
          externalReferenceId: processedData.externalReferenceId,
          status: processedData.status,
          localCurrency: processedData.localCurrency,
          order: processedData.order,
          collector: processedData.collector,
        })
        setStatus("ready_to_confirm")
        setCurrentScreen("confirmation")
        toast({
          title: "Listo para Confirmar",
          description: "Revisa los detalles y confirma el pago.",
        })
        break

      case "show_amount_input":
        setPaymentData({
          txCode: processedData.txCode,
          localCurrency: processedData.localCurrency,
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

      case "show_cancelled":
        setPaymentData((prev) => ({
          ...prev,
          status: processedData.status,
        }))
        setStatus("cancelled")
        setCurrentScreen("cancelled")
        toast({
          title: "Transacción Cancelada",
          description: "La transacción ha sido cancelada por timeout o por el sistema.",
          variant: "destructive",
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

                {/* Mostrar tipo de cambio si las monedas son diferentes */}
                {paymentData.order.localCurrency !== paymentData.order.userCurrency && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Tipo de Cambio</span>
                      <span className="text-sm text-blue-800 dark:text-blue-200 font-semibold">
                        1 {paymentData.order.userCurrency} = {(paymentData.order.localTotalAmount / paymentData.order.userTotalAmount).toFixed(4)} {paymentData.order.localCurrency}
                      </span>
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Conversión: {paymentData.order.userTotalAmount} {paymentData.order.userCurrency} → {paymentData.order.localTotalAmount} {paymentData.order.localCurrency}
                    </div>
                  </div>
                )}
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
            <Button onClick={rejectPayment} variant="outline" className="flex-1 bg-transparent border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Rechazar
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

  const renderCancelledScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center mb-4">
            <X className="w-6 h-6 text-red-500" />
          </div>
          <CardTitle>Transacción Cancelada</CardTitle>
          <CardDescription>La transacción ha sido cancelada por el sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg text-center">
            <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              CANCELLED
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">Código: {paymentData.txCode}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              La transacción no se completó dentro del tiempo límite o fue cancelada por el sistema.
            </div>
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
                  <div className={`w-2 h-2 rounded-full ${isPolling ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                  <span className="text-xs text-muted-foreground">{isPolling ? "Monitoreando" : "Inactivo"}</span>
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

  const renderWaitingWebhookScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
          <CardTitle>Esperando Webhook</CardTitle>
          <CardDescription>Procesando QR y esperando respuesta del servidor...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-center">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              ESPERANDO
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">Código: {paymentData.txCode}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              El servidor está procesando el QR. La pantalla se actualizará automáticamente cuando llegue el webhook.
            </div>
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

  const renderWebhookLogsModal = () => (
    showWebhookModal && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-background border rounded-lg shadow-lg w-full max-w-4xl h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Logs de Webhook</h2>
                <p className="text-sm text-muted-foreground">{webhookLogs.length} llamadas registradas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isPolling ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                <span className="text-xs text-muted-foreground">{isPolling ? "Monitoreando" : "Inactivo"}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {webhookLogs.filter((log) => log.status === "success").length} exitosas
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowWebhookModal(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4">
            <div className="flex gap-2 mb-4">
              <Button onClick={clearWebhookLogs} variant="outline" size="sm" disabled={webhookLogs.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar Logs
              </Button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Activity className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No hay llamadas de webhook registradas</p>
                <p className="text-sm">Las llamadas aparecerán aquí automáticamente durante las transacciones</p>
              </div>
            ) : (
              <div className="space-y-3 h-full overflow-y-auto pr-2">
                {webhookLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        </div>
      </div>
    )
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
          // Layout centrado de una sola columna
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              {currentScreen === "qr-input" && renderQRInputScreen()}
              {currentScreen === "waiting-webhook" && renderWaitingWebhookScreen()}
              {currentScreen === "amount-input" && renderAmountInputScreen()}
              {currentScreen === "confirmation" && renderConfirmationScreen()}
              {currentScreen === "processing" && renderProcessingScreen()}
              {currentScreen === "success" && renderSuccessScreen()}
              {currentScreen === "cancelled" && renderCancelledScreen()}
            </div>
          </div>
        )}
      </div>

      {/* Botón flotante para logs de webhook */}
      {currentScreen !== "config" && (
        <Button
          onClick={() => setShowWebhookModal(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-40"
          size="lg"
        >
          <div className="flex flex-col items-center">
            <Code2 className="h-5 w-5" />
            {webhookLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-2 -right-2 h-6 w-6 p-0 flex items-center justify-center text-xs bg-blue-500 text-white border-2 border-white"
              >
                {webhookLogs.length}
              </Badge>
            )}
          </div>
        </Button>
      )}

      {/* Modal de Logs de Webhook */}
      {renderWebhookLogsModal()}
    </div>
  )
}
