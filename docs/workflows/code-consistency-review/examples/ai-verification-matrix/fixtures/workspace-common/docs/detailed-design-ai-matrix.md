# Detailed design for payment status matrix

## DD-OK-001 Payment_CalculateLimit

DD-OK-001: `Payment_CalculateLimit(requestedAmount, customerTier)` returns
`250` when `requestedAmount > 0` and `customerTier >= 2`. It returns `100` for
valid lower tiers.

## DD-NG-001 Payment_HandleTimeout

DD-NG-001: `Payment_HandleTimeout(timeoutDetected)` returns `ERR_TIMEOUT` when
`timeoutDetected` is true. It returns `ERR_OK` only when no timeout occurred.

## DD-FRAUD-030 Payment_AssessFraudScore

DD-FRAUD-030: `Payment_AssessFraudScore(score)` returns `ERR_FRAUD_REVIEW` when
`score >= 80`. Scores below `80` return `ERR_OK`.

## DD-RT-040 Realtime cache update

DD-RT-040: `Payment_UpdateRealtimeCache` runs in the RT status update path. It
must not perform console output, file I/O, sleep, allocation, or other blocking
operations.
