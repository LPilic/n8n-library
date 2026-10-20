# OpenTelemetry integration

This document covers how n8n tracing works, how to run the Jaeger POC, and how
the n8n-library Tracing page queries traces.

## 1. How n8n tracing works

n8n is an OpenTelemetry **producer**, not a trace store. When enabled, it exports
OTLP traces for workflow and node execution:

- `workflow.execute` — one span per execution
- `node.execute` — one span per node, nested under the workflow span
- `workflow.execute.started` / `node.execute.started` — optional start spans
- `<agent>.generate` / `execute_tool` — optional agent spans

n8n does not expose an API to read traces. The trace backend (Jaeger or Tempo)
must be queried separately. n8n-library does that on behalf of the browser.

Useful attributes:

| Attribute | Meaning |
|---|---|
| `n8n.execution.id` | Link a trace to a monitoring execution or ticket |
| `n8n.workflow.id` / `n8n.workflow.name` | Workflow filtering |
| `n8n.execution.status` | `success`, `error`, `crashed`, `running`, etc. |
| `n8n.execution.mode` | `manual`, `webhook`, `trigger`, `retry` |
| `n8n.node.name` / `n8n.node.type` | Waterfall and node analysis |
| `n8n.execution.error_type` | Error grouping |
| `n8n.instance.id` / `n8n.instance.role` | Main vs worker vs webhook |

n8n also propagates W3C trace context:

- Inbound webhook `traceparent` becomes the workflow span's parent.
- HTTP Request nodes inject `traceparent` into outbound requests.
- Sub-workflows use the parent workflow span.
- Resumed workflows link back to the previous span.

## 2. Version and queue-mode requirements

The current deployment uses **n8n 2.44.4**, which supports all relevant
features:

| Feature | Minimum version |
|---|---|
| OTel traces | 2.19.0 |
| UI configuration | 2.27.0 |
| gRPC OTLP | 2.39.0 |
| Crashed-execution spans | 2.42.0 |
| Start spans | 2.44.0 |
| Agent tracing | 2.33.0 |

In queue mode (this deployment uses one `n8n-web` and four workers):

- Set the OTel variables on **`n8n-web` and every worker**.
- Worker spans read parent context from the database.
- The main instance emits crashed-execution spans, so it must have OTel
  enabled even if workers are the ones running workflows.

n8n's OpenTelemetry tracing is still marked **Preview**. Keep the existing
Prometheus/execution monitoring as the primary operational view.

## 3. POC architecture (Jaeger)

```text
n8n-web + n8n-worker-1..4
        │ OTLP HTTP :4318
        ▼
Jaeger all-in-one :16686 (UI), :4318 (OTLP HTTP), :4317 (OTLP gRPC)

n8n-library :3100
        │ query Jaeger HTTP API
        ▼
Tracing page + execution "View trace" links
```

Jaeger all-in-one storage is in-memory by default. Traces disappear when the
container restarts. That is acceptable for a POC; use Tempo for production.

## 4. POC environment variables

Add these to `n8n-web` and the worker environment (the `x-worker-common`
anchor in the Compose file covers all workers):

```yaml
N8N_OTEL_ENABLED: "true"
N8N_OTEL_EXPORTER_OTLP_ENDPOINT: "http://jaeger:4318"
N8N_OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf"
N8N_OTEL_EXPORTER_SERVICE_NAME: "n8n"
N8N_OTEL_TRACES_SAMPLE_RATE: "1.0"
N8N_OTEL_TRACES_INCLUDE_NODE_SPANS: "true"
N8N_OTEL_TRACES_PRODUCTION_ONLY: "false"
N8N_OTEL_TRACES_INJECT_OUTBOUND: "true"
N8N_OTEL_TRACES_EMIT_WORKFLOW_START_SPAN: "true"
N8N_OTEL_TRACES_EMIT_NODE_START_SPAN: "true"
```

POC values are intentionally verbose:

- `SAMPLE_RATE=1.0` exports every trace.
- `PRODUCTION_ONLY=false` also traces manual test runs.
- Start spans make running workflows visible immediately.
- Node spans provide the waterfall.

For production, start with `SAMPLE_RATE=0.1` and
`PRODUCTION_ONLY=true`, and enable start spans only if the UI needs live
in-progress data.

The endpoint is the **base URL**. n8n appends `/v1/traces`. For gRPC, set
`N8N_OTEL_EXPORTER_OTLP_PROTOCOL=grpc` and use an explicit port such as
`http://jaeger:4317`.

If the collector requires auth:

```yaml
N8N_OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer <token>"
# or, preferably:
N8N_OTEL_EXPORTER_OTLP_HEADERS_FILE: /run/secrets/otel-headers
```

## 5. Jaeger service

Add to the Compose stack:

```yaml
  jaeger:
    # Jaeger v1 all-in-one keeps the /api/services and /api/traces query API
    # used by the POC adapter. Jaeger v2+ exposes the newer /api/v3 API.
    image: jaegertracing/all-in-one:1.60
    container_name: jaeger
    restart: always
    ports:
      - "16686:16686"   # UI
      - "4318:4318"     # OTLP HTTP
      - "4317:4317"     # OTLP gRPC
```

The n8n containers reach it at `http://jaeger:4318`. The host reaches the UI at
`http://localhost:16686`.

If you add an OpenTelemetry Collector later, point n8n at the collector and
have the collector export to Jaeger or Tempo. A collector is recommended for
production because it gives you batching, sampling, redaction, and fan-out.

## 6. n8n-library configuration

The library queries the trace backend through its backend, not from the
browser:

```text
OTEL_BACKEND=jaeger
OTEL_QUERY_URL=http://jaeger:16686
OTEL_PUBLIC_URL=http://localhost:16686
OTEL_SERVICE_NAME=n8n
# OTEL_QUERY_AUTH_HEADER=Bearer ...
```

| Variable | Purpose |
|---|---|
| `OTEL_BACKEND` | `jaeger` now; `tempo` can be added in the query adapter |
| `OTEL_QUERY_URL` | Internal URL the library container uses to query traces |
| `OTEL_PUBLIC_URL` | Host-accessible URL used for "Open in Jaeger" links |
| `OTEL_SERVICE_NAME` | Default `service.name` filter (`n8n`) |
| `OTEL_QUERY_AUTH_HEADER` | Optional Authorization header for the trace backend |

## 7. n8n-library tracing endpoints

All endpoints require `admin` or `editor`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tracing/config` | Backend, default service, public URL |
| GET | `/api/tracing/health` | Backend reachability and service list |
| GET | `/api/tracing/services` | Trace backend service names |
| GET | `/api/tracing/traces` | Search traces (`service`, `lookback`, `limit`, `executionId`, `workflowId`, `status`) |
| GET | `/api/tracing/traces/:traceId` | Normalized trace with span tree |
| GET | `/api/tracing/executions/:executionId` | Traces for one n8n execution |

The backend normalizes Jaeger's response into:

- trace summary: trace ID, root name, service, duration, status, workflow and
  execution IDs, span count
- spans: ID, parent ID, name, service, start time, duration, status, tags, logs
- span tree sorted by start time

## 8. Tracing page

The React page is at `/tracing` under **Operations → Tracing**:

- Filters: service, lookback, status, execution ID, workflow ID, limit.
- Trace table: status, trace name/ID, workflow, execution, duration, span count,
  start time.
- Trace detail: nested waterfall, span duration bars, tags, exception events.
- "Open in Jaeger" deep link when `OTEL_PUBLIC_URL` is set.
- Execution detail page has a **View trace** button that opens
  `/tracing?executionId=<id>`.

The page uses the existing design primitives and is lazy-loaded like the other
routes.

## 9. Security and data handling

Trace payloads can contain sensitive data:

- Workflow and node names
- Error messages and stack traces
- Custom span attributes
- Agent prompts, tool arguments, responses, and results

Recommendations:

- Keep tracing restricted to `admin`/`editor`.
- Set `N8N_AGENTS_TRACING_RECORD_INPUTS=false` and
  `N8N_AGENTS_TRACING_RECORD_OUTPUTS=false`.
- Do not put secrets in custom span attributes.
- Keep Jaeger/Tempo/Collector on the internal Docker network; expose only the
  UI port if needed.
- Use `N8N_OTEL_EXPORTER_OTLP_HEADERS_FILE` for collector credentials.
- Plan retention before enabling 100% sampling in production.

## 10. Production path

Replace Jaeger with Tempo + Grafana:

```text
n8n → OpenTelemetry Collector → Tempo → Grafana
                              └→ optional SaaS exporter
```

Why Tempo:

- Documented `/api/search` and `/api/traces/{id}` HTTP APIs
- TraceQL filtering
- Object storage and retention
- Grafana UI for deep analysis

Jaeger's HTTP JSON query API is intentionally undocumented and subject to
change; it is fine for the POC but not ideal for a long-lived integration.

## 11. Risks and caveats

- OpenTelemetry tracing is a preview feature in n8n.
- Node spans and start spans increase storage volume significantly.
- In queue mode, partial env configuration breaks trace context linking.
- Crashed-execution spans require OTel on the main instance.
- Jaeger all-in-one has no durable storage by default.
- The library's tracing page is a focused viewer; use Jaeger/Grafana for
  advanced trace exploration until the page grows.

## 12. Verification checklist

1. `docker compose up -d jaeger n8n-web n8n-worker-1..4`
2. Open `http://localhost:16686`, select service `n8n`, click **Find traces**.
3. Run a workflow in n8n.
4. Confirm a `workflow.execute` trace appears, with `node.execute` children.
5. Open n8n-library → **Operations → Tracing**.
6. Confirm the trace appears and the waterfall renders.
7. Open an execution in Monitoring → **View trace**.
8. Confirm the trace page filters to `n8n.execution.id`.
