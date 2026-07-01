import { pgTable, text, serial, bigint, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  anonToken: text("anon_token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  isBlocked: boolean("is_blocked").default(false).notNull(),
  messageCount: integer("message_count").default(0).notNull(),
});

export const groupLinksTable = pgTable("group_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  showSenderHint: boolean("show_sender_hint").default(false).notNull(),
  messageCount: integer("message_count").default(0).notNull(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupLinkId: integer("group_link_id").notNull().references(() => groupLinksTable.id),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const userStatesTable = pgTable("user_states", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  state: text("state").notNull().default("idle"),
  targetToken: text("target_token"),
  targetType: text("target_type"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adSettingsTable = pgTable("ad_settings", {
  id: serial("id").primaryKey(),
  buttonText: text("button_text").notNull(),
  type: text("type").notNull(), // 'url' | 'message'
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, lastActiveAt: true });
export const insertGroupLinkSchema = createInsertSchema(groupLinksTable).omit({ id: true, createdAt: true });

export type User = typeof usersTable.$inferSelect;
export type GroupLink = typeof groupLinksTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type UserState = typeof userStatesTable.$inferSelect;
export type AdSetting = typeof adSettingsTable.$inferSelect;
