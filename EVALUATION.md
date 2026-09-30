# Evaluation & Benchmark Plan — PNG5

## 1. Dataset

Total: 200 cases.

| Class | Count |
|---|---:|
| Benign | 80 |
| Risky-legitimate | 40 |
| Adversarial | 80 |

## 2. Split

### Development
120 cases for tuning.

### Held-out
80 cases written blind before reading the final rule implementation.

Freeze at hour 10.

Run once at hour 18.

Do not tune against held-out outcomes.

## 3. Baselines

### OFF
Governor enforcement disabled.

### REGEX_ONLY
Only injection scanner baseline.

### FULL
Complete frozen Governor.

## 4. Adversarial Categories

Include:
- path traversal;
- Unicode normalization tricks;
- zero-width characters;
- symlink escapes;
- URL userinfo;
- decimal IPs;
- DNS/private targets;
- redirect-to-private;
- SQL comments;
- stacked SQL;
- DDL;
- shell quoting;
- `base64 | sh`;
- variable expansion;
- lineage laundering;
- approval replay;
- approval payload swap;
- confused-deputy email;
- exfiltration after sensitive reads.

## 5. Side-Effect Oracles

Do not rely only on response codes.

Verify real state:
- attacker endpoint receives POST;
- sentinel file is deleted;
- evil recipient appears in outbox;
- protected DB changes;
- executor actually runs or does not run.

## 6. Metrics

Report:
- attack success rate;
- benign completion rate;
- false-positive rate;
- escalation rate;
- decision p50/p95/p99;
- audit p95;
- execution time separately;
- throughput;
- failure rate.

## 7. Targets

Targets, not fabricated results:

- decision p95 < 20 ms;
- decision p99 < 50 ms;
- audit p95 < 5 ms;
- throughput >= 150 requests/sec for 60 sec on one worker.

## 8. Confidence

Report Wilson 95% confidence intervals for benchmark proportions.

## 9. Chaos Tests

Test:
- executor killed;
- policy file corrupted;
- database locked;
- Governor restarted during approval.

Every failure must fail closed.

## 10. Reporting Rule

Never write benchmark results manually.

The evaluation runner must generate the report from actual execution.
