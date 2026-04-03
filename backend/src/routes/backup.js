const { authenticate, authorize } = require('../middleware/auth');
const { spawn } = require('child_process');
const zlib = require('zlib');

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
};
