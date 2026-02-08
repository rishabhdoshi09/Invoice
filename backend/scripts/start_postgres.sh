#!/bin/bash
# PostgreSQL Startup Script for Supervisor
# Ensures PostgreSQL uses persistent storage

PERSISTENT_PGDATA="/app/pgdata"
PG_VERSION="15"

echo "PostgreSQL startup script running at $(date)"

# Check if PostgreSQL package is installed
if [ ! -f "/usr/lib/postgresql/$PG_VERSION/bin/postgres" ]; then
    echo "Installing PostgreSQL..."
    apt-get update && apt-get install -y postgresql postgresql-contrib
fi

# Check if persistent data exists
if [ -d "$PERSISTENT_PGDATA" ] && [ -f "$PERSISTENT_PGDATA/PG_VERSION" ]; then
    echo "Using persistent data from $PERSISTENT_PGDATA"
    
    # Ensure correct ownership
    chown -R postgres:postgres "$PERSISTENT_PGDATA"
    chmod 700 "$PERSISTENT_PGDATA"
    
    # Update config to point to persistent data
    sed -i "s|^data_directory = .*|data_directory = '$PERSISTENT_PGDATA'|" /etc/postgresql/$PG_VERSION/main/postgresql.conf
else
    echo "ERROR: No persistent data found at $PERSISTENT_PGDATA"
    echo "Run setup_postgres_persistent.sh first"
    exit 1
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
pg_ctlcluster $PG_VERSION main start

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q; then
        echo "PostgreSQL is ready!"
        exit 0
    fi
    echo "Waiting for PostgreSQL... ($i/30)"
    sleep 1
done

echo "ERROR: PostgreSQL failed to start"
exit 1
