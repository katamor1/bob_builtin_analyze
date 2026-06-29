# Requirements for payment status matrix

## REQ-OK-001 Premium customer limit

REQ-OK-001: When `customerTier >= 2`, `Payment_CalculateLimit` must allow a
premium limit of `250`. For lower tiers, the limit remains `100`.

## REQ-NG-001 Timeout status

REQ-NG-001: When a timeout is detected, `Payment_HandleTimeout` must return
`ERR_TIMEOUT`. The timeout branch must not return `ERR_OK`.

## REQ-FRAUD-030 Fraud score review

REQ-FRAUD-030: When the fraud score is high, `Payment_AssessFraudScore` must
route the payment to manual review by returning `ERR_FRAUD_REVIEW`.

## REQ-NA-001 Out-of-scope topics

REQ-NA-001: This review does not cover performance measurement and dashboard UI
labels. These items remain N/A for the code consistency pre-review.
