import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getStorage } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import {
  setUser,
  saveTask,
  addTaskToAssigneeIndex,
  parseDueDate,
} from "../storage.js";

// ─── Menu registration ──────────────────────────────────────────────────
registerMainMenuItem({ label: "📋 New task", data: "task:create", order: 10 });

const composer = new Composer<Ctx>();

// ─── Entry points: /newtask command + menu button ────────────────────────
composer.command("newtask", async (ctx) => {
  ctx.session.wizard_step = "title";
  ctx.session.draft = {};
  await ctx.reply("What's the task title?", {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "Type a short title…",
    },
  });
});

composer.callbackQuery("task:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.wizard_step = "title";
  ctx.session.draft = {};
  await ctx.reply("What's the task title?", {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "Type a short title…",
    },
  });
});

// ─── Cancel from any wizard step ─────────────────────────────────────────
composer.command("cancel", async (ctx) => {
  if (ctx.session.wizard_step) {
    ctx.session.wizard_step = null;
    ctx.session.draft = undefined;
    await ctx.reply("Cancelled. Tap /start to begin again.", {
      reply_markup: { remove_keyboard: true },
    });
  }
});

// ─── Wizard step handler ─────────────────────────────────────────────────
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.wizard_step;
  if (!step) return next();

  const text = ctx.message.text.trim();

  switch (step) {
    case "title": {
      if (text.length < 2) {
        await ctx.reply("Title needs at least 2 characters — try again.");
        return;
      }
      ctx.session.draft = { title: text };
      ctx.session.wizard_step = "description";
      await ctx.reply("Got it. Add a description? (or type /skip to skip)", {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Brief description…",
        },
      });
      return;
    }

    case "description": {
      ctx.session.draft!.description = text === "/skip" ? "" : text;
      ctx.session.wizard_step = "confirm";
      const d = ctx.session.draft!;
      const lines = ["📋 New task:", ""];
      lines.push(`Title: ${d.title}`);
      if (d.description) lines.push(`Description: ${d.description}`);
      lines.push("", "Create this task?");
      const summary = lines.join("\n");
      await ctx.reply(summary, {
        reply_markup: inlineKeyboard([
          [inlineButton("✅ Create task", "task:confirm"), inlineButton("Cancel", "task:create_cancel")],
        ]),
      });
      return;
    }

    default:
      return next();
  }
});

// ─── Confirm task creation ───────────────────────────────────────────────
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

// ─── Cancel task creation ────────────────────────────────────────────────
composer.callbackQuery("task:create_cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.wizard_step = null;
  ctx.session.draft = undefined;
  await ctx.reply("Task discarded. Tap /start to begin again.");
});

export default composer;
