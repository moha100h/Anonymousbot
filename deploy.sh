#!/bin/bash
set -e

echo "🔄 در حال آپدیت کد از گیت‌هاب..."
git pull

echo "📦 در حال نصب پکیج‌ها..."
pnpm install --frozen-lockfile

echo "🔨 در حال بیلد بات..."
cd artifacts/api-server && pnpm run build && cd ../..

echo "🚀 در حال ری‌استارت بات..."
pkill -f "node --enable-source-maps ./dist/index.mjs" 2>/dev/null || true
sleep 1
export PORT=3000
cd artifacts/api-server && nohup node --enable-source-maps ./dist/index.mjs > /tmp/bot.log 2>&1 &
cd ../..

echo "✅ بات با موفقیت آپدیت و ری‌استارت شد!"
