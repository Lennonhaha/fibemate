#!/bin/bash
# FIBEMATE File Integrity Monitor
BASELINE="/opt/fibemate-full/logs/integrity-baseline.sha256"
ALERT_LOG="/opt/fibemate-full/logs/integrity-alerts.log"

scan() {
    (cd /opt/fibemate-full/www && find . -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) | sort | while read f; do
        sha256sum "$f" 2>/dev/null
    done)
}

case "${1:-check}" in
    init)
        scan > "$BASELINE"
        echo "[$(date "+%Y-%m-%d %H:%M:%S")] Baseline initialized: $(wc -l < "$BASELINE") files" >> "$ALERT_LOG"
        echo "Baseline created: $(wc -l < "$BASELINE") files"
        ;;
    check)
        if [ ! -f "$BASELINE" ]; then
            echo "ERROR: No baseline. Run with 'init' first."
            exit 1
        fi
        TMP=$(mktemp)
        scan > "$TMP"
        if ! diff -q "$BASELINE" "$TMP" > /dev/null 2>&1; then
            echo "[$(date "+%Y-%m-%d %H:%M:%S")] ALERT: Files changed!" >> "$ALERT_LOG"
    CHANGED_LIST=$(diff "$BASELINE" "$TMP" | grep "^>" | head -20 | sed "s/^> //" | sed "s/^/-/" )
    /usr/local/bin/dingtalk-alert.sh "Integrity Alert" "## [告警] File Integrity Alert\n\n- Time: $(date '+%Y-%m-%d %H:%M:%S')\n- Changed: ${CHANGED_COUNT} files\n- List:\n${CHANGED_LIST}\n\n> FIBEMATE Security Monitor"
            diff "$BASELINE" "$TMP" >> "$ALERT_LOG"
            echo "ALERT: Files changed! See $ALERT_LOG"
        fi
        rm -f "$TMP"
        ;;
    *)
        echo "Usage: $0 [init|check]"
        ;;
esac
