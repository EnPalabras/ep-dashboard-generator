#!/usr/bin/env bash
set -u
cd /home/tievo/EnPalabras/ep-dashboard-generator
TODAY=$(date +%Y-%m-%d)
# meses desde 2025-01 hasta el mes actual
d="2025-01-01"
while [ "$(date -d "$d" +%Y-%m)" \< "$(date -d "$TODAY" +%Y-%m)" ] || [ "$(date -d "$d" +%Y-%m)" = "$(date -d "$TODAY" +%Y-%m)" ]; do
  from="$d"
  # último día del mes
  last=$(date -d "$d +1 month -1 day" +%Y-%m-%d)
  if [ "$last" \> "$TODAY" ]; then last="$TODAY"; fi
  echo "===== TRAMO $from .. $last ====="
  bun run batch "$from" "$last" 2>&1 | grep -E '\[meta\]|\[batch\]|error|Error' | grep -v 'fetching page'
  d=$(date -d "$d +1 month" +%Y-%m-%d)
done
echo "===== BACKFILL COMPLETO ====="
