# Member 3 Instructions — Security, Provenance & Evaluation

## Mission

Own security intelligence around the core engine and prove the system works.

## Primary Responsibilities

Implement:
- session ledger;
- provenance labels;
- indicator extraction;
- lineage matching;
- injection advisory;
- scripted agent;
- optional LLM agent;
- eight demo scenarios;
- 200-case evaluation;
- side-effect oracles;
- performance tests;
- chaos tests.

## Provenance

Track:
- trusted;
- internal;
- user;
- external;
- untrusted.

Never allow content provenance to become authority.

Extract indicators from tool output:
- emails;
- hostnames;
- URLs;
- paths;
- identifiers >= 6 characters.

## Injection Detector

Advisory only.

It may add risk and display a badge.

It must never independently DENY.

The Governor's hard rules remain authoritative.

## Evaluation

Create:
- 120 development cases;
- 80 blind held-out cases.

Freeze held-out at hour 10.

Run held-out once at hour 18.

Compare:
- off;
- regex_only;
- full.

## Side-Effect Oracles

Verify actual system state, not only HTTP responses.

## Required Security Tests

Include:
- prompt injection;
- lineage laundering;
- exfiltration after sensitive read;
- path traversal;
- Unicode tricks;
- zero-width tricks;
- URL SSRF;
- redirect SSRF;
- SQL injection-like syntax;
- shell obfuscation;
- approval replay;
- approval swap;
- session reset attempts.

## Optional LLM Agent

Only after scripted agent and benchmark are stable.

If unavailable, the project must work normally.

## Do Not Build

- production ML classifier;
- fine-tuning;
- RAG;
- vector DB;
- security decisions dependent on external LLM availability.
