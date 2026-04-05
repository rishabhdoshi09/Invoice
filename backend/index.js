// ─── LOAD .env FIRST — must be before ANY other require ──────────────────────
require('dotenv').config();

// ─── STARTUP ENV VALIDATION ──────────────────────────────────────────────────
// Fail fast if required environment variables are missing or obviously insecure.
// This runs before any module that imports from src/ so auth.js also gets the
// populated process.env before its module-level code executes.
const REQUIRED_ENV = ['DATABASE_NAME', 'DB_USER', 'PASSWORD', 'DB_HOST', 'JWT_SECRET'];
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
    // CSP is intentionally left to application teams; skip for now to avoid
    // breaking the embedded React frontend.
    contentSecurityPolicy: false
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

// Trust the first proxy hop (nginx / load balancer) so rate-limit can read
// the real client IP from X-Forwarded-For instead of throwing a validation error.
// Set to false or adjust the hop count if not behind a reverse proxy.
app.set('trust proxy', 1);

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

app.use(logger('dev'));

app.use(bodyParser.json({ limit: '100mb'}));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }));

// Apply auth rate limiter before route registration
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);

// Apply broad API limiter
app.use('/api', apiLimiter);

require('./src/routes')(router);
app.use('/api', router);
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({ limit: '100mb', extended: false, parameterLimit: 5000 }));
app.use(cookieParser());
app.use(compression());

// Serve static files from the React app
app.use(express.static(path.resolve(__dirname, '..', 'frontend', 'build')));

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  if (!req.url.startsWith('/api')) {
    res.sendFile(path.resolve(__dirname, '..', 'frontend', 'build', 'index.html'));
  }
});

const PORT = 8001;

app.listen(PORT, async () => {
  try {
    await db.sequelize.authenticate();
    console.log('Connection has been established successfully.');

    // Schema changes are managed exclusively through versioned migrations.
    // Run: npx sequelize-cli db:migrate
    // Do NOT call sequelize.sync() here — it bypasses migration history and
    // causes non-deterministic schema drift across environments.

    // Safe additive column fixes — only add columns that are missing.
    // These are safe nullable columns that will never break existing data.
    try {
      const qi = db.sequelize.getQueryInterface();

      // accounts table — add columns introduced in new ledger model
      const accountsCols = await qi.describeTable('accounts').catch(() => null);
      if (accountsCols) {
        const accountFixes = [
          ['description',    { type: db.Sequelize.TEXT,           allowNull: true }],
          ['subType',        { type: db.Sequelize.STRING(50),      allowNull: true }],
          ['parentId',       { type: db.Sequelize.UUID,            allowNull: true }],
          ['partyId',        { type: db.Sequelize.UUID,            allowNull: true }],
          ['partyType',      { type: db.Sequelize.STRING(20),      allowNull: true }],
          ['isSystemAccount',{ type: db.Sequelize.BOOLEAN,         allowNull: false, defaultValue: false }],
          ['isActive',       { type: db.Sequelize.BOOLEAN,         allowNull: false, defaultValue: true }],
        ];
        for (const [col, def] of accountFixes) {
          if (!accountsCols[col]) {
            await qi.addColumn('accounts', col, def);
            console.log(`[SCHEMA] Added missing column accounts.${col}`);
          }
        }
      }

      // accounts.type enum — the old enum only has lowercase values.
      // Add uppercase + EQUITY so the new ledger model can insert correctly.
      const enumFix = [
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='ASSET'    AND enumtypid='enum_accounts_type'::regtype) THEN ALTER TYPE enum_accounts_type ADD VALUE 'ASSET';    END IF; END $$;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='LIABILITY' AND enumtypid='enum_accounts_type'::regtype) THEN ALTER TYPE enum_accounts_type ADD VALUE 'LIABILITY'; END IF; END $$;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='INCOME'   AND enumtypid='enum_accounts_type'::regtype) THEN ALTER TYPE enum_accounts_type ADD VALUE 'INCOME';   END IF; END $$;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='EXPENSE'  AND enumtypid='enum_accounts_type'::regtype) THEN ALTER TYPE enum_accounts_type ADD VALUE 'EXPENSE';  END IF; END $$;",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='EQUITY'   AND enumtypid='enum_accounts_type'::regtype) THEN ALTER TYPE enum_accounts_type ADD VALUE 'EQUITY';   END IF; END $$;",
      ];
      for (const sql of enumFix) {
        await db.sequelize.query(sql).catch(e => console.warn('[SCHEMA] Enum fix skipped:', e.message));
      }

      // ledger_entries table — add transactionDate denorm column
      const entryCols = await qi.describeTable('ledger_entries').catch(() => null);
      if (entryCols && !entryCols.transactionDate) {
        await qi.addColumn('ledger_entries', 'transactionDate', {
          type: db.Sequelize.DATEONLY, allowNull: true
        });
        console.log('[SCHEMA] Added missing column ledger_entries.transactionDate');
      }
    } catch (e) {
      console.warn('[SCHEMA] Column auto-fix skipped:', e.message);
    }

    // Start scheduled jobs (async, non-blocking)
    try {
      require('./src/scheduler').init(db);
    } catch (e) {
      console.warn('[SCHEDULER] Skipped — ' + e.message);
    }

    console.log(`Server started on port: ${PORT}`);
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
});
