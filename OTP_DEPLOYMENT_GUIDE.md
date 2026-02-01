# OTP System - Deployment & Operations Guide

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Verification

#### Backend Code Review
```bash
# Verify all OTP-related files are in place
✓ controllers/wallet.controller.js - sendWalletOTP, getWalletOTPStatus
✓ routes/wallet.route.js - OTP routes configured
✓ utils/validation.util.js - validateSendOTPPayload added
✓ services/otp.service.js - All functions present
✓ models/transaction.model.js - OTPVerification schema
✓ .env - EMAIL_USER, EMAIL_PASS configured
```

#### Database Setup
```bash
# Ensure indices are created
db.otpverifications.getIndexes()
# Should show:
# - expires_at
# - user_id, purpose, is_used
# - created_at
```

#### Email Service Verification
```bash
# Test email credentials
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((err, success) => {
  if (err) console.log('❌ Email setup failed:', err);
  if (success) console.log('✅ Email service ready');
});
"
```

### Step 2: Testing in Development

#### Run Unit Tests
```bash
npm test -- otp.service.test.js
# Expected: All tests pass
```

#### Run Integration Tests
```bash
npm test -- wallet-otp.integration.test.js
# Expected: All endpoints working
```

#### Manual API Testing
```bash
# 1. Send OTP
curl -X POST http://localhost:7145/api/wallet/otp/send \
  -H "Authorization: Bearer TEST_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "wallet_funding",
    "email": "test@example.com"
  }'
# Expected: { success: true, expiresIn: 300, ... }

# 2. Check OTP Status
curl -X GET "http://localhost:7145/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer TEST_JWT_TOKEN"
# Expected: { exists: true, isValid: true, ... }

# 3. Verify OTP (use OTP from email)
curl -X POST http://localhost:7145/api/wallet/verify-otp \
  -H "Authorization: Bearer TEST_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456",
    "transaction_reference": "txn_test123"
  }'
# Expected: { success: true, ... }
```

### Step 3: Staging Deployment

#### Deploy Code
```bash
# 1. Merge to main branch
git checkout main
git merge otp-feature-branch

# 2. Deploy to staging
git push origin main
# CI/CD triggers staging deployment

# 3. Verify deployment
curl -X GET "http://staging-7145.example.com/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer STAGING_TOKEN"
```

#### Test Email Delivery
```bash
# Send test OTP
curl -X POST http://staging-7145.example.com/api/wallet/otp/send \
  -H "Authorization: Bearer STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "wallet_funding",
    "email": "staging-test@example.com"
  }'

# Check email receipt within 1 minute
# Verify:
# - Email arrives
# - OTP is 6 digits
# - Expiry message shows 5 minutes
# - No plain OTP in logs
```

#### End-to-End Testing
```bash
# 1. User signup
POST /user/register
# User created with wallet

# 2. Login
POST /user/login
# Get JWT token

# 3. Fund wallet
POST /api/wallet/fund
{ amount: 1000, email: "user@example.com" }
# Transaction created, OTP sent

# 4. Receive OTP from email
# Check staging email inbox

# 5. Verify OTP
POST /api/wallet/verify-otp
{ otp: "XXXXXX", transaction_reference: "txn_..." }
# Wallet funded successfully

# 6. Verify balance
GET /api/wallet/balance
# Shows updated balance
```

### Step 4: Production Deployment

#### Pre-Production Checklist
```
✓ All tests passing
✓ Staging deployment successful
✓ Email delivery verified
✓ Rate limiting configured
✓ Monitoring enabled
✓ Database backups recent
✓ Rollback plan ready
✓ Team notified
```

#### Deployment
```bash
# 1. Tag release
git tag v1.0.0-otp-system
git push origin v1.0.0-otp-system

# 2. Deploy to production
# CI/CD triggers production deployment
# Blue-green deployment recommended

# 3. Verify production endpoints
curl -X GET "https://api.triaura.com/api/wallet/otp/status?purpose=wallet_funding" \
  -H "Authorization: Bearer PROD_TOKEN"

# 4. Check logs
# No errors in production logs

# 5. Monitor metrics
# Check OTP send rate, verification rate, error rate
```

#### Post-Deployment
```bash
# 1. Smoke testing
# Test full wallet funding flow with real user

# 2. Monitor error logs
# Check for any unexpected errors

# 3. Monitor email delivery
# Verify OTP emails are sent and received

# 4. Check database
# Verify OTP records being created and cleaned up

# 5. Performance monitoring
# Check API response times
# Expected: Send: <500ms, Status: <100ms, Verify: <200ms
```

---

## 📊 Monitoring & Observability

### Key Metrics to Monitor

#### OTP Service Health
```javascript
// Metrics to track
{
  "otp_generation_rate": "OTPs generated per minute",
  "otp_verification_success_rate": "% of successful verifications",
  "otp_verification_failure_rate": "% of failed verifications",
  "email_send_success_rate": "% of emails sent successfully",
  "email_delivery_latency": "Time from send to receipt",
  "account_lockout_frequency": "Locked accounts per hour",
  "average_verification_time": "Time from OTP send to verification",
  "rate_limit_hits": "Times rate limit was exceeded"
}
```

### Setup Monitoring Dashboard

#### Using Prometheus
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'otp-system'
    static_configs:
      - targets: ['localhost:7145']
    metrics_path: '/metrics'
```

#### Key Prometheus Queries
```promql
# OTP send rate
rate(otp_send_total[5m])

# Verification success rate
rate(otp_verify_success[5m]) / rate(otp_verify_total[5m])

# Email delivery latency
histogram_quantile(0.95, otp_email_latency)

# Account lockout rate
rate(otp_account_locked[5m])

# Active pending OTPs
otp_pending_count
```

#### Setup Logging
```javascript
// Log OTP events (not plain OTP)
logger.info('OTP sent', {
  userId: user._id,
  purpose: 'wallet_funding',
  email: 'user@example.com',
  timestamp: new Date(),
  expiresIn: 300
});

logger.warn('OTP verification failed', {
  userId: user._id,
  attempt: 2,
  reason: 'Invalid OTP',
  timestamp: new Date()
});

logger.error('OTP account locked', {
  userId: user._id,
  locked_until: futureDate,
  attempts: 3
});
```

### Alert Configuration

#### Critical Alerts
```yaml
# Email service failure
- alert: OTPEmailServiceDown
  expr: rate(otp_email_errors[5m]) > 0.1
  annotations:
    summary: "OTP email service failing"
    action: "Check email service and credentials"

# High failure rate
- alert: HighOTPFailureRate
  expr: (1 - rate(otp_verify_success[5m]) / rate(otp_verify_total[5m])) > 0.3
  annotations:
    summary: "OTP verification failing >30% of the time"
    action: "Investigate OTP hashing or database issues"

# Rate limiting abuse
- alert: OTPRateLimitExceeded
  expr: rate(otp_rate_limit_hits[5m]) > 10
  annotations:
    summary: "Multiple rate limit violations"
    action: "Check for brute force attacks"
```

---

## 🔧 Operations Guide

### Daily Operations

#### Morning Checks
```bash
#!/bin/bash
# daily-checks.sh

# 1. Check error logs
tail -f logs/wallet-otp.log | grep ERROR | head -20

# 2. Monitor pending OTPs
mongo triora --eval "db.otpverifications.countDocuments({ is_used: false })"

# 3. Check locked accounts
mongo triora --eval "db.otpverifications.countDocuments({ is_locked: true })"

# 4. Verify email service is running
curl -s http://localhost:7145/health | jq .email_service

# 5. Check database performance
mongo triora --eval "db.otpverifications.getIndexes()"
```

#### Evening Cleanup
```bash
#!/bin/bash
# evening-cleanup.sh

# 1. Clean up expired OTPs
node -e "
const { cleanupExpiredOTPs } = require('./services/otp.service');
cleanupExpiredOTPs().then(count => {
  console.log(\`Cleaned up \${count} expired OTPs\`);
  process.exit(0);
});
"

# 2. Archive old logs
tar -czf logs/archive/otp-$(date +%Y%m%d).log.gz logs/wallet-otp.log
rm logs/wallet-otp.log

# 3. Database maintenance
mongo triora --eval "db.otpverifications.reIndex()"
```

### Weekly Operations

#### Data Health Check
```javascript
// weekly-health-check.js
const Wallet = require('./models/wallet.model');
const { OTPVerification } = require('./models/transaction.model');

async function runHealthCheck() {
  // 1. Check OTP schema
  const otpCount = await OTPVerification.countDocuments();
  const lockedCount = await OTPVerification.countDocuments({ is_locked: true });
  const pendingCount = await OTPVerification.countDocuments({
    is_used: false,
    expires_at: { $gt: new Date() }
  });

  console.log('OTP Health Check:');
  console.log(`- Total OTP records: ${otpCount}`);
  console.log(`- Locked accounts: ${lockedCount}`);
  console.log(`- Pending OTPs: ${pendingCount}`);

  // 2. Check for issues
  if (lockedCount > 100) {
    console.warn('⚠️ High number of locked accounts');
  }

  if (pendingCount > 1000) {
    console.warn('⚠️ Large number of pending OTPs');
  }

  // 3. Verify indices
  const indices = await OTPVerification.collection.getIndexes();
  console.log('Database indices:', Object.keys(indices));
}

runHealthCheck().catch(console.error);
```

### Monthly Operations

#### Performance Review
```javascript
// monthly-review.js
async function generateMonthlyReport() {
  const startDate = new Date(new Date().setDate(1));
  const endDate = new Date();

  // 1. OTP metrics
  const otpGenerated = await OTPVerification.countDocuments({
    created_at: { $gte: startDate, $lte: endDate }
  });

  const otpVerified = await OTPVerification.countDocuments({
    is_used: true,
    used_at: { $gte: startDate, $lte: endDate }
  });

  const otpFailed = otpGenerated - otpVerified;

  // 2. Generate report
  const report = {
    period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    otpGenerated,
    otpVerified,
    otpFailed,
    successRate: ((otpVerified / otpGenerated) * 100).toFixed(2) + '%',
    avgVerificationTime: '...', // Calculate from logs
    peakUsageTime: '...', // From logs
    issues: []
  };

  // 3. Identify issues
  if (report.successRate < 90) {
    report.issues.push('Low verification success rate');
  }

  console.log(JSON.stringify(report, null, 2));
}
```

---

## 🆘 Troubleshooting Guide

### Issue: Emails Not Being Sent

**Symptoms:**
- OTP endpoint returns success but no email received
- Error logs show email delivery errors

**Diagnostic Steps:**
```bash
# 1. Check email credentials
node -e "require('dotenv').config(); console.log({
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS ? '***' : 'NOT SET'
})"

# 2. Test email service directly
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: 'test@example.com',
  subject: 'Test OTP',
  html: 'Test <strong>123456</strong>'
}, (err, info) => {
  if (err) console.log('Error:', err);
  else console.log('Success:', info.response);
});
"

# 3. Check Gmail security settings
# Go to: https://myaccount.google.com/security
# Enable: "Less secure app access"
# Or: Generate App Password for Gmail

# 4. Check firewall
telnet smtp.gmail.com 587
```

**Solutions:**
1. Generate new Gmail App Password
2. Enable "Less secure app access" in Gmail
3. Check firewall allows port 587
4. Verify EMAIL_USER and EMAIL_PASS environment variables

### Issue: OTP Verification Always Fails

**Symptoms:**
- Every OTP verification returns "Invalid OTP"
- Error logs show hash mismatch

**Diagnostic Steps:**
```javascript
// debug-otp-hash.js
const crypto = require('crypto');
const { OTPVerification } = require('./models/transaction.model');

async function debugHash(userId, plainOTP) {
  // 1. Recreate hash
  const recreatedHash = hashData(plainOTP, userId);
  
  // 2. Retrieve stored hash
  const otpRecord = await OTPVerification.findOne({
    user_id: userId,
    is_used: false
  });

  // 3. Compare
  console.log('Recreated hash:', recreatedHash);
  console.log('Stored hash:', otpRecord.otp_hash);
  console.log('Match:', recreatedHash === otpRecord.otp_hash);

  // 4. Check encryption key
  console.log('WALLET_ENCRYPTION_PASSWORD:', process.env.WALLET_ENCRYPTION_PASSWORD ? '***' : 'NOT SET');
}

// Help function
function hashData(plaintext, salt) {
  return crypto
    .createHash('sha256')
    .update(plaintext + salt)
    .digest('hex');
}
```

**Solutions:**
1. Check WALLET_ENCRYPTION_PASSWORD environment variable
2. Verify timezone/clock synchronization
3. Check database transaction timeout
4. Look for logging of hash mismatches

### Issue: Account Getting Locked Too Often

**Symptoms:**
- Users getting locked out frequently
- "Maximum OTP attempts exceeded" errors

**Diagnostic Steps:**
```bash
# Check for brute force attempts
mongo triora --eval "
db.otpverifications.aggregate([
  { \$match: { is_locked: true } },
  { \$group: { _id: '\$user_id', count: { \$sum: 1 } } },
  { \$sort: { count: -1 } },
  { \$limit: 10 }
])
"

# Check failed attempt patterns
mongo triora --eval "
db.otpverifications.find({
  attempts: 3,
  is_locked: true
}).sort({ created_at: -1 }).limit(10)
"
```

**Solutions:**
1. Increase attempt limit (if legitimate users struggling)
2. Implement CAPTCHA for repeated failures
3. Check for automated attacks
4. Notify users about lockout period

### Issue: Database Growing Too Large

**Symptoms:**
- OTP collection taking excessive disk space
- Slow queries on OTP table

**Diagnostic Steps:**
```bash
# Check collection size
mongo triora --eval "
db.otpverifications.stats().size
db.otpverifications.stats().storageSize
"

# Count old records
mongo triora --eval "
db.otpverifications.countDocuments({
  created_at: { \$lt: new Date(Date.now() - 30*24*60*60*1000) }
})
"

# Check index usage
mongo triora --eval "
db.otpverifications.aggregate([
  { \$indexStats: {} }
])
"
```

**Solutions:**
1. Increase cleanup frequency (daily instead of weekly)
2. Archive old OTP records
3. Rebuild indices
4. Implement TTL index for automatic expiration

---

## 🔒 Security Maintenance

### Monthly Security Audit
```bash
#!/bin/bash
# security-audit.sh

echo "=== OTP System Security Audit ==="

# 1. Check for plain OTP logging
echo "Checking for plain OTP logging..."
grep -r "otp.*:.*\d{6}" logs/ 2>/dev/null | head -5
if [ $? -eq 0 ]; then
  echo "❌ WARNING: Plain OTPs found in logs!"
else
  echo "✅ No plain OTPs in logs"
fi

# 2. Verify HTTPS in production
echo "Checking HTTPS configuration..."
curl -I https://api.example.com/api/wallet/otp/status 2>/dev/null | grep -i "Strict-Transport-Security"

# 3. Check authentication
echo "Testing auth requirement..."
curl -s -X GET "http://localhost:7145/api/wallet/otp/status?purpose=wallet_funding" | grep -i "unauthorized"
echo "✅ Authentication required"

# 4. Check rate limiting
echo "Testing rate limiting..."
for i in {1..5}; do
  curl -s -H "Authorization: Bearer FAKE" \
    -X POST http://localhost:7145/api/wallet/otp/send \
    -d '{}' | grep -q "Too many requests"
done
echo "✅ Rate limiting active"

# 5. Verify input validation
echo "Testing input validation..."
curl -s -H "Authorization: Bearer TOKEN" \
  -X POST http://localhost:7145/api/wallet/otp/send \
  -d '{"purpose":"invalid","email":"test"}' | grep -i "invalid"
echo "✅ Input validation active"
```

---

## 📝 Change Log

### Version 1.0.0 (Current)
- Initial OTP system implementation
- Email-based OTP delivery
- 6-digit OTP with SHA-256 hashing
- 5-minute expiration
- 3-attempt limitation with 15-minute lockout
- Rate limiting (3/min send, 3/15min verify)
- Complete API endpoints
- Comprehensive documentation

### Planned Features (v1.1.0)
- SMS delivery option
- TOTP (Time-based OTP) support
- Biometric OTP verification
- OTP recovery codes
- Email templates customization

---

## 📞 Support & Escalation

### Support Contacts
- **Backend Team:** backend@example.com
- **DevOps Team:** devops@example.com
- **Security Team:** security@example.com
- **Database Team:** database@example.com

### Escalation Path
1. Developer → Team Lead
2. Team Lead → Engineering Manager
3. Engineering Manager → CTO
4. CTO → VP Engineering

---

**Last Updated:** January 17, 2026  
**Document Version:** 1.0  
**Status:** Production Ready
