const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJaegerTrace, buildSpanTree, traceSummary } = require('../lib/tracing');

const rawTrace = {
  traceID: '0123456789abcdef',
  spans: [
    {
      traceID: '0123456789abcdef',
      spanID: 'aaaaaaaaaaaaaaaa',
      operationName: 'workflow.execute',
      references: [],
      startTime: 1_700_000_000_000_000,
      duration: 500_000,
      processID: 'p1',
      tags: [
        { key: 'n8n.execution.id', type: 'string', value: '42' },
        { key: 'n8n.workflow.id', type: 'string', value: 'wf-1' },
        { key: 'n8n.workflow.name', type: 'string', value: 'Test workflow' },
        { key: 'n8n.execution.status', type: 'string', value: 'success' },
      ],
      logs: [],
    },
    {
      traceID: '0123456789abcdef',
      spanID: 'bbbbbbbbbbbbbbbb',
      operationName: 'node.execute',
      references: [
        {
          refType: 'CHILD_OF',
          traceID: '0123456789abcdef',
          spanID: 'aaaaaaaaaaaaaaaa',
        },
      ],
      startTime: 1_700_000_000_100_000,
      duration: 200_000,
      processID: 'p1',
      tags: [
        { key: 'n8n.node.name', type: 'string', value: 'HTTP Request' },
        { key: 'error', type: 'bool', value: true },
      ],
      logs: [
        {
          timestamp: 1_700_000_000_200_000,
          fields: [
            { key: 'event', type: 'string', value: 'exception' },
            { key: 'exception.message', type: 'string', value: 'boom' },
          ],
        },
      ],
    },
  ],
  processes: {
    p1: {
      serviceName: 'n8n',
      tags: [{ key: 'n8n.instance.role', type: 'string', value: 'worker' }],
    },
  },
};

test('normalizes Jaeger spans into the common trace model', () => {
  const trace = normalizeJaegerTrace(rawTrace);
  assert.equal(trace.traceId, '0123456789abcdef');
  assert.equal(trace.spans.length, 2);
  assert.equal(trace.durationMs, 500);
  assert.deepEqual(trace.services, ['n8n']);

  const root = trace.spans.find((s) => s.id === 'aaaaaaaaaaaaaaaa');
  const child = trace.spans.find((s) => s.id === 'bbbbbbbbbbbbbbbb');
  assert.equal(root.name, 'workflow.execute');
  assert.equal(root.parentId, null);
  assert.equal(child.parentId, 'aaaaaaaaaaaaaaaa');
  assert.equal(child.status, 'error');
  assert.equal(child.durationMs, 200);
  assert.equal(child.logs[0].fields['exception.message'], 'boom');
});

test('builds a span tree and trace summary for execution linking', () => {
  const trace = normalizeJaegerTrace(rawTrace);
  const roots = buildSpanTree(trace.spans);
  const summary = traceSummary(trace);

  assert.equal(roots.length, 1);
  assert.equal(roots[0].children.length, 1);
  assert.equal(roots[0].children[0].name, 'node.execute');

  assert.equal(summary.executionId, '42');
  assert.equal(summary.workflowId, 'wf-1');
  assert.equal(summary.workflowName, 'Test workflow');
  assert.equal(summary.status, 'success');
  assert.equal(summary.spanCount, 2);
});

test('handles a child whose parent is missing from the sampled trace', () => {
  const trace = normalizeJaegerTrace({
    traceID: 'fedcba9876543210',
    spans: [
      {
        traceID: 'fedcba9876543210',
        spanID: '1111111111111111',
        operationName: 'node.execute',
        references: [{ refType: 'CHILD_OF', traceID: 'fedcba9876543210', spanID: 'missing' }],
        startTime: 1,
        duration: 1,
        processID: 'p1',
        tags: [],
        logs: [],
      },
    ],
    processes: { p1: { serviceName: 'n8n' } },
  });
  const roots = buildSpanTree(trace.spans);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].parentId, 'missing');
});
