// Almacén temporal para webhooks en memoria
interface WebhookData {
  type: string;
  txCode: string;
  externalReferentId: string;
  status: string;
  timestamp: number;
  read: boolean; // Nuevo campo para marcar como leído
  [key: string]: any; // Para campos adicionales
}

class WebhookStore {
  private webhookMap: Map<string, WebhookData> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Iniciar limpieza automática cada 10 minutos
    this.startCleanup();
  }

  // Almacenar webhook por txCode
  save(webhook: Omit<WebhookData, 'timestamp' | 'read'>): void {
    // Asegurarse de que los campos requeridos estén presentes
    const requiredFields: (keyof WebhookData)[] = ['type', 'txCode', 'externalReferentId', 'status'];
    const missingFields = requiredFields.filter(field => !(field in webhook));
    
    if (missingFields.length > 0) {
      console.error(`[WebhookStore] Error: Missing required fields: ${missingFields.join(', ')}`);
      return;
    }

    const webhookWithTimestamp: WebhookData = {
      type: webhook.type,
      txCode: webhook.txCode,
      externalReferentId: webhook.externalReferentId,
      status: webhook.status,
      ...webhook, // Esto sobrescribirá los campos anteriores si están presentes en webhook
      timestamp: Date.now(),
      read: false // Marcar como no leído por defecto
    };

    this.webhookMap.set(webhook.txCode, webhookWithTimestamp);
    console.log(`[WebhookStore] Stored webhook for txCode: ${webhook.txCode} (unread)`, webhookWithTimestamp);
  }

  // Obtener webhook por txCode (solo no leídos)
  get(txCode: string): WebhookData | null {
    const webhook = this.webhookMap.get(txCode);

    if (!webhook) {
      return null;
    }

    // Verificar si el webhook ha expirado (1 hora = 3600000 ms)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (now - webhook.timestamp > oneHour) {
      this.webhookMap.delete(txCode);
      console.log(`[WebhookStore] Webhook expired and removed for txCode: ${txCode}`);
      return null;
    }

    // Solo retornar si no ha sido leído
    if (webhook.read) {
      console.log(`[WebhookStore] Webhook already read for txCode: ${txCode}`);
      return null;
    }

    return webhook;
  }

  // Marcar webhook como leído
  markAsRead(txCode: string): boolean {
    const webhook = this.webhookMap.get(txCode);

    if (!webhook) {
      console.log(`[WebhookStore] Cannot mark as read - webhook not found for txCode: ${txCode}`);
      return false;
    }

    webhook.read = true;
    console.log(`[WebhookStore] Marked webhook as read for txCode: ${txCode}`);
    return true;
  }

  // Obtener webhook independientemente del estado de lectura (para debugging)
  getAny(txCode: string): WebhookData | null {
    const webhook = this.webhookMap.get(txCode);

    if (!webhook) {
      return null;
    }

    // Verificar si el webhook ha expirado
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (now - webhook.timestamp > oneHour) {
      this.webhookMap.delete(txCode);
      console.log(`[WebhookStore] Webhook expired and removed for txCode: ${txCode}`);
      return null;
    }

    return webhook;
  }

  // Obtener todos los webhooks (para debugging)
  getAll(): WebhookData[] {
    return Array.from(this.webhookMap.values());
  }

  // Limpiar todos los webhooks
  clearAll(): void {
    this.webhookMap.clear();
    console.log('[WebhookStore] Cleared all webhooks');
  }

  // Limpiar webhooks expirados
  private cleanup(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [txCode, webhook] of this.webhookMap.entries()) {
      if (now - webhook.timestamp > oneHour) {
        this.webhookMap.delete(txCode);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[WebhookStore] Cleaned up ${cleanedCount} expired webhooks`);
    }
  }

  // Iniciar limpieza automática
  private startCleanup(): void {
    // Limpiar cada 10 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  // Detener limpieza (para testing)
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Forzar limpieza manual
  forceCleanup(): void {
    this.cleanup();
  }

  // Obtener estadísticas del almacén
  getStats() {
    const allWebhooks = Array.from(this.webhookMap.values());
    const unreadWebhooks = allWebhooks.filter(w => !w.read);

    return {
      totalWebhooks: this.webhookMap.size,
      unreadWebhooks: unreadWebhooks.length,
      readWebhooks: allWebhooks.length - unreadWebhooks.length,
      webhooks: Array.from(this.webhookMap.entries()).map(([txCode, webhook]) => ({
        txCode,
        status: webhook.status,
        type: webhook.type,
        read: webhook.read,
        age: Date.now() - webhook.timestamp,
        timestamp: webhook.timestamp
      }))
    };
  }
}

// Singleton instance
export const webhookStore = new WebhookStore();
