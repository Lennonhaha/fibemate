#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
#
# Cert expiry check for fibemate.net and fibemate.link.
#
# Why this exists: certbot renews twice a day and the renewal configs say
# "renew 30 days before expiry", so the honest question is not "is renewal
# configured" but "did it actually renew". Nothing watched that. certbot does
# not tell anyone when a renewal fails; the site just starts serving an expired
# certificate one morning.
#
# Exit codes: 0 = everything fine, 1 = at least one cert inside the warning
# window, 2 = at least one cert inside the hard window (or unreadable),
# 3 = the notification channel itself failed.
#
# Usage:
#   check-cert-expiry.sh [--warn-days 30] [--hard-days 7] [--notify] [--test-notify]
#
# --notify posts to DINGTALK_WEBHOOK_URL when the state changes, or every
#          STATE_REPEAT_DAYS days while the state is not "ok".
# --test-notify sends one clearly marked test message and exits.
#
# DingTalk answers HTTP 200 even when it rejects the request: the body carries
# {"errcode":300005,"errmsg":"token is not exist"}. Checking the status code
# alone reports success for a dead channel, so the body is what decides here.

set -u

WARN_DAYS=30
HARD_DAYS=7
NOTIFY=0
TEST_NOTIFY=0
STATE_REPEAT_DAYS=3
LIVE_DIR="/etc/letsencrypt/live"
ENV_FILE="/opt/fibemate/shared/.env"
STATE_DIR="/var/lib/fibemate"
STATE_FILE="$STATE_DIR/cert-expiry.state"

while [ $# -gt 0 ]; do
    case "$1" in
        --warn-days) WARN_DAYS="${2:-30}"; shift 2 ;;
        --hard-days) HARD_DAYS="${2:-7}"; shift 2 ;;
        --notify) NOTIFY=1; shift ;;
        --test-notify) TEST_NOTIFY=1; shift ;;
        -h|--help) sed -n '2,34p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 64 ;;
    esac
done

webhook() {
    if [ ! -f "$ENV_FILE" ]; then
        echo "no env file at $ENV_FILE" >&2
        return 1
    fi
    # shellcheck disable=SC1090
    . "$ENV_FILE" >/dev/null 2>&1 || true
    if [ -z "${DINGTALK_WEBHOOK_URL:-}" ]; then
        echo "DINGTALK_WEBHOOK_URL is not set in $ENV_FILE" >&2
        return 1
    fi
    if ! command -v node >/dev/null 2>&1; then
        echo "node is required to build the JSON body; not found" >&2
        return 1
    fi
    printf '%s' "$1" | node -e '
        let s = "";
        process.stdin.on("data", (d) => { s += d; });
        process.stdin.on("end", () => {
            process.stdout.write(JSON.stringify({ msgtype: "text", text: { content: s } }));
        });
    ' > /tmp/cert-expiry-payload.$$
    code=$(curl -sS -o /tmp/cert-expiry-response.$$ -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        --data-binary @/tmp/cert-expiry-payload.$$ \
        --max-time 15 "$DINGTALK_WEBHOOK_URL" 2>/dev/null || echo 000)
    body=$(head -c 300 /tmp/cert-expiry-response.$$ 2>/dev/null)
    rm -f /tmp/cert-expiry-payload.$$ /tmp/cert-expiry-response.$$
    echo "dingtalk http=$code body=$body"
    [ "$code" = "200" ] || return 1
    # errcode 0 is the only success. Anything else is a rejected send.
    if ! printf '%s' "$body" | grep -q '"errcode":0'; then
        echo "dingtalk rejected the message (see body above)" >&2
        return 1
    fi
    return 0
}

if [ "$TEST_NOTIFY" = "1" ]; then
    if webhook "FIBEMATE cert-expiry check: test message at $(date '+%Y-%m-%d %H:%M:%S %Z'). If you can read this, the alert channel works."; then
        echo "test notify: delivered"
        exit 0
    fi
    echo "test notify: FAILED" >&2
    exit 3
fi

if [ ! -d "$LIVE_DIR" ]; then
    echo "no $LIVE_DIR on this host; nothing to check" >&2
    exit 0
fi

now=$(date +%s)
worst=0          # 0 ok, 1 warn, 2 hard
worst_days=99999
lines=""

for dir in "$LIVE_DIR"/*/; do
    name=$(basename "$dir")
    cert="$dir/fullchain.pem"
    [ -f "$cert" ] || continue
    not_after=$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2-)
    if [ -z "$not_after" ]; then
        lines="$lines$name: UNREADABLE"$'\n'
        worst=2
        continue
    fi
    end=$(date -d "$not_after" +%s 2>/dev/null || echo 0)
    if [ "$end" = "0" ]; then
        lines="$lines$name: UNPARSEABLE '$not_after'"$'\n'
        worst=2
        continue
    fi
    days=$(( (end - now) / 86400 ))
    [ "$days" -lt "$worst_days" ] && worst_days=$days
    state="ok"
    if [ "$days" -lt "$HARD_DAYS" ]; then
        state="HARD"
        worst=2
    elif [ "$days" -lt "$WARN_DAYS" ]; then
        state="WARN"
        [ "$worst" -lt 1 ] && worst=1
    fi
    lines="$lines$name: ${days}d left (${state}) expires $not_after"$'\n'
done

if [ -z "$lines" ]; then
    echo "no certificates found under $LIVE_DIR" >&2
    exit 2
fi

printf '%s' "$lines"
echo "worst=$worst worst_days=$worst_days warn=$WARN_DAYS hard=$HARD_DAYS"

if [ "$NOTIFY" = "1" ] && [ "$worst" -gt 0 ]; then
    mkdir -p "$STATE_DIR" 2>/dev/null || true
    prev=""
    prev_ts=0
    if [ -f "$STATE_FILE" ]; then
        prev=$(cut -d' ' -f1 "$STATE_FILE" 2>/dev/null || true)
        prev_ts=$(cut -d' ' -f2 "$STATE_FILE" 2>/dev/null || echo 0)
    fi
    age_days=$(( (now - prev_ts) / 86400 ))
    if [ "$prev" != "$worst" ] || [ "$age_days" -ge "$STATE_REPEAT_DAYS" ]; then
        msg="FIBEMATE certificate expiry: ${worst_days} day(s) left on the earliest cert.
$lines
Renewal: certbot.timer runs twice daily; renewal configs renew 30 days before expiry.
This message repeats every ${STATE_REPEAT_DAYS} days while the state is not ok."
        if webhook "$msg"; then
            echo "$worst $now" > "$STATE_FILE" 2>/dev/null || true
            echo "notified"
        else
            echo "notify FAILED" >&2
            exit 3
        fi
    else
        echo "not notified (same state, last sent ${age_days}d ago)"
    fi
fi

exit "$worst"
