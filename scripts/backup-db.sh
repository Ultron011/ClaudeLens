#!/usr/bin/env bash
# Nightly pg_dump of the PROD database (claudelens-db-1) with rolling retention.
# Restore: docker exec -i claudelens-db-1 pg_restore -U claudelens -d claudelens --clean < FILE
# Local-only: copy BACKUP_DIR off this host (S3 etc.) for real disaster recovery.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/claudelens}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/claudelens-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec claudelens-db-1 pg_dump -U claudelens -d claudelens -Fc > "$out.tmp"
# A truncated dump still exits 0 from `>`, so check the archive lists before keeping it.
docker exec -i claudelens-db-1 pg_restore --list < "$out.tmp" > /dev/null
mv "$out.tmp" "$out"
find "$BACKUP_DIR" -name 'claudelens-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) ok $(du -h "$out" | cut -f1) $out"
