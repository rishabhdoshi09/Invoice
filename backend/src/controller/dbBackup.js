const { spawn } = require('child_process');

/**
 * GET /api/data-audit/backup
 * Streams a pg_dump of the current database as a downloadable .sql file.
 */
const backupDatabase = async (req, res) => {
    const dbName = process.env.DATABASE_NAME || 'customerInvoice';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbPort = process.env.DB_PORT || '5432';
    const dbPass = process.env.PASSWORD || '';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${dbName}_backup_${timestamp}.sql`;

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const env = { ...process.env };
    if (dbPass) env.PGPASSWORD = dbPass;

    const pgDump = spawn('pg_dump', [
        '-h', dbHost,
        '-p', dbPort,
        '-U', dbUser,
        '-d', dbName,
        '--no-owner',
        '--no-acl'
    ], { env });

    pgDump.stdout.pipe(res);

    let stderrData = '';
    pgDump.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

    pgDump.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
            console.error('pg_dump failed:', stderrData);
            res.status(500).json({ status: 500, message: `Backup failed: ${stderrData}` });
        }
    });

    pgDump.on('error', (err) => {
        if (!res.headersSent) {
            console.error('pg_dump spawn error:', err);
            res.status(500).json({ status: 500, message: `Backup failed: ${err.message}` });
        }
    });
};

module.exports = { backupDatabase };
