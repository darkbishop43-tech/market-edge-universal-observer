# Evidence schema V0

The ledger is append-oriented and designed for D1 rather than high-frequency KV writes.

Each prediction-capable observation must preserve:
- observation ID and UTC timestamp
- domain and engine version
- market/event ticker and contemporaneous bid/ask/last/liquidity
- exact evidence-source timestamps/values used by the engine
- prediction side and probability, or an explicit no-prediction reason
- execution eligibility (always false in Universal Observer V0)
- later settlement/result
- hypothetical entry/exit assumptions, estimated fees/liquidity constraints
- calibration error and hypothetical P/L
- failure/rejection reason

V0 Weather candidates are deliberately recorded as EVIDENCE_REQUIRED until an independent weather source is wired. No probability may be back-filled after the observation timestamp.
