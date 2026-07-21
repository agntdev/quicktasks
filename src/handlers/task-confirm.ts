import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getStorage } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  setUser,
  saveTask,
  addTaskToAssigneeIndex,
} from "../storage.js";

const composer = new Composer<Ctx>();

// ─── Confirm task creation (standalone callback) ─────────────────────────
composer.callbackQuery("task:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.draft;
  if (!draft?.title) {
    await ctx.reply("No task in progress. Tap 📋 New task to start.");
    return;
  }

  const now = new Date();
  const chatId = ctx.chat?.id ?? 0;
  const taskId = `task_${chatId}_${now.getTime()}`;
  const user = ctx.from;
  const storage = getStorage();

  await saveTask(storage, {
    id: taskId,
    title: draft.title,
    description: draft.description ?? "",
    assignee_id: user?.id ?? 0,
    creator_id: user?.id ?? 0,
    due_date: draft.due_date ?? "",
    status: "open",
    priority: "medium",
    project_tag: draft.project_tag ?? "",
    created_at: now.toISOString(),
    chat_id: chatId,
  });

  if (user) {
    await setUser(storage, {
      telegram_id: user.id,
      display_name: user.first_name,
      username: user.username ?? "",
    });
    await addTaskToAssigneeIndex(storage, user.id, taskId);
  }

  ctx.session.wizard_step = null;
  ctx.session.draft = undefined;

  await ctx.reply(`✅ Task created: ${draft.title}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Mark done", `task:mark_done:${taskId}`)],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
