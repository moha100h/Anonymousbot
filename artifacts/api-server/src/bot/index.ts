import TelegramBot, { type Message, type CallbackQuery } from "node-telegram-bot-api";
import { db } from "@workspace/db";
import {
  usersTable,
  groupLinksTable,
  groupMembersTable,
  userStatesTable,
} from "@workspace/db";
import { eq, sql, and, asc } from "drizzle-orm";
import crypto from "crypto";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");
if (!ADMIN_ID) throw new Error("ADMIN_ID is required");

export const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function genToken(len = 12): string {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}

async function getOrCreateUser(msg: Message) {
  const tid = msg.from!.id;
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, tid))
    .limit(1);
  if (existing[0]) {
    await db
      .update(usersTable)
      .set({ lastActiveAt: new Date() })
      .where(eq(usersTable.telegramId, tid));
    return existing[0];
  }
  const token = genToken();
  const [user] = await db
    .insert(usersTable)
    .values({
      telegramId: tid,
      username: msg.from!.username ?? null,
      firstName: msg.from!.first_name ?? null,
      lastName: msg.from!.last_name ?? null,
      anonToken: token,
      isBlocked: false,
      messageCount: 0,
    })
    .returning();
  return user!;
}

async function getState(tid: number) {
  const rows = await db
    .select()
    .from(userStatesTable)
    .where(eq(userStatesTable.telegramId, tid))
    .limit(1);
  return rows[0] ?? null;
}

async function setState(
  tid: number,
  state: string,
  targetToken?: string | null,
  targetType?: string | null
) {
  await db
    .insert(userStatesTable)
    .values({
      telegramId: tid,
      state,
      targetToken: targetToken ?? null,
      targetType: targetType ?? null,
    })
    .onConflictDoUpdate({
      target: userStatesTable.telegramId,
      set: {
        state,
        targetToken: targetToken ?? null,
        targetType: targetType ?? null,
        updatedAt: new Date(),
      },
    });
}

function isAdmin(tid: number) {
  return tid === ADMIN_ID;
}

let botUsername = "";
bot.getMe().then((me) => {
  botUsername = me.username ?? "bot";
  console.log(`Bot started: @${botUsername}`);
});

const cancelKeyboard = {
  reply_markup: {
    inline_keyboard: [[{ text: "❌ لغو", callback_data: "cancel" }]],
  },
};

// ─── /start ─────────────────────────────────────────────────────────────────
bot.onText(/^\/start(.*)$/, async (msg, match) => {
  const tid = msg.from!.id;
  const param = (match?.[1] ?? "").trim();

  await getOrCreateUser(msg);

  if (param) {
    const token = param.replace(/^_/, "").trim();

    const groupRows = await db
      .select()
      .from(groupLinksTable)
      .where(and(eq(groupLinksTable.token, token), eq(groupLinksTable.isActive, true)))
      .limit(1);

    if (groupRows[0]) {
      const group = groupRows[0];
      await setState(tid, "sending_group", token, "group");
      await bot.sendMessage(
        tid,
        `✉️ از الان هر چی بفرستی به صورت ناشناس برای *${group.name}* ارسال میشه.`,
        { parse_mode: "Markdown", ...cancelKeyboard }
      );
      return;
    }

    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.anonToken, token))
      .limit(1);

    if (userRows[0]) {
      const target = userRows[0];
      if (target.telegramId === tid) {
        await bot.sendMessage(tid, "❗ نمی‌تونی به خودت پیام ناشناس بفرستی!");
        return;
      }
      await setState(tid, "sending_personal", token, "personal");
      await bot.sendMessage(
        tid,
        `✉️ از الان هر چی بفرستی به صورت ناشناس برای *${target.firstName ?? "کاربر"}* ارسال میشه.`,
        { parse_mode: "Markdown", ...cancelKeyboard }
      );
      return;
    }

    await bot.sendMessage(tid, "❗ لینک نامعتبر یا غیرفعال است.");
    return;
  }

  if (isAdmin(tid)) {
    await sendAdminPanel(tid);
  } else {
    await sendUserMenu(tid);
  }
});

// ─── /cancel command ─────────────────────────────────────────────────────────
bot.onText(/^\/cancel$/, async (msg) => {
  const tid = msg.from!.id;
  await setState(tid, "idle", null, null);
  await bot.sendMessage(tid, "✅ لغو شد.");
  if (isAdmin(tid)) await sendAdminPanel(tid);
  else await sendUserMenu(tid);
});

// ─── /mylink command ─────────────────────────────────────────────────────────
bot.onText(/^\/mylink$/, async (msg) => {
  const tid = msg.from!.id;
  await getOrCreateUser(msg);
  await sendMyLink(tid);
});

async function sendMyLink(tid: number) {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, tid))
    .limit(1);
  const token = user[0]?.anonToken ?? genToken();
  const link = `https://t.me/${botUsername}?start=${token}`;
  await bot.sendMessage(tid, `🔗 *لینک ناشناس شما:*\n\`${link}\``, {
    parse_mode: "Markdown",
  });
}

async function sendUserMenu(tid: number) {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, tid))
    .limit(1);
  const token = user[0]?.anonToken ?? "";
  const link = `https://t.me/${botUsername}?start=${token}`;
  await bot.sendMessage(
    tid,
    `👋 سلام!\n\n🔗 *لینک ناشناس شما:*\n\`${link}\`\n\nاین لینک را برای دیگران بفرستید تا بتوانند برای شما پیام ناشناس ارسال کنند.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 دریافت لینک ناشناس من", callback_data: "my_link" }],
        ],
      },
    }
  );
}

async function sendAdminPanel(tid: number) {
  await bot.sendMessage(tid, "👑 *پنل ادمین*\n\nبه پنل مدیریت بات خوش آمدید.", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔗 ساخت لینک گروهی", callback_data: "admin_create_group" },
          { text: "📋 لیست لینک‌های گروهی", callback_data: "admin_list_groups" },
        ],
        [
          { text: "👤 افزودن عضو به گروه", callback_data: "admin_add_member" },
          { text: "📢 ارسال همگانی", callback_data: "admin_broadcast" },
        ],
        [
          { text: "📊 آمار کاربران", callback_data: "admin_stats" },
          { text: "🔗 لینک من", callback_data: "my_link" },
        ],
        [
          { text: "👥 لیست کاربران", callback_data: "admin_users_0" },
        ],
      ],
    },
  });
}

// ─── Callback Query ───────────────────────────────────────────────────────────
bot.on("callback_query", async (query: CallbackQuery) => {
  const tid = query.from.id;
  const data = query.data ?? "";
  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === "cancel") {
    await setState(tid, "idle", null, null);
    await bot.sendMessage(tid, "✅ لغو شد.");
    if (isAdmin(tid)) await sendAdminPanel(tid);
    else await sendUserMenu(tid);
    return;
  }

  if (data === "my_link") {
    await sendMyLink(tid);
    return;
  }

  if (data.startsWith("cg_hint_yes_") || data.startsWith("cg_hint_no_")) {
    if (!isAdmin(tid)) return;
    const showHint = data.startsWith("cg_hint_yes_");
    const encoded = data.replace(/^cg_hint_(yes|no)_/, "");
    const name = decodeURIComponent(encoded);
    const token = genToken();

    await db.insert(groupLinksTable).values({
      token,
      name,
      isActive: true,
      showSenderHint: showHint,
      messageCount: 0,
    });

    const link = `https://t.me/${botUsername}?start=${token}`;
    await setState(tid, "idle");
    await bot.sendMessage(
      tid,
      `✅ لینک گروهی ساخته شد!\n\n📌 نام: *${name}*\n🔗 لینک:\n\`${link}\`\n👁 نمایش شناسه فرستنده: ${showHint ? "✅ فعال" : "❌ غیرفعال"}\n\nاکنون می‌توانید اعضا را اضافه کنید.`,
      { parse_mode: "Markdown" }
    );
    await sendAdminPanel(tid);
    return;
  }

  if (!isAdmin(tid)) return;

  if (data === "admin_create_group") {
    await setState(tid, "admin_create_group_name");
    await bot.sendMessage(
      tid,
      "📝 نام لینک گروهی را وارد کنید:\n(این نام در پیام کاربران نمایش داده می‌شود)",
      cancelKeyboard
    );
    return;
  }

  if (data === "admin_list_groups") {
    const groups = await db
      .select()
      .from(groupLinksTable)
      .where(eq(groupLinksTable.isActive, true));
    if (!groups.length) {
      await bot.sendMessage(tid, "❌ هیچ لینک گروهی فعالی وجود ندارد.");
      return;
    }
    for (const g of groups) {
      const members = await db
        .select()
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupLinkId, g.id));
      const link = `https://t.me/${botUsername}?start=${g.token}`;
      await bot.sendMessage(
        tid,
        `📌 *${g.name}*\n🔗 \`${link}\`\n👥 اعضا: ${members.length}\n📨 پیام‌ها: ${g.messageCount}\n👁 نمایش فرستنده: ${g.showSenderHint ? "✅" : "❌"}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "👤 افزودن عضو", callback_data: `grp_addmember_${g.id}` },
                { text: "👁 نمایش فرستنده", callback_data: `grp_toggle_hint_${g.id}` },
              ],
              [{ text: "❌ غیرفعال کردن لینک", callback_data: `grp_disable_${g.id}` }],
            ],
          },
        }
      );
    }
    return;
  }

  if (data === "admin_add_member") {
    const groups = await db
      .select()
      .from(groupLinksTable)
      .where(eq(groupLinksTable.isActive, true));
    if (!groups.length) {
      await bot.sendMessage(tid, "❌ ابتدا یک لینک گروهی بسازید.");
      return;
    }
    const keyboard = groups.map((g) => [
      { text: g.name, callback_data: `grp_addmember_${g.id}` },
    ]);
    keyboard.push([{ text: "❌ لغو", callback_data: "cancel" }]);
    await bot.sendMessage(tid, "کدام گروه؟", {
      reply_markup: { inline_keyboard: keyboard },
    });
    return;
  }

  if (data === "admin_broadcast") {
    await setState(tid, "admin_broadcast");
    await bot.sendMessage(
      tid,
      "📢 پیام همگانی را بنویسید (به همه کاربران فعال ارسال می‌شود):",
      cancelKeyboard
    );
    return;
  }

  if (data === "admin_stats") {
    const [[totalUsers], [activeUsers], [totalGroups], [blockedUsers]] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(usersTable),
        db
          .select({ count: sql<number>`count(*)` })
          .from(usersTable)
          .where(eq(usersTable.isBlocked, false)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(groupLinksTable)
          .where(eq(groupLinksTable.isActive, true)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(usersTable)
          .where(eq(usersTable.isBlocked, true)),
      ]);
    await bot.sendMessage(
      tid,
      `📊 *آمار بات*\n\n👥 کل کاربران: ${totalUsers?.count ?? 0}\n✅ کاربران فعال: ${activeUsers?.count ?? 0}\n🚫 کاربران بلاک‌شده: ${blockedUsers?.count ?? 0}\n🔗 لینک‌های گروهی فعال: ${totalGroups?.count ?? 0}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (data.startsWith("admin_users_")) {
    const PAGE_SIZE = 10;
    const page = Number(data.replace("admin_users_", ""));
    const offset = page * PAGE_SIZE;

    const [users, [{ count: total }]] = await Promise.all([
      db
        .select()
        .from(usersTable)
        .orderBy(asc(usersTable.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(usersTable),
    ]);

    if (!users.length) {
      await bot.sendMessage(tid, "❌ هیچ کاربری ثبت نشده است.");
      return;
    }

    const totalPages = Math.ceil(Number(total) / PAGE_SIZE);
    const esc = (s: string) => s.replace(/[_*`\[]/g, "\\$&");

    let text = `👥 *لیست کاربران* — صفحه ${page + 1} از ${totalPages}\n`;
    text += `─────────────────────────\n`;

    for (const u of users) {
      const name = esc([u.firstName, u.lastName].filter(Boolean).join(" ") || "بدون نام");
      const username = u.username ? esc(`@${u.username}`) : "—";
      const status = u.isBlocked ? "🚫" : "✅";
      text += `\n${status} *${name}*\n`;
      text += `   🆔 \`${u.telegramId}\`\n`;
      text += `   👤 ${username}\n`;
      text += `   📨 ${u.messageCount} پیام\n`;
    }

    const navButtons: { text: string; callback_data: string }[] = [];
    if (page > 0) navButtons.push({ text: "◀ قبلی", callback_data: `admin_users_${page - 1}` });
    if ((page + 1) < totalPages) navButtons.push({ text: "بعدی ▶", callback_data: `admin_users_${page + 1}` });

    const keyboard = [];
    if (navButtons.length) keyboard.push(navButtons);
    keyboard.push([{ text: "🔙 پنل ادمین", callback_data: "back_admin" }]);

    await bot.sendMessage(tid, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    return;
  }

  if (data === "back_admin") {
    await sendAdminPanel(tid);
    return;
  }

  if (data.startsWith("grp_addmember_")) {
    const gid = Number(data.replace("grp_addmember_", ""));
    await setState(tid, "admin_add_member_id", String(gid), "group");
    await bot.sendMessage(
      tid,
      "📱 آی‌دی عددی تلگرام کاربر را وارد کنید:\n(مثال: 123456789)",
      cancelKeyboard
    );
    return;
  }

  if (data.startsWith("grp_toggle_hint_")) {
    const gid = Number(data.replace("grp_toggle_hint_", ""));
    const rows = await db
      .select()
      .from(groupLinksTable)
      .where(eq(groupLinksTable.id, gid))
      .limit(1);
    if (!rows[0]) return;
    const newVal = !rows[0].showSenderHint;
    await db
      .update(groupLinksTable)
      .set({ showSenderHint: newVal })
      .where(eq(groupLinksTable.id, gid));
    await bot.sendMessage(
      tid,
      `✅ نمایش شناسه فرستنده برای گروه "*${rows[0].name}*" ${newVal ? "✅ فعال" : "❌ غیرفعال"} شد.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (data.startsWith("grp_disable_")) {
    const gid = Number(data.replace("grp_disable_", ""));
    const rows = await db
      .select()
      .from(groupLinksTable)
      .where(eq(groupLinksTable.id, gid))
      .limit(1);
    await db
      .update(groupLinksTable)
      .set({ isActive: false })
      .where(eq(groupLinksTable.id, gid));
    await bot.sendMessage(
      tid,
      `✅ لینک گروهی "${rows[0]?.name ?? ""}" غیرفعال شد.`
    );
    return;
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.from) return;
  if (msg.text?.startsWith("/")) return;

  const tid = msg.from.id;

  try {
    await handleMessage(msg, tid);
  } catch (err) {
    console.error("Message handler error:", err);
    try {
      await bot.sendMessage(tid, "❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.");
    } catch {}
  }
});

async function handleMessage(msg: Message, tid: number) {
  await getOrCreateUser(msg);
  const stateRow = await getState(tid);

  if (!stateRow || stateRow.state === "idle") {
    if (isAdmin(tid)) await sendAdminPanel(tid);
    else await sendUserMenu(tid);
    return;
  }

  const { state, targetToken } = stateRow;

  if (state === "admin_create_group_name" && isAdmin(tid)) {
    const name = msg.text?.trim();
    if (!name) {
      await bot.sendMessage(tid, "❗ نام نمی‌تواند خالی باشد.", cancelKeyboard);
      return;
    }
    await bot.sendMessage(
      tid,
      `✅ نام گروه: *${name}*\n\nآیا می‌خواهید شناسه عددی فرستنده در پیام‌های دریافتی نمایش داده شود؟\n_(کاربران ارسال‌کننده از این موضوع مطلع نمی‌شوند)_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ بله", callback_data: `cg_hint_yes_${encodeURIComponent(name)}` },
              { text: "❌ خیر", callback_data: `cg_hint_no_${encodeURIComponent(name)}` },
            ],
          ],
        },
      }
    );
    return;
  }

  if (state === "admin_add_member_id" && isAdmin(tid) && targetToken) {
    const inputId = Number(msg.text?.trim());
    if (!inputId || isNaN(inputId)) {
      await bot.sendMessage(tid, "❗ آی‌دی نامعتبر است. لطفاً یک عدد وارد کنید.", cancelKeyboard);
      return;
    }
    const gid = Number(targetToken);
    const group = await db
      .select()
      .from(groupLinksTable)
      .where(eq(groupLinksTable.id, gid))
      .limit(1);
    if (!group[0]) {
      await bot.sendMessage(tid, "❗ گروه یافت نشد.");
      await setState(tid, "idle");
      return;
    }
    const existing = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupLinkId, gid),
          eq(groupMembersTable.telegramId, inputId)
        )
      )
      .limit(1);
    if (existing[0]) {
      await bot.sendMessage(tid, "❗ این کاربر قبلاً عضو این گروه است.", cancelKeyboard);
      return;
    }
    await db.insert(groupMembersTable).values({
      groupLinkId: gid,
      telegramId: inputId,
    });
    await setState(tid, "idle");
    await bot.sendMessage(
      tid,
      `✅ کاربر با آی‌دی \`${inputId}\` به گروه *${group[0].name}* اضافه شد.`,
      { parse_mode: "Markdown" }
    );
    await sendAdminPanel(tid);
    return;
  }

  if (state === "admin_broadcast" && isAdmin(tid)) {
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.isBlocked, false));
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      try {
        await bot.copyMessage(u.telegramId, msg.chat.id, msg.message_id);
        sent++;
      } catch {
        failed++;
      }
    }
    await setState(tid, "idle");
    await bot.sendMessage(
      tid,
      `📢 ارسال همگانی تمام شد.\n✅ موفق: ${sent}\n❌ ناموفق: ${failed}`
    );
    await sendAdminPanel(tid);
    return;
  }

  if (state === "sending_group" && targetToken) {
    const group = await db
      .select()
      .from(groupLinksTable)
      .where(
        and(
          eq(groupLinksTable.token, targetToken),
          eq(groupLinksTable.isActive, true)
        )
      )
      .limit(1);

    if (!group[0]) {
      await bot.sendMessage(tid, "❗ این لینک دیگر فعال نیست.");
      await setState(tid, "idle");
      return;
    }

    const members = await db
      .select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupLinkId, group[0].id));

    if (!members.length) {
      await bot.sendMessage(
        tid,
        `✅ پیام ناشناس به ${group[0].name} ارسال شد.`,
        cancelKeyboard
      );
      return;
    }

    const senderButton = group[0].showSenderHint
      ? {
          reply_markup: {
            inline_keyboard: [
              [{ text: `👤 پیام به فرستنده`, url: `tg://user?id=${tid}` }],
            ],
          },
        }
      : {};

    for (const member of members) {
      if (member.telegramId === tid) continue;
      try {
        if (msg.text) {
          await bot.sendMessage(
            member.telegramId,
            `📩 *پیام ناشناس:*\n\n${msg.text}`,
            { parse_mode: "Markdown", ...senderButton }
          );
        } else {
          await bot.sendMessage(
            member.telegramId,
            "📩 *پیام ناشناس:*",
            { parse_mode: "Markdown" }
          );
          await forwardMediaWithButton(member.telegramId, msg, group[0].showSenderHint ? tid : null);
        }
      } catch {
        // silently skip blocked users
      }
    }

    await Promise.all([
      db
        .update(groupLinksTable)
        .set({ messageCount: sql`${groupLinksTable.messageCount} + 1` })
        .where(eq(groupLinksTable.id, group[0].id)),
      db
        .update(usersTable)
        .set({ messageCount: sql`${usersTable.messageCount} + 1` })
        .where(eq(usersTable.telegramId, tid)),
    ]);

    await bot.sendMessage(
      tid,
      `✅ پیام ناشناس به ${group[0].name} ارسال شد.`,
      cancelKeyboard
    );
    return;
  }

  if (state === "sending_personal" && targetToken) {
    const target = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.anonToken, targetToken))
      .limit(1);

    if (!target[0]) {
      await bot.sendMessage(tid, "❗ کاربر مورد نظر یافت نشد.");
      await setState(tid, "idle");
      return;
    }

    const targetName = target[0].firstName ?? "کاربر";

    try {
      if (msg.text) {
        await bot.sendMessage(
          target[0].telegramId,
          `📩 *پیام ناشناس:*\n\n${msg.text}`,
          { parse_mode: "Markdown" }
        );
      } else {
        await bot.sendMessage(target[0].telegramId, "📩 *پیام ناشناس:*", {
          parse_mode: "Markdown",
        });
        await forwardMedia(target[0].telegramId, msg);
      }

      await db
        .update(usersTable)
        .set({ messageCount: sql`${usersTable.messageCount} + 1` })
        .where(eq(usersTable.telegramId, tid));

      await bot.sendMessage(
        tid,
        `✅ پیام ناشناس به ${targetName} ارسال شد.`,
        cancelKeyboard
      );
    } catch {
      await bot.sendMessage(
        tid,
        `❌ ارسال ناموفق بود. احتمالاً کاربر بات را بلاک کرده است.`,
        cancelKeyboard
      );
    }
    return;
  }
}

// ─── Media helpers ────────────────────────────────────────────────────────────
async function forwardMediaWithButton(targetId: number, msg: Message, senderTid: number | null) {
  const extra = senderTid
    ? { reply_markup: { inline_keyboard: [[{ text: "👤 پیام به فرستنده", url: `tg://user?id=${senderTid}` }]] } }
    : {};
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1]!;
    await bot.sendPhoto(targetId, photo.file_id, { caption: msg.caption ?? undefined, ...extra });
  } else if (msg.video) {
    await bot.sendVideo(targetId, msg.video.file_id, { caption: msg.caption ?? undefined, ...extra });
  } else if (msg.audio) {
    await bot.sendAudio(targetId, msg.audio.file_id, { caption: msg.caption ?? undefined, ...extra });
  } else if (msg.document) {
    await bot.sendDocument(targetId, msg.document.file_id, { caption: msg.caption ?? undefined, ...extra });
  } else if (msg.animation) {
    await bot.sendAnimation(targetId, msg.animation.file_id, { caption: msg.caption ?? undefined, ...extra });
  } else if (msg.voice) {
    await bot.sendVoice(targetId, msg.voice.file_id);
  } else if (msg.sticker) {
    await bot.sendSticker(targetId, msg.sticker.file_id);
  } else if (msg.video_note) {
    await bot.sendVideoNote(targetId, msg.video_note.file_id);
  }
}

async function forwardMedia(targetId: number, msg: Message) {
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1]!;
    await bot.sendPhoto(targetId, photo.file_id, { caption: msg.caption ?? undefined });
  } else if (msg.video) {
    await bot.sendVideo(targetId, msg.video.file_id, { caption: msg.caption ?? undefined });
  } else if (msg.audio) {
    await bot.sendAudio(targetId, msg.audio.file_id, { caption: msg.caption ?? undefined });
  } else if (msg.voice) {
    await bot.sendVoice(targetId, msg.voice.file_id);
  } else if (msg.document) {
    await bot.sendDocument(targetId, msg.document.file_id, { caption: msg.caption ?? undefined });
  } else if (msg.sticker) {
    await bot.sendSticker(targetId, msg.sticker.file_id);
  } else if (msg.video_note) {
    await bot.sendVideoNote(targetId, msg.video_note.file_id);
  } else if (msg.animation) {
    await bot.sendAnimation(targetId, msg.animation.file_id, { caption: msg.caption ?? undefined });
  }
}

bot.on("polling_error", (err) => {
  console.error("Polling error:", (err as Error).message);
});

export default bot;
