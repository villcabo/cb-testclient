"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { QrCode, Settings, CreditCard, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
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
}

export default function PaymentClient() {
  const [currentScreen, setCurrentScreen] = useState<
    "config" | "qr-input" | "amount-input" | "confirmation" | "success"
  >("config")
  const [apiKey, setApiKey] = useState("")
  const [apiBaseUrl, setApiBaseUrl] = useState("https://stage-api.sintesis.com.bo")
  const [token, setToken] = useState("")
  const [qrCode, setQrCode] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentData, setPaymentData] = useState<PaymentData>({})
  const [status, setStatus] = useState<PaymentStatus>("idle")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

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
    if (savedApiKey) {
      setApiKey(savedApiKey)
    }
    if (savedApiBaseUrl) {
      setApiBaseUrl(savedApiBaseUrl)
    }
  }, [])

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
        setStatus("completed")
        setCurrentScreen("success")
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

  const renderSuccessScreen = () => (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <CardTitle>Pago Procesado</CardTitle>
          <CardDescription>El pago se ha procesado correctamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              PROCESSING
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">Código: {paymentData.txCode}</div>
          </div>

          <Button onClick={resetFlow} className="w-full">
            Nuevo Pago
          </Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-balance">Cliente de Pruebas de Pago</h1>
          <p className="text-muted-foreground mt-2">Herramienta para probar la API de pagos cross-border</p>
        </div>

        {currentScreen === "config" && renderConfigScreen()}
        {currentScreen === "qr-input" && renderQRInputScreen()}
        {currentScreen === "amount-input" && renderAmountInputScreen()}
        {currentScreen === "confirmation" && renderConfirmationScreen()}
        {currentScreen === "success" && renderSuccessScreen()}
      </div>
    </div>
  )
}
