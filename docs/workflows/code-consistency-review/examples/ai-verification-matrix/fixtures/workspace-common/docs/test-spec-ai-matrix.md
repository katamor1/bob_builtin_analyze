# Test specification for payment status matrix

## TC-OK-010 Premium customer limit

TC-OK-010: Given `requestedAmount = 120` and `customerTier = 2`,
`Payment_CalculateLimit` must return `250`.

## TC-TIMEOUT-020 Timeout status

TC-TIMEOUT-020: Given `timeoutDetected = true`, `Payment_HandleTimeout` must
return `ERR_TIMEOUT`.

## Fraud review coverage note

No test case is defined yet for `REQ-FRAUD-030` or `DD-FRAUD-030`.
