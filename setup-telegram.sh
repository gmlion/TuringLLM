#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./setup-telegram.sh <BOT_TOKEN> [instance-dir]"
  echo ""
  echo "Get a bot token from @BotFather on Telegram."
  echo "This script will wait for you to send a message to the bot,"
  echo "then save the token and chat ID to .env."
  exit 1
fi

TOKEN="$1"
INSTANCE_DIR="${2:-.}"
ENV_FILE="$INSTANCE_DIR/.env"

echo "Bot token: $TOKEN"
echo ""
echo "Now open Telegram and send any message to your bot."
echo "Waiting for your message..."

while true; do
  RESPONSE=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates")
  CHAT_ID=$(echo "$RESPONSE" | grep -o '"chat":{"id":[0-9]*' | head -1 | grep -o '[0-9]*$')

  if [ -n "$CHAT_ID" ]; then
    echo ""
    echo "Got it! Chat ID: $CHAT_ID"

    # Append or update .env
    if [ -f "$ENV_FILE" ]; then
      # Remove old entries if present
      grep -v '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | grep -v '^TELEGRAM_CHAT_ID=' > "$ENV_FILE.tmp" || true
      mv "$ENV_FILE.tmp" "$ENV_FILE"
    fi

    echo "TELEGRAM_BOT_TOKEN=$TOKEN" >> "$ENV_FILE"
    echo "TELEGRAM_CHAT_ID=$CHAT_ID" >> "$ENV_FILE"

    echo "Saved to $ENV_FILE"
    exit 0
  fi

  sleep 2
done
