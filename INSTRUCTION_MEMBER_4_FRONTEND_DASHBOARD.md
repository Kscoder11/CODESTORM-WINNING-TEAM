# Member 4 Instructions — Frontend SOC Dashboard & Live Activity

## Mission

Build the primary Security Operations dashboard that makes the Governor's behavior understandable during the demo.

## Primary Pages

### Dashboard

Show:
- total actions;
- ALLOW;
- CONSTRAIN;
- ESCALATE;
- DENY;
- block/deny rate;
- p50/p95/p99;
- system health;
- active sessions;
- audit chain status.

### Live Activity

Show a real-time table:
- timestamp;
- agent;
- action;
- target;
- score;
- outcome;
- rule IDs;
- latency.

Use SSE from `/v1/stream`.

### Action Detail

Show:
- canonical action;
- resource metadata;
- score breakdown;
- triggered hard rules;
- provenance;
- approval state;
- timings.

## Design Principles

- Security-console aesthetic.
- Clear outcome colors.
- High information density.
- No unnecessary 3D.
- No large animations.
- Responsive.
- Demo-first.

## Data

Use backend API responses directly.

Do not implement authorization logic in frontend.

Frontend only visualizes backend decisions.

## Development Strategy

Start with mock data if backend APIs are not ready.

Replace mock data with real endpoints when contracts stabilize.

## Tests

Verify:
- live events appear;
- counters update;
- reconnect behavior;
- empty states;
- loading states;
- error states;
- responsive behavior.

## Do Not Build

- mobile app;
- complex visualization framework;
- duplicate policy engine;
- frontend-side risk calculations.
