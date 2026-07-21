import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getStorage } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getTask, updateTask } from "../storage.js";

const composer = new Composer<Ctx>();

// ─── Mark task as done ───────────────────────────────────────────────────
// Callback format: task:mark_done:<taskId>
composer.callbackQuery(/^task:mark_done:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const taskId = ctx.match?.[1];
  if (!taskId) {
    await ctx.reply("Couldn't identify the task. Try again.");
    return;
  }

  const storage = getStorage();
  const task = await getTask(storage, taskId);
  if (!task) {
    await ctx.reply("That task no longer exists.");
    return;
  }

  await updateTask(storage, taskId, { status: "done" });

  await ctx.reply(`✅ Done: ${task.title}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
