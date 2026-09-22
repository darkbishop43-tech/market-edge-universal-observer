# Market Edge — Universal Observer

Observation-only research platform for discovering prediction-market contracts, routing them to domain-specific evidence engines, preserving timestamped predictions, and reconciling those predictions against reality.

## Hard boundaries

- **No live trading**
- **No order submission code**
- **No bankroll access**
- **No Baseline Real credentials, state, KV, Worker bindings, or execution logic**
- **No Payne or NFE Reasoning state/bindings**
- Domain engines produce observations only. The Universal Observer is a neutral discovery, routing, evidence, and reconciliation control plane.

## V0

The first domain engine is **Weather V0**. Economics is reserved for a later engine.

The Cloudflare design intentionally uses one Worker and one scheduled observation cycle. Historical evidence is designed for D1; high-frequency evidence is not written to KV.

## Promotion rule

OBSERVE → PREDICT → RESOLVE → CALIBRATE → PAPER TEST → VALIDATE → only then consider REAL eligibility.

A score or prediction is never execution authority.

<!-- cloudflare-trigger: git-access-restored-2026-09-21 -->
