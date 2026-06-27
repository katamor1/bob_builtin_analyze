# Appendix: Skill Examples

> **Note:** This appendix contains comprehensive examples of different types of skills across various knowledge domains. Use these examples when building new skills or when users need clarification on what different skill types look like.

## Example 1: Deployment Process Skill

### Use Case

Team needs to standardize their production deployment process with clear steps and rollback procedures.

### Skill Structure

```markdown
---
name: production-deployment
description: Guides production deployment process with validation and rollback procedures. Use when user asks to "deploy to production", "release new version", "push to prod", or mentions "deployment checklist" or "release process".
---

# Production Deployment

Standardized process for deploying applications to production environment.

## Prerequisites

- Deployment approval from change management
- All tests passing in staging environment
- Backup of current production state completed
- Deployment window scheduled and communicated

## Instructions

### Step 1: Pre-Deployment Validation

**Verify Prerequisites:**

1. Check change ticket status: `APPROVED`
2. Verify staging tests: All green
3. Confirm backup completion time
4. Review deployment checklist

**If any prerequisite fails:**

- Stop deployment process
- Address the issue
- Re-validate before proceeding

### Step 2: Execute Deployment

**Deployment Steps:**

1. Enable maintenance mode
2. Stop application services
3. Deploy new version
4. Run database migrations
5. Start application services
6. Disable maintenance mode

**Monitor During Deployment:**

- Application logs for errors
- System resource usage
- Database connection pool

### Step 3: Post-Deployment Validation

**Validation Checklist:**

- [ ] Application responds to health check
- [ ] Critical user flows functional
- [ ] No error spikes in logs
- [ ] Performance metrics within acceptable range

**If validation fails:**

- Proceed to Step 4: Rollback

### Step 4: Rollback (If Needed)

**Rollback Steps:**

1. Enable maintenance mode
2. Stop application services
3. Restore previous version
4. Rollback database migrations
5. Start application services
6. Verify rollback successful
7. Disable maintenance mode

## Troubleshooting

### Issue: Database Migration Fails

**Symptoms:**

- Migration script errors
- Application cannot connect to database

**Solution:**

1. Check migration logs for specific error
2. Verify database credentials
3. Ensure database has sufficient space
4. Rollback migration if needed
5. Fix migration script
6. Re-attempt deployment

## Best Practices

1. **Always Test in Staging First** - Never deploy untested changes
2. **Communicate Clearly** - Notify stakeholders before, during, and after
3. **Monitor Actively** - Watch logs and metrics during deployment
4. **Document Issues** - Record any problems for future reference
```

### Why This Works

- Clear prerequisites prevent common issues
- Step-by-step process reduces errors
- Rollback procedure provides safety net
- Validation ensures deployment success
- Troubleshooting addresses common problems

---

## Example 2: API Integration Skill

### Use Case

Developers need guidance on integrating with a third-party API, including authentication, error handling, and rate limiting.

### Skill Structure

```markdown
---
name: payment-api-integration
description: Guides integration with payment processing API including authentication, error handling, and retry logic. Use when user asks to "integrate payment API", "add payment processing", "implement payment gateway", or mentions "payment API" or "transaction processing".
---

# Payment API Integration

Integration guide for the payment processing API with best practices for reliability and security.

## Prerequisites

- API credentials (client ID and secret)
- SSL/TLS certificates configured
- Network access to API endpoints
- Understanding of OAuth 2.0 flow

## Instructions

### Step 1: Authentication

**OAuth 2.0 Flow:**

1. Request access token using client credentials
2. Store token securely (never in code)
3. Include token in Authorization header
4. Refresh token before expiration

**Example:**

\`\`\`java
// Request access token
TokenResponse token = authClient.requestToken(
clientId,
clientSecret,
"client_credentials"
);

// Use token in API calls
HttpHeaders headers = new HttpHeaders();
headers.setBearerAuth(token.getAccessToken());
\`\`\`

### Step 2: Make API Requests

**Request Structure:**

\`\`\`java
PaymentRequest request = PaymentRequest.builder()
.amount(new BigDecimal("100.00"))
.currency("USD")
.customerId(customerId)
.description("Order #12345")
.build();

PaymentResponse response = paymentClient.processPayment(request);
\`\`\`

**Important:**

- Always use HTTPS
- Validate all input data
- Log requests (excluding sensitive data)
- Set appropriate timeouts

### Step 3: Error Handling

**Error Categories:**

1. **Transient Errors (Retry)**
   - Network timeouts
   - Rate limit exceeded
   - Service temporarily unavailable

2. **Permanent Errors (Don't Retry)**
   - Invalid credentials
   - Malformed request
   - Insufficient funds

**Retry Strategy:**

\`\`\`java
RetryPolicy retryPolicy = RetryPolicy.builder()
.maxAttempts(3)
.backoff(ExponentialBackoff.builder()
.initialDelay(Duration.ofSeconds(1))
.maxDelay(Duration.ofSeconds(10))
.multiplier(2.0)
.build())
.retryOn(TransientException.class)
.build();
\`\`\`

### Step 4: Rate Limiting

**API Limits:**

- 100 requests per minute per client
- 1000 requests per hour per client

**Implementation:**

\`\`\`java
RateLimiter rateLimiter = RateLimiter.create(100.0 / 60.0); // 100 per minute

public PaymentResponse processPayment(PaymentRequest request) {
rateLimiter.acquire(); // Wait if necessary
return paymentClient.processPayment(request);
}
\`\`\`

## Troubleshooting

### Issue: 401 Unauthorized

**Cause:** Invalid or expired access token

**Solution:**

1. Verify client credentials are correct
2. Check token expiration time
3. Request new access token
4. Ensure token is included in Authorization header

### Issue: 429 Too Many Requests

**Cause:** Rate limit exceeded

**Solution:**

1. Implement exponential backoff
2. Check Retry-After header
3. Reduce request frequency
4. Consider request batching

## Best Practices

1. **Secure Credentials** - Use environment variables or secret management
2. **Implement Idempotency** - Use idempotency keys for payment requests
3. **Log Thoroughly** - Log all API interactions (excluding sensitive data)
4. **Monitor Performance** - Track API response times and error rates
5. **Handle Webhooks** - Implement webhook handlers for async notifications
```

### Why This Works

- Covers complete integration lifecycle
- Includes security best practices
- Provides concrete code examples
- Addresses common error scenarios
- Implements reliability patterns

---

## Example 3: Database Troubleshooting Skill

### Use Case

Operations team needs systematic approach to diagnosing and resolving database connection issues.

### Skill Structure

```markdown
---
name: database-connection-troubleshooting
description: Systematic troubleshooting for database connection issues across DB2, Oracle, and PostgreSQL. Use when user asks to "fix database connection", "debug DB errors", "connection timeout", or mentions "database connectivity" or "connection pool".
---

# Database Connection Troubleshooting

Systematic approach to diagnosing and resolving database connection issues.

## Prerequisites

- Access to application logs
- Access to database logs
- Network diagnostic tools (ping, telnet, netstat)
- Database client tools

## Instructions

### Step 1: Identify Symptoms

**Common Symptoms:**

- Connection timeout errors
- "Too many connections" errors
- Intermittent connection failures
- Slow query performance
- Connection pool exhausted

**Gather Information:**

1. Error messages from application logs
2. Timestamp of first occurrence
3. Frequency of errors
4. Affected applications/users

### Step 2: Check Network Connectivity

**Network Tests:**

\`\`\`bash

# Test basic connectivity

ping database-host

# Test port accessibility

telnet database-host 5432

# Check active connections

netstat -an | grep 5432
\`\`\`

**If network test fails:**

- Check firewall rules
- Verify DNS resolution
- Check network routing
- Contact network team

### Step 3: Verify Database Status

**Database Health Checks:**

\`\`\`sql
-- Check database is running
SELECT 1;

-- Check active connections
SELECT count(\*) FROM pg_stat_activity;

-- Check connection limits
SHOW max_connections;

-- Check for locks
SELECT \* FROM pg_locks WHERE NOT granted;
\`\`\`

**If database is down:**

- Check database logs
- Verify database service status
- Check disk space
- Review recent changes

### Step 4: Analyze Connection Pool

**Connection Pool Metrics:**

\`\`\`java
// Check pool statistics
HikariPoolMXBean poolMXBean = hikariDataSource.getHikariPoolMXBean();
int activeConnections = poolMXBean.getActiveConnections();
int idleConnections = poolMXBean.getIdleConnections();
int totalConnections = poolMXBean.getTotalConnections();
int threadsAwaitingConnection = poolMXBean.getThreadsAwaitingConnection();
\`\`\`

**Common Pool Issues:**

1. **Pool Exhausted**
   - Increase pool size
   - Reduce connection timeout
   - Fix connection leaks

2. **Connection Leaks**
   - Review code for unclosed connections
   - Enable connection leak detection
   - Add try-with-resources blocks

### Step 5: Review Configuration

**Check Configuration:**

\`\`\`properties

# Connection pool settings

spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000

# Database settings

spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=${DB_USER}
spring.datasource.password=${DB_PASSWORD}
\`\`\`

**Validate:**

- Connection URL format
- Credentials are correct
- Timeout values are appropriate
- Pool size matches workload

## Troubleshooting

### Issue: Connection Timeout

**Symptoms:**

- "Connection timeout" in logs
- Long wait times for connections

**Diagnostic Steps:**

1. Check network latency: `ping database-host`
2. Verify port is open: `telnet database-host 5432`
3. Check database load: CPU, memory, disk I/O
4. Review connection timeout setting

**Solutions:**

- Increase connection timeout
- Optimize slow queries
- Scale database resources
- Add connection retry logic

### Issue: Too Many Connections

**Symptoms:**

- "FATAL: too many connections" error
- New connections rejected

**Diagnostic Steps:**

1. Count active connections
2. Identify connection sources
3. Check for connection leaks
4. Review max_connections setting

**Solutions:**

- Close idle connections
- Fix connection leaks in code
- Increase max_connections (if resources allow)
- Implement connection pooling

## Best Practices

1. **Monitor Proactively** - Set up alerts for connection issues
2. **Use Connection Pooling** - Never create connections per request
3. **Close Connections** - Always close in finally block or use try-with-resources
4. **Set Appropriate Timeouts** - Balance responsiveness and reliability
5. **Log Connection Events** - Track connection lifecycle for debugging
```

### Why This Works

- Systematic diagnostic approach
- Covers multiple database types
- Includes specific commands and queries
- Addresses root causes, not just symptoms
- Provides preventive measures

---

## Example 4: Security Best Practices Skill

### Use Case

Development team needs guidance on implementing security best practices in their applications.

### Skill Structure

```markdown
---
name: application-security-practices
description: Security best practices for application development including authentication, authorization, data protection, and vulnerability prevention. Use when user asks to "implement security", "secure application", "add authentication", or mentions "security best practices" or "vulnerability prevention".
---

# Application Security Best Practices

Comprehensive security guidelines for application development.

## Prerequisites

- Understanding of OWASP Top 10
- Access to security scanning tools
- Knowledge of encryption basics
- Familiarity with authentication protocols

## Instructions

### Step 1: Authentication

**Implement Strong Authentication:**

\`\`\`java
// Use bcrypt for password hashing
BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
String hashedPassword = encoder.encode(plainPassword);

// Verify password
boolean matches = encoder.matches(plainPassword, hashedPassword);
\`\`\`

**Best Practices:**

- Never store passwords in plain text
- Use strong hashing algorithms (bcrypt, Argon2)
- Implement account lockout after failed attempts
- Require strong passwords (length, complexity)
- Support multi-factor authentication

### Step 2: Authorization

**Implement Role-Based Access Control:**

\`\`\`java
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(Long userId) {
userRepository.deleteById(userId);
}

@PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
public List<User> getAllUsers() {
return userRepository.findAll();
}
\`\`\`

**Best Practices:**

- Implement principle of least privilege
- Use role-based or attribute-based access control
- Validate authorization on every request
- Don't rely on client-side checks alone

### Step 3: Data Protection

**Encrypt Sensitive Data:**

\`\`\`java
// Encrypt data at rest
Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmParameterSpec);
byte[] encryptedData = cipher.doFinal(plainData);

// Use HTTPS for data in transit
// Configure in application.properties:
server.ssl.enabled=true
server.ssl.key-store=classpath:keystore.p12
server.ssl.key-store-password=${KEYSTORE_PASSWORD}
\`\`\`

**Best Practices:**

- Encrypt sensitive data at rest
- Use TLS/HTTPS for data in transit
- Protect encryption keys (use key management service)
- Implement data masking for logs

### Step 4: Input Validation

**Validate and Sanitize Input:**

\`\`\`java
// Use validation annotations
public class UserRequest {
@NotBlank
@Size(min = 3, max = 50)
@Pattern(regexp = "^[a-zA-Z0-9_]+$")
private String username;

    @Email
    @NotBlank
    private String email;

    @NotNull
    @Min(18)
    @Max(120)
    private Integer age;

}

// Sanitize HTML input
String sanitized = Jsoup.clean(userInput, Whitelist.basic());
\`\`\`

**Best Practices:**

- Validate all input on server side
- Use whitelist validation when possible
- Sanitize output to prevent XSS
- Use parameterized queries to prevent SQL injection

## Troubleshooting

### Issue: Session Hijacking

**Symptoms:**

- Unauthorized access to user accounts
- Session tokens being reused

**Prevention:**

1. Use secure, httpOnly cookies
2. Implement session timeout
3. Regenerate session ID after login
4. Use HTTPS only
5. Implement CSRF protection

### Issue: SQL Injection Vulnerability

**Symptoms:**

- Unexpected database queries in logs
- Data exposure or modification

**Prevention:**

\`\`\`java
// BAD - Vulnerable to SQL injection
String query = "SELECT \* FROM users WHERE username = '" + username + "'";

// GOOD - Use parameterized queries
String query = "SELECT \* FROM users WHERE username = ?";
PreparedStatement stmt = connection.prepareStatement(query);
stmt.setString(1, username);
\`\`\`

## Best Practices

1. **Defense in Depth** - Implement multiple layers of security
2. **Fail Securely** - Default to deny access on errors
3. **Keep Dependencies Updated** - Regularly update libraries and frameworks
4. **Log Security Events** - Monitor for suspicious activity
5. **Regular Security Audits** - Conduct code reviews and penetration testing
```

### Why This Works

- Covers critical security domains
- Provides concrete code examples
- Includes both prevention and detection
- Addresses common vulnerabilities
- Follows industry standards (OWASP)

---

## Key Patterns Across Examples

### Common Elements

1. **Clear Prerequisites** - What's needed before starting
2. **Step-by-Step Instructions** - Actionable workflow
3. **Code Examples** - Concrete implementations
4. **Troubleshooting** - Common issues and solutions
5. **Best Practices** - Guidelines and rationale

### Adaptation Guidelines

**For Your Domain:**

1. Identify the core workflow or process
2. Break it into logical phases
3. Provide examples relevant to your context
4. Address common problems in your domain
5. Include domain-specific best practices

**Quality Indicators:**

- Can a team member follow the skill without asking questions?
- Are examples directly applicable to real scenarios?
- Does troubleshooting cover actual problems encountered?
- Are best practices explained with rationale?

---

**Next Steps:** Use these examples as inspiration when creating skills for your specific knowledge domains. Adapt the structure and content to match your needs.
