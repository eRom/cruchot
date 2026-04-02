/**
 * ServiceRegistry — Registre centralise des services stoppables.
 * Les services s'enregistrent dans init(), le shutdown itere en LIFO.
 */

export interface Stoppable {
  stop(): Promise<void>
}

class ServiceRegistry {
  private services: Map<string, Stoppable> = new Map()
  private order: string[] = []

  register(name: string, service: Stoppable): void {
    if (this.services.has(name)) {
      console.warn(`[Registry] Service "${name}" already registered, replacing`)
    } else {
      this.order.push(name)
    }
    this.services.set(name, service)
    console.log(`[Registry] Registered: ${name}`)
  }

  unregister(name: string): void {
    this.services.delete(name)
    this.order = this.order.filter((n) => n !== name)
    console.log(`[Registry] Unregistered: ${name}`)
  }

  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Stop all services in LIFO order (last registered = first stopped).
   * Errors are logged but don't prevent other services from stopping.
   */
  async stopAll(): Promise<void> {
    const reversed = [...this.order].reverse()
    for (const name of reversed) {
      const service = this.services.get(name)
      if (!service) continue
      try {
        await service.stop()
        console.log(`[Registry] Stopped: ${name}`)
      } catch (err) {
        console.error(`[Registry] Error stopping ${name}:`, err)
      }
    }
    this.services.clear()
    this.order = []
  }

  get size(): number {
    return this.services.size
  }
}

export const serviceRegistry = new ServiceRegistry()
