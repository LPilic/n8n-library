# OpenTelemetry storage options: Jaeger vs. internal tracing

This document compares keeping an external trace backend (Jaeger/Tempo) with
implementing trace ingestion and storage inside n8n-library.

## Short answer

**Jaeger is not required.** n8n only needs an OTLP endpoint. n8n-library can be
that endpoint.

Current POC:

```text
n8n → Jaeger → n8n-library queries Jaeger
```

Fully integrated alternative:

```text
n8n → n8n-library /v1/traces → PostgreSQL → Tracing page
```

## What Jaeger provides

- OTLP ingestion
- Trace storage
- Trace search
- Service list
- Trace UI
- Retention and scaling for large volumes

## What n8n-library would need to replace Jaeger

### 1. OTLP receiver

- Expose `POST /v1/traces`.
- n8n defaults to `http/protobuf`, so the library must parse OTLP protobuf.
  A JSON-only receiver will not work unless n8n's exporter is changed.
- Authenticate ingestion with a bearer token:

```yaml
N8N_OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer <ingest-token>"
```

### 2. Span storage

Suggested tables:

```text
otel_traces
  trace_id, service_name, root_name, start_time, duration_ms,
  status, execution_id, workflow_id, workflow_name, span_count

otel_spans
  trace_id, span_id, parent_span_id, name, service_name,
  start_time, duration_ms, status, attributes JSONB, events JSONB
```

Required indexes:

- `trace_id`
- `execution_id`
- `workflow_id`
- `service_name`
- `status`
- `start_time`

### 3. Retention and volume control

- Daily or monthly partitioning, or scheduled deletes
- 7–30 day retention
- Sampling is still required; traces are high-volume data

### 4. Query layer

- Add an `internal` adapter alongside the Jaeger/Tempo adapters
- `OTEL_BACKEND=internal`
- The existing Tracing page can remain almost unchanged

## Is internal storage a good idea?

It depends on volume.

### Small / medium deployment — yes

If the instance has:

- a few hundred to a few thousand executions per day
- 10–30 nodes per workflow
- 10–25% sampling

then PostgreSQL is capable. Benefits:

- No extra service to operate
- Traces are backed up with the library database
- Native execution/ticket/workflow linking
- Retention and permissions live in the same app
- The Tracing UI already exists

### Large deployment — external backend is usually better

Approximate span volume:

```text
spans/day = executions/day × (1 + average nodes) × sampling rate
```

Examples:

```text
10,000 executions/day × 21 spans × 10% sampling = 21,000 spans/day
```

This is manageable.

```text
10,000 executions/day × 51 spans × 100% sampling = 510,000 spans/day
≈ 15M spans/month
```

At roughly 1–2 KB per span, that is tens of gigabytes per month. PostgreSQL can
handle it, but it becomes a separate storage/partitioning problem and competes
with the application database.

## Architecture options

### Option A — Current POC: Jaeger

```text
n8n → Jaeger → library UI
```

**Best for:** fastest setup, local debugging, no schema changes.

**Downside:** extra container; Jaeger v1 API is aging; in-memory storage by
default.

### Option B — Fully integrated: library as OTLP backend

```text
n8n → n8n-library /v1/traces → PostgreSQL → library UI
```

**Best for:** small/medium self-hosted deployments that want one app and one
database.

**Needs:**

- OTLP protobuf parsing
- span tables and indexes
- retention job
- ingest token
- internal query adapter

**Downside:** you are building a small trace store. Advanced exploration
(TraceQL, service graphs, long retention) is weaker than Tempo/Grafana.

### Option C — Hybrid: Collector + Tempo, library as UI

```text
n8n → Collector → Tempo → library UI
                 └→ optional Jaeger/SaaS
```

**Best for:** production scale and long retention.

**Downside:** more infrastructure, but the library never owns trace storage.

## Recommendation

Do not keep Jaeger long-term just for the POC. Choose based on volume:

- **Modest volume, simplicity:** implement the internal OTLP receiver and
  PostgreSQL storage, then remove Jaeger.
- **High volume or Grafana/TraceQL desired:** replace Jaeger with
  Collector + Tempo and keep the library as the query/UI layer.

A practical middle ground:

1. Keep the library's trace abstraction.
2. Add `OTEL_BACKEND=internal`.
3. Implement `POST /v1/traces` with protobuf parsing and PostgreSQL storage.
4. Keep the Jaeger/Tempo adapter as an alternative for larger deployments.
5. Default to internal storage for small installs.

## Decision inputs

To choose between internal storage and Tempo, collect:

- approximate executions per day
- average nodes per workflow
- required retention period
- desired sampling rate
- whether traces must survive library database restores
- whether Grafana/TraceQL is required for advanced analysis

## Current state

The repository currently has:

- Jaeger POC deployment
- `lib/tracing.js` Jaeger query adapter
- `/api/tracing/*` query endpoints
- React Tracing page
- execution-level "View trace" links

The internal OTLP receiver and PostgreSQL trace store are **not implemented yet**.
