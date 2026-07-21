import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getStorage } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getTasksByAssignee,
  getTask,
  type Task,
} from "../storage.js";
import { formatDate } from "../storage.js";

// ─── Menu registration ──────────────────────────────────────────────────
registerMainMenuItem({ label: "📋 My tasks", data: "mytasks:list", order: 20 });

const composer = new Composer<Ctx>();

// ─── /mytasks command ────────────────────────────────────────────────────
composer.command("mytasks", async (ctx) => {
  await showMyTasks(ctx);
});

// ─── Menu button ─────────────────────────────────────────────────────────
composer.callbackQuery("mytasks:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showMyTasks(ctx);
});

async function showMyTasks(ctx: Ctx) {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Couldn't identify you. Try /start first.");
    return;
  }

  const storage = getStorage();
  const taskIds = await getTasksByAssignee(storage, userId);

  if (taskIds.length === 0) {
    await ctx.reply("No tasks assigned to you yet. Tap 📋 New task to create one.", {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 New task", "task:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const tasks: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(storage, id);
    if (task) tasks.push(task);
  }

  if (tasks.length === 0) {
    await ctx.reply("No tasks assigned to you yet. Tap 📋 New task to create one.", {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 New task", "task:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const statusIcon = (s: Task["status"]) => {
    switch (s) {
      case "open": return "🔴";
      case "in_progress": return "🟡";
      case "done": return "🟢";
    }
  };

  const lines = tasks.map((t) => {
    const parts = [`${statusIcon(t.status)} ${t.title}`];
    if (t.due_date) {
      const due = new Date(t.due_date);
      if (!isNaN(due.getTime())) parts.push(`  Due: ${formatDate(due)}`);
    }
    return parts.join("\n");
  });

  const buttons = tasks
    .filter((t) => t.status !== "done")
    .map((t) => [inlineButton(`✅ ${t.title}`, `task:mark_done:${t.id}`)]);

  await ctx.reply(`Your tasks:\n\n${lines.join("\n\n")}`, {
    reply_markup: inlineKeyboard([
      ...buttons,
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

export default composer;
