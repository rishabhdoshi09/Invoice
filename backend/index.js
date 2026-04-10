// ─── LOAD .env FIRST — must be before ANY other require ──────────────────────
require('dotenv').config();

// ─── STARTUP ENV VALIDATION ──────────────────────────────────────────────────
// Fail fast if required environment variables are missing or obviously insecure.
// This runs before any module that imports from src/ so auth.js also gets the
// populated process.env before its module-level code executes.
// PASSWORD is intentionally excluded — empty string is valid for local PostgreSQL installs
const REQUIRED_ENV = ['DATABASE_NAME', 'DB_USER', 'DB_HOST', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.error(`[STARTUP] FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('[STARTUP] Add the missing variables to your .env file and restart.');
    process.exit(1);
}
if (process.env.JWT_SECRET === 'CHANGE_ME_generate_with_node_crypto_randomBytes_64_hex') {
    console.error(
        '[STARTUP] FATAL: JWT_SECRET is still the placeholder value. ' +
        'Generate a real secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
    process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
    console.error('[STARTUP] FATAL: JWT_SECRET is too short (minimum 32 characters). Use a cryptographically random value.');
    process.exit(1);
}

const express    = require('express');
const router     = express.Router();
const logger     = require('morgan');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const db         = require('./src/models');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser   = require('body-parser');
const path         = require('path');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
// helmet sets X-Content-Type-Options, X-Frame-Options, HSTS, etc.
app.use(helmet({
    // CSP: allow same-origin scripts (React bundle), block everything else.
    // Extend script-src if CDN assets are added in the future.
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'", "'unsafe-inline'"], // MUI requires inline styles
            imgSrc:         ["'self'", 'data:'],
            fontSrc:        ["'self'"],
            objectSrc:      ["'self'", 'blob:'], // pdfMake uses <object blob:> for invoice preview
            frameSrc:       ["'self'", 'blob:'], // pdfMake uses <iframe blob:> for invoice preview
            workerSrc:      ["'self'", 'blob:'], // PDF.js worker
            baseUri:        ["'self'"],
            frameAncestors: ["'none'"],
            formAction:     ["'self'"],
        },
    },
    // HSTS: enforce HTTPS for 1 year once TLS is enabled on the reverse proxy.
    strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
    },
}));

// ─── CORS — restrict to approved origins ─────────────────────────────────────
// Set CORS_ORIGINS in .env as a comma-separated list of allowed origins.
// Example: CORS_ORIGINS=http://localhost:3000,https://invoice.example.com
// Falls back to localhost:3000 in development when env var is absent.
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', `http://localhost:${process.env.PORT || 8001}`];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    },
    credentials: true
}));

// Trust the configured number of proxy hops so rate-limit reads the real
// client IP from X-Forwarded-For correctly.  Default=1 (one nginx hop).
// Set TRUST_PROXY_HOPS=0 if not behind a reverse proxy — otherwise an
// attacker can spoof X-Forwarded-For to bypass IP-based rate limiting.
const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '1', 10);
app.set('trust proxy', trustProxyHops);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Strict limit on authentication endpoints to block brute-force and credential
// stuffing attacks. 10 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: 'Too many login attempts. Please try again after 15 minutes.' }
});

// Broad API rate limit — 300 requests per minute per IP to prevent DoS.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: 'Too many requests. Please slow down.' }
});

// ─── Request logging ───────────────────────────────────────────────────────────
// Use 'combined' format in production for Apache-compatible access logs.
// 'dev' is verbose coloured output suitable only for local development.
app.use(logger(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Body parsing ──────────────────────────────────────────────────────────────
// SECURITY: 1 MB limit. The largest legitimate API payload (50-line invoice) is
// under 50 KB. A 100 MB limit is a trivial denial-of-service vector — one request
// can exhaust Node.js heap and crash the server for all users.
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: false }));
app.use(cookieParser());
app.use(compression());

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Apply BEFORE routes so every request, including un-authenticated ones, is limited.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);
app.use('/api', apiLimiter);

// ─── API routes ───────────────────────────────────────────────────────────────
require('./src/routes')(router);
app.use('/api', router);

// Serve static files from the React app
app.use(express.static(path.resolve(__dirname, '..', 'frontend', 'build')));

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  if (!req.url.startsWith('/api')) {
    res.sendFile(path.resolve(__dirname, '..', 'frontend', 'build', 'index.html'));
  }
});

const PORT = process.env.PORT || 8001;

const server = app.listen(PORT, async () => {
  try {
    await db.sequelize.authenticate();
    console.log('Connection has been established successfully.');

    // Schema changes are managed exclusively through versioned migrations.
    // Run: npx sequelize-cli db:migrate
    // Do NOT call sequelize.sync() here — it bypasses migration history and
    // causes non-deterministic schema drift across environments.

    // Start scheduled jobs (async, non-blocking)
    try {
      require('./src/scheduler').init(db);
    } catch (e) {
      console.warn('[SCHEDULER] Skipped — ' + e.message);
    }

    // Run a self-audit shortly after startup so the financialGuard has a fresh
    // reconciliation_runs row within the first 10 seconds, rather than waiting
    // up to 1 hour for the next cron tick.
    setTimeout(async () => {
      try {
        const SelfAuditService = require('./src/services/selfAuditService');
        const report = await new SelfAuditService(db).run({ writeHistory: true, triggeredBy: 'startup' });
        console.log(`[STARTUP AUDIT] Status: ${report.summary.overallStatus} — ` +
          `PASS=${report.summary.counts.PASS} FAIL=${report.summary.counts.FAIL} ` +
          `SKIP=${report.summary.counts.SKIP} (${report.durationMs}ms)`);
      } catch (e) {
        console.warn('[STARTUP AUDIT] Failed (non-fatal):', e.message);
      }
    }, 5000);

    console.log(`Server started on port: ${PORT}`);
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// On SIGTERM (docker stop / docker-compose down) we stop accepting new requests
// and let in-flight requests finish, then close the DB pool cleanly.
// Without this, Node is killed mid-request by SIGKILL after the Docker 10 s
// timeout, leaving users with confusing disconnection errors.
const SHUTDOWN_TIMEOUT_MS = 12000; // stay under Docker's 10s SIGKILL + 2s buffer

function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] ${signal} received — draining in-flight requests...`);

  server.close(async () => {
    console.log('[SHUTDOWN] HTTP server closed. Closing DB pool...');
    try {
      await db.sequelize.close();
      console.log('[SHUTDOWN] DB pool closed. Clean exit.');
    } catch (e) {
      console.error('[SHUTDOWN] DB pool close error:', e.message);
    }
    process.exit(0);
  });

  // Force exit if draining takes too long (prevents hanging on stuck requests)
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
