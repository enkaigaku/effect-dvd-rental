import { Effect, Layer } from "effect";
import { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { TelemetryConfig } from "./AppConfig.js";

// ============================================================
// OpenTelemetry Configuration (uses Effect Config)
// ============================================================

export const TracingLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;
    
    return NodeSdk.layer(() => ({
      resource: {
        serviceName: "effect-dvd-rental",
        serviceVersion: "1.0.0",
      },
      spanProcessor: new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${config.endpoint}/v1/traces`,
        }),
      ),
    }));
  })
);
