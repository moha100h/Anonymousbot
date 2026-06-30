import pg from "pg";

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const MESSAGE = process.argv[2];

if (!BOT_TOKEN) { console.error("❌ BOT_TOKEN تنظیم نشده"); process.exit(1); }
if (!DATABASE_URL) { console.error("❌ DATABASE_URL تنظیم نشده"); process.exit(1); }
if (!MESSAGE) {
  console.log('نحوه استفاده:\n  node broadcast.mjs "متن پیام"\n\nمثال:\n  node broadcast.mjs "سلام به همه!"');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return await res.json();
}

async function main() {
  const { rows } = await pool.query(
    "SELECT telegram_id FROM users WHERE is_blocked = false"
  );
  console.log(`📢 ارسال پیام به ${rows.length} کاربر...\n`);

  let sent = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const chatId = rows[i].telegram_id;
    let retries = 3;
    while (retries > 0) {
      const result = await sendMessage(chatId, MESSAGE);
      if (result.ok) {
        sent++;
        break;
      } else if (result.parameters?.retry_after) {
        const wait = result.parameters.retry_after * 1000 + 500;
        console.log(`⏳ rate limit — ${result.parameters.retry_after}s صبر...`);
        await sleep(wait);
        retries--;
      } else {
        failed++;
        break;
      }
    }
    if (retries === 0) failed++;

    if ((i + 1) % 50 === 0) {
      console.log(`  پیشرفت: ${i + 1}/${rows.length} — موفق: ${sent} | ناموفق: ${failed}`);
    }
    await sleep(50);
  }

  console.log(`\n✅ تمام شد!\n📊 موفق: ${sent}\n❌ ناموفق: ${failed}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
