const { authenticate, authorize } = require('../middleware/auth');
const { spawn } = require('child_process');
const zlib = require('zlib');
const multer = require('multer');

// Store uploaded backup in memory (max 500 MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.originalname.endsWith('.sql.gz') || file.mimetype === 'application/gzip') {
            cb(null, true);
        } else {
            cb(new Error('Only .sql.gz backup files are accepted.'));
        }
    }
});

module.exports = (router) => {
    /**
     * GET /api/backup/download
     * Streams a live pg_dump of the database as a gzipped SQL file.
     * Admin-only. Credentials come from environment variables only.
     */
    router.get('/backup/download', authenticate, authorize('admin'), (req, res) => {
        const {
            PASSWORD,
            DB_USER,
            DATABASE_NAME,
            DB_HOST = '127.0.0.1',
            DB_PORT = '5432'
        } = process.env;

        if (!PASSWORD || !DB_USER || !DATABASE_NAME) {
            return res.status(500).json({
                status: 500,
                message: 'Database credentials not configured in environment.'
            });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `backup_${DATABASE_NAME}_${timestamp}.sql.gz`;

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const env = { ...process.env, PGPASSWORD: PASSWORD };

        const pg_dump = spawn('pg_dump', [
            '-h', DB_HOST,
            '-p', DB_PORT,
            '-U', DB_USER,
            '-d', DATABASE_NAME,
            '--no-password'
        ], { env });

        const gzip = zlib.createGzip();

        pg_dump.stdout.pipe(gzip).pipe(res);

        pg_dump.stderr.on('data', (data) => {
            console.error('[BACKUP] pg_dump stderr:', data.toString());
        });

        pg_dump.on('error', (err) => {
            console.error('[BACKUP] pg_dump failed to start:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ status: 500, message: 'Backup failed: ' + err.message });
            }
        });

        pg_dump.on('close', (code) => {
            if (code !== 0) {
                console.error(`[BACKUP] pg_dump exited with code ${code}`);
            } else {
                console.log(`[BACKUP] Backup streamed successfully: ${filename}`);
            }
        });
    });

    /**
     * POST /api/backup/restore
     * Accepts a .sql.gz backup file and pipes it through gunzip → psql.
     * Admin-only. DESTRUCTIVE: restores (merges/overwrites) DB from the backup.
     */
    router.post(
        '/backup/restore',
        authenticate,
        authorize('admin'),
        upload.single('backup'),
        (req, res) => {
            if (!req.file) {
                return res.status(400).json({ status: 400, message: 'No backup file uploaded.' });
            }

            const {
                PASSWORD,
                DB_USER,
                DATABASE_NAME,
                DB_HOST = '127.0.0.1',
                DB_PORT = '5432'
            } = process.env;

            if (!PASSWORD || !DB_USER || !DATABASE_NAME) {
                return res.status(500).json({
                    status: 500,
                    message: 'Database credentials not configured in environment.'
                });
            }

            console.log(`[RESTORE] Starting restore from uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

            const env = { ...process.env, PGPASSWORD: PASSWORD };

            const psql = spawn('psql', [
                '-h', DB_HOST,
                '-p', DB_PORT,
                '-U', DB_USER,
                '-d', DATABASE_NAME,
                '--no-password'
            ], { env });

            const gunzip = zlib.createGunzip();
            const { Readable } = require('stream');

            // Pipe: buffer → gunzip → psql stdin
            Readable.from(req.file.buffer).pipe(gunzip).pipe(psql.stdin);

            let stderrOutput = '';
            psql.stderr.on('data', (data) => {
                stderrOutput += data.toString();
                console.error('[RESTORE] psql stderr:', data.toString());
            });

            gunzip.on('error', (err) => {
                console.error('[RESTORE] gunzip error:', err.message);
                if (!res.headersSent) {
                    res.status(400).json({ status: 400, message: 'Failed to decompress backup: ' + err.message });
                }
            });

            psql.on('error', (err) => {
                console.error('[RESTORE] psql failed to start:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ status: 500, message: 'Restore failed: ' + err.message });
                }
            });

            psql.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[RESTORE] psql exited with code ${code}`);
                    return res.status(500).json({
                        status: 500,
                        message: `Restore failed (exit code ${code}). Check server logs.`,
                        details: stderrOutput.slice(-500) || undefined
                    });
                }
                console.log('[RESTORE] Restore completed successfully.');
                res.json({ status: 200, message: 'Database restored successfully.' });
            });
        }
    );
};
