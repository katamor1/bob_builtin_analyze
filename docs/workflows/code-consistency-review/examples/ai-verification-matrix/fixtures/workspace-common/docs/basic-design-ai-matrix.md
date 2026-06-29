# Basic design for payment status matrix

## BD-OK-001 Limit calculation

BD-OK-001: The limit calculation keeps the existing standard limit of `100`.
Premium customers use `250` so that the settlement path no longer rejects
approved high-value requests.

## BD-NG-001 Timeout error propagation

BD-NG-001: Timeout handling propagates the timeout as an error. The caller
expects `ERR_TIMEOUT` and must not treat timeout as a successful status update.

## BD-FRAUD-030 Fraud review path

BD-FRAUD-030: Fraud score review is a new decision point before final status
settlement. Scores at or above the approved threshold must use
`ERR_FRAUD_REVIEW`.
