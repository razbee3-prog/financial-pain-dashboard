#!/bin/bash
# Cron wrapper for the financial pain point worker
# Add to crontab: 0 0 * * * /path/to/financial-pain-dashboard/worker/run_worker.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/data/worker.log"

cd "$PROJECT_DIR"

# Activate venv if it exists
if [ -d "worker/venv" ]; then
    source worker/venv/bin/activate
elif [ -d "worker/.venv" ]; then
    source worker/.venv/bin/activate
fi

echo "--- Worker run: $(date) ---" >> "$LOG_FILE"
python worker/worker.py >> "$LOG_FILE" 2>&1
echo "" >> "$LOG_FILE"
