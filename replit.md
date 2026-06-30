# Anonymous Telegram Bot

بات تلگرام ناشناس با قابلیت ارسال پیام فردی و گروهی از طریق لینک‌های یکتا.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — اجرای سرور API + بات تلگرام (port 5000)
- `pnpm run typecheck` — بررسی تایپ‌اسکریپت
- `pnpm run build` — ساخت کامل
- `pnpm --filter @workspace/db run push` — اعمال تغییرات schema دیتابیس

## Required Secrets

- `BOT_TOKEN` — توکن بات از @BotFather
- `ADMIN_ID` — آی‌دی عددی تلگرام ادمین
- `DATABASE_URL` — اتصال PostgreSQL (خودکار توسط Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Telegram: node-telegram-bot-api (polling mode)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/index.ts` — منطق اصلی بات
- `lib/db/src/schema/index.ts` — schema دیتابیس (users, group_links, group_members, user_states)
- `artifacts/api-server/src/index.ts` — نقطه شروع سرور

## Product

### برای کاربران عادی:
- `/start` — دریافت لینک ناشناس شخصی
- ارسال پیام ناشناس از طریق لینک به کاربران دیگر
- پشتیبانی از متن، عکس، ویدیو، صدا، استیکر و ...

### برای لینک گروهی (ساخته‌شده توسط ادمین):
- ارسال همزمان به همه اعضای گروه
- نمایش نام گروه در پیام تأیید (نه تعداد اعضا)
- گزینه فعال/غیرفعال نمایش شناسه فرستنده (فقط برای اعضای گروه مرئی است)

### پنل ادمین:
- ساخت لینک گروهی با نام دلخواه
- افزودن اعضا با آی‌دی عددی
- ارسال همگانی به همه کاربران
- آمار کاربران فعال
- فعال/غیرفعال کردن نمایش شناسه فرستنده در هر گروه

## Architecture decisions

- لینک گروهی و شخصی کاملاً جدا هستند: گروه‌ها با `group_link_id` شناسایی می‌شوند و هیچ تداخلی با توکن شخصی ندارند
- State ماشین در جدول `user_states` ذخیره می‌شود (idle, sending_personal, sending_group, admin_*)
- فرستنده پیام هرگز در پیام تأیید نمی‌فهمد پیامش به چند نفر رفته
- پیام‌ها با `sendPhoto/sendVideo/...` کپی می‌شوند (نه forward) تا هویت فرستنده مخفی بماند
- node-telegram-bot-api باید در build.mjs به لیست external اضافه شود (CJS incompatibility با esbuild)

## User preferences

- بات باید فارسی باشد
- کاربران عادی نباید بدانند پیامشان به چند نفر رسیده
- دکمه لغو همیشه inline باشد (نه reply keyboard)

## Gotchas

- `node-telegram-bot-api` باید در `external` لیست build.mjs باشد وگرنه esbuild خطا می‌دهد
- بعد از تغییر schema همیشه `pnpm --filter @workspace/db run push` اجرا کن
