import { Layer, Effect, Schedule, Duration } from "effect"
import { OtlpLogger } from "effect/unstable/observability"
import { Flag } from "../flag/flag"
import { InstallationChannel, InstallationVersion } from "../installation/version"
import { runID } from "./shared"

const endpoint = Flag.OTEL_EXPORTER_OTLP_ENDPOINT

const headers = Flag.OTEL_EXPORTER_OTLP_HEADERS
  ? Flag.OTEL_EXPORTER_OTLP_HEADERS.split(",").reduce(
      (acc, entry) => {
        const [key, ...value] = entry.split("=")
        acc[key] = value.join("=")
        return acc
      },
      {} as Record<string, string>,
    )
  : undefined

function resourceAttributes() {
  const value = process.env.OTEL_RESOURCE_ATTRIBUTES
  if (!value) return {}
  try {
    return Object.fromEntries(
      value.split(",").map((entry) => {
        const index = entry.indexOf("=")
        if (index < 1) throw new Error("Invalid OTEL_RESOURCE_ATTRIBUTES entry")
        return [decodeURIComponent(entry.slice(0, index)), decodeURIComponent(entry.slice(index + 1))]
      }),
    )
  } catch {
    return {}
  }
}

export function resource(): { serviceName: string; serviceVersion: string; attributes: Record<string, string> } {
  return {
    serviceName: "opencode",
    serviceVersion: InstallationVersion,
    attributes: {
      ...resourceAttributes(),
      "deployment.environment.name": InstallationChannel,
      "opencode.client": Flag.OPENCODE_CLIENT,
      "opencode.run": runID,
      "service.instance.id": runID,
    },
  }
}

// Rate limiting configuration to prevent AWS CloudFront bans
const TELEMETRY_BATCH_SIZE = 100 // Maximum spans per batch
const TELEMETRY_BATCH_DELAY_MS = 5000 // Send batch every 5 seconds
const TELEMETRY_MAX_QUEUE_SIZE = 1000 // Maximum spans to queue before dropping

class RateLimitedSpanProcessor {
  private spans: any[] = []
  private timer: NodeJS.Timeout | null = null
  private exporter: any

  constructor(exporter: any) {
    this.exporter = exporter
  }

  onStart(span: any, parentContext: any) {
    // Don't block on start
  }

  onEnd(span: any) {
    // Add to queue with size limit
    if (this.spans.length < TELEMETRY_MAX_QUEUE_SIZE) {
      this.spans.push(span)
    }
    
    // Schedule batch send
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), TELEMETRY_BATCH_DELAY_MS)
    }
    
    // Flush immediately if batch is full
    if (this.spans.length >= TELEMETRY_BATCH_SIZE) {
      this.flush()
    }
  }

  private flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    
    if (this.spans.length === 0) return
    
    const batch = this.spans.splice(0, TELEMETRY_BATCH_SIZE)
    
    // Export with retry logic
    this.exportWithRetry(batch, 3)
  }

  private async exportWithRetry(spans: any[], retries: number) {
    try {
      await this.exporter.export(spans, (result: any) => {
        if (result.code !== 0) {
          console.warn(`Telemetry export failed: ${result.error?.message || 'Unknown error'}`)
        }
      })
    } catch (error) {
      if (retries > 0) {
        setTimeout(() => this.exportWithRetry(spans, retries - 1), 1000)
      } else {
        console.warn("Telemetry export failed after retries:", error)
      }
    }
  }

  shutdown() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

export function loggers() {
  // Disable telemetry if flag is set
  if (Flag.OPENCODE_DISABLE_TELEMETRY || !endpoint) return []
  return [OtlpLogger.make({ url: `${endpoint}/v1/logs`, resource: resource(), headers })]
}

export async function tracingLayer() {
  // Disable telemetry if flag is set
  if (Flag.OPENCODE_DISABLE_TELEMETRY || !endpoint) return Layer.empty
  const NodeSdk = await import("@effect/opentelemetry/NodeSdk")
  const OTLP = await import("@opentelemetry/exporter-trace-otlp-http")
  const SdkBase = await import("@opentelemetry/sdk-trace-base")
  const { AsyncLocalStorageContextManager } = await import("@opentelemetry/context-async-hooks")
  const { context } = await import("@opentelemetry/api")

  // The Effect Node SDK does not register a global context manager, but the AI SDK uses it to parent spans.
  const manager = new AsyncLocalStorageContextManager()
  manager.enable()
  context.setGlobalContextManager(manager)

  // Create rate-limited exporter
  const exporter = new OTLP.OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
    timeoutMillis: 30000, // 30 second timeout
  })

  // Use rate-limited processor instead of BatchSpanProcessor
  const processor = new RateLimitedSpanProcessor(exporter)

  return NodeSdk.layer(() => ({
    resource: resource(),
    spanProcessor: processor as any,
  }))
}

export * as Otlp from "./otlp"