import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getStorage } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getTask, updateTask, addTaskToAssigneeIndex } from "../storage.js";

const composer = new Composer<Ctx>();

// ─── Assign task to self ─────────────────────────────────────────────────
// Callback format: task:assign_self:<taskId>
composer.callbackQuery(/^task:assign_self:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const taskId = ctx.match?.[1];
  if (!taskId) {
    await ctx.reply("Couldn't identify the task. Try again.");
    return;
  }

  const user = ctx.from;
  if (!user) {
    await ctx.reply("Couldn't identify you. Try /start first.");
    return;
  }

  const storage = getStorage();
  const task = await getTask(storage, taskId);
  if (!task) {
    await ctx.reply("That task no longer exists.");
    return;
  }

  await updateTask(storage, taskId, { assignee_id: user.id });
  await addTaskToAssigneeIndex(storage, user.id, taskId);

  await ctx.reply(`✅ You're now assigned to: ${task.title}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Mark done", `task:mark_done:${taskId}`)],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
