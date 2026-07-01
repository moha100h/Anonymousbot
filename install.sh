#!/bin/bash
set -e

ENV_FILE="/root/hiddenpmbot/.env"

echo "🔑 در حال بارگذاری متغیرهای محیطی..."
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "   ✅ فایل .env بارگذاری شد"
else
  echo ""
  echo "   ⚠️  فایل .env پیدا نشد — اطلاعات را وارد کنید:"
  echo ""

  read -rp "   BOT_TOKEN (توکن بات از BotFather): " BOT_TOKEN
  if [ -z "$BOT_TOKEN" ]; then
    echo "❌ BOT_TOKEN نمی‌تواند خالی باشد!"
    exit 1
  fi

  read -rp "   ADMIN_ID (شناسه عددی ادمین): " ADMIN_ID
  if [ -z "$ADMIN_ID" ]; then
    echo "❌ ADMIN_ID نمی‌تواند خالی باشد!"
    exit 1
  fi

  DATABASE_URL="postgresql://anchatbot:e4857209f4d13149c873b05161ef@localhost:5432/anchatbot"

  cat > "$ENV_FILE" << ENVEOF
BOT_TOKEN=$BOT_TOKEN
DATABASE_URL=$DATABASE_URL
ADMIN_ID=$ADMIN_ID
ENVEOF

  echo ""
  echo "   ✅ فایل .env ساخته شد"
fi

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ BOT_TOKEN در فایل .env تنظیم نشده!"
  exit 1
fi

echo "🔄 در حال آپدیت کد از گیت‌هاب..."
git pull

echo "📦 در حال نصب پکیج‌ها..."
pnpm install --frozen-lockfile

echo "🔨 در حال بیلد بات..."
cd artifacts/api-server && pnpm run build && cd ../..

echo "🗃️  در حال آپدیت دیتابیس..."
psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS ad_settings (id SERIAL PRIMARY KEY, button_text TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMP NOT NULL DEFAULT NOW());" 2>/dev/null && echo "   ✅ جدول ad_settings آماده است" || true

echo "🚀 در حال ری‌استارت بات..."
pkill -f "dist/index.mjs" 2>/dev/null || true
sleep 2

nohup env BOT_TOKEN="$BOT_TOKEN" DATABASE_URL="$DATABASE_URL" ADMIN_ID="$ADMIN_ID" PORT=3000 \
  node --enable-source-maps artifacts/api-server/dist/index.mjs > /tmp/bot.log 2>&1 &

echo "⏳ در حال بررسی لاگ..."
sleep 4
tail -10 /tmp/bot.log

echo ""
echo "✅ بات با موفقیت نصب و اجرا شد!"
echo "   لاگ زنده: tail -f /tmp/bot.log"
