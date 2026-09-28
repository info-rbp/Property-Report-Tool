#!/usr/bin/env bash
set -euo pipefail

RECOVERY_BUCKET="proinspect-property-reports-recovery"

if bunx wrangler r2 bucket info "$RECOVERY_BUCKET" --json >/dev/null 2>&1; then
  echo "Recovery bucket already exists: $RECOVERY_BUCKET"
else
  echo "Creating recovery bucket: $RECOVERY_BUCKET"
  bunx wrangler r2 bucket create "$RECOVERY_BUCKET"
fi
