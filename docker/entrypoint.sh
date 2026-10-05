#!/bin/sh
# Starts LendMatch: refuses to run open, applies database migrations, then starts the server.
set -e

if [ -z "$LENDMATCH_ACCESS_CODE" ] && [ "$LENDMATCH_ALLOW_NO_ACCESS_CODE" != "1" ]; then
  echo "Refusing to start: LENDMATCH_ACCESS_CODE is not set, so anyone who can reach this server could use it" >&2
  echo "(and spend your Anthropic and Firecrawl credits). Set it in .env. To run open on purpose, set LENDMATCH_ALLOW_NO_ACCESS_CODE=1." >&2
  exit 1
fi

echo "Applying database migrations..."
npx prisma migrate deploy

exec "$@"
