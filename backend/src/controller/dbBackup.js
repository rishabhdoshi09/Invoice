const { spawn } = require('child_process');
const db = require('../models');

/**
 * GET /api/data-audit/backup
 * Tries pg_dump first. Falls back to SQL-based export if pg_dump is unavailable.
 */
const backupDatabase = async (req, res) => {
    const dbName = process.env.DATABASE_NAME || 'customerInvoice';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbPort = process.env.DB_PORT || '5432';
    const dbPass = process.env.PASSWORD || '';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${dbName}_backup_${timestamp}.sql`;

    // Try pg_dump first
    try {
        await new Promise((resolve, reject) => {
            const env = { ...process.env };
            if (dbPass) env.PGPASSWORD = dbPass;

            const pgDump = spawn('pg_dump', [
                '-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', dbName,
                '--no-owner', '--no-acl'
            ], { env });

            let stderrData = '';
            let hasData = false;

            pgDump.stdout.once('data', () => {
                hasData = true;
                res.setHeader('Content-Type', 'application/sql');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                pgDump.stdout.pipe(res);
            });

            pgDump.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

            pgDump.on('close', (code) => {
                if (code === 0 && hasData) resolve();
                else reject(new Error(stderrData || 'pg_dump failed'));
            });

            pgDump.on('error', (err) => reject(err));
        });
        return; // pg_dump succeeded
    } catch (pgErr) {
        console.log('pg_dump unavailable, falling back to SQL export:', pgErr.message);
    }

    // Fallback: export critical tables as JSON-wrapped SQL
    try {
        const tables = ['orders', 'payments', 'receipt_allocations', 'customers', 'audit_logs'];
        const lines = [`-- Database backup: ${dbName}\n-- Generated: ${new Date().toISOString()}\n-- Method: SQL query fallback (pg_dump unavailable)\n`];

        for (const table of tables) {
            try {
                const [rows] = await db.sequelize.query(`SELECT * FROM "${table}"`);
                lines.push(`\n-- Table: ${table} (${rows.length} rows)`);
                if (rows.length > 0) {
                    const cols = Object.keys(rows[0]);
                    for (const row of rows) {
                        const vals = cols.map(c => {
                            const v = row[c];
                            if (v === null || v === undefined) return 'NULL';
                            if (typeof v === 'number') return v;
                            if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
                            if (v instanceof Date) return `'${v.toISOString()}'`;
                            return `'${String(v).replace(/'/g, "''")}'`;
                        });
                        lines.push(`INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});`);
                    }
                }
            } catch (tableErr) {
                lines.push(`\n-- Skipped table ${table}: ${tableErr.message}`);
            }
        }

        const content = lines.join('\n');
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (err) {
        console.error('Backup fallback failed:', err);
        if (!res.headersSent) {
            res.status(500).json({ status: 500, message: `Backup failed: ${err.message}` });
        }
    }
};

module.exports = { backupDatabase };
