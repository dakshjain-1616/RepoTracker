#!/bin/sh
# backup-db.sh — SQLite backup for RepoTracker
#
# Usage (from host, with named volume):
#   docker run --rm \
#     -v repotracker_repo_data:/data \
#     -v "$(pwd)/backups":/out \
#     alpine sh -c "cp /data/repos.db /out/repos-\$(date +%Y%m%d-%H%M%S).db"
#
# Usage (inside container or with bind mount):
#   DB_PATH=/app/data/repos.db BACKUP_DIR=/backups ./scripts/backup-db.sh
#
# Add to crontab for scheduled backups:
#   0 3 * * * /path/to/scripts/backup-db.sh >> /var/log/repotracker-backup.log 2>&1

set -e

DB_PATH="${DB_PATH:-/app/data/repos.db}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
KEEP="${KEEP:-7}"   # number of backups to retain

if [ ! -f "$DB_PATH" ]; then
  echo "No SQLite DB found at $DB_PATH — skipping (Turso deployment?)"
  exit 0
fi

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d-%H%M%S)
DEST="$BACKUP_DIR/repos-$DATE.db"

cp "$DB_PATH" "$DEST"
echo "Backup created: $DEST ($(du -h "$DEST" | cut -f1))"

# Prune old backups — keep the most recent $KEEP files
EXCESS=$(ls -t "$BACKUP_DIR"/repos-*.db 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ -n "$EXCESS" ]; then
  echo "$EXCESS" | xargs rm -f
  echo "Pruned old backups (kept latest $KEEP)"
fi
