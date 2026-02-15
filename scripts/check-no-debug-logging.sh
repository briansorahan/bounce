#!/bin/bash
if grep -r "window\.electron\.debugLog" src/ --include="*.ts"; then
  echo "Error: Remove debug logging before committing"
  exit 1
fi
exit 0
