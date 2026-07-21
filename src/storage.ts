import type { StorageAdapter } from "grammy";

// ─── Types ───────────────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id: number;
  creator_id: number;
  due_date: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  project_tag: string;
  created_at: string;
  chat_id: number;
}

export interface Project {
  tag: string;
  default_reminders: number[];
}

export interface Reminder {
  task_id: string;
  scheduled_times: string[];
}

// ─── Storage helpers ─────────────────────────────────────────────────────
// All durable data goes through these helpers backed by the toolkit's
// persistent storage (Redis in production, MemorySessionStorage in dev/test).
// No in-memory Maps. No keyspace scans. Explicit index records for lookups.

function redisKey(type: string, id: string): string {
  return `${type}:${id}`;
}

// ── Users ────────────────────────────────────────────────────────────────
export async function setUser(
  storage: StorageAdapter<Record<string, unknown>>,
  user: { telegram_id: number; display_name: string; username: string },
): Promise<void> {
  const key = redisKey("user", String(user.telegram_id));
  const existing = (await storage.read(key)) as Record<string, unknown> | undefined;
  const data: Record<string, unknown> = {
    ...(existing ?? {}),
    telegram_id: user.telegram_id,
    display_name: user.display_name,
    username: user.username,
  };
  await storage.write(key, data);
}

export async function getUser(
  storage: StorageAdapter<Record<string, unknown>>,
  telegramId: number,
): Promise<{ telegram_id: number; display_name: string; username: string } | null> {
  const key = redisKey("user", String(telegramId));
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  if (!data) return null;
  return {
    telegram_id: data.telegram_id as number,
    display_name: data.display_name as string,
    username: data.username as string,
  };
}

// ── Team members (index) ────────────────────────────────────────────────
export async function setTeamId(
  storage: StorageAdapter<Record<string, unknown>>,
  userId: number,
  teamId: string,
): Promise<void> {
  const key = redisKey("user_team", String(userId));
  await storage.write(key, { team_id: teamId });
}

export async function getTeamId(
  storage: StorageAdapter<Record<string, unknown>>,
  userId: number,
): Promise<string | null> {
  const key = redisKey("user_team", String(userId));
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  return (data?.team_id as string) ?? null;
}

// ── Tasks ────────────────────────────────────────────────────────────────
export async function saveTask(
  storage: StorageAdapter<Record<string, unknown>>,
  task: Task,
): Promise<void> {
  const key = redisKey("task", task.id);
  await storage.write(key, task as unknown as Record<string, unknown>);
  await addTaskToProjectIndex(storage, task.project_tag, task.id);
}

export async function getTask(
  storage: StorageAdapter<Record<string, unknown>>,
  taskId: string,
): Promise<Task | null> {
  const key = redisKey("task", taskId);
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  if (!data) return null;
  return data as unknown as Task;
}

export async function updateTask(
  storage: StorageAdapter<Record<string, unknown>>,
  taskId: string,
  updates: Partial<Task>,
): Promise<Task | null> {
  const task = await getTask(storage, taskId);
  if (!task) return null;
  const updated = { ...task, ...updates };
  await saveTask(storage, updated);
  return updated;
}

// ── Task index (per project) ─────────────────────────────────────────────
export async function addTaskToProjectIndex(
  storage: StorageAdapter<Record<string, unknown>>,
  projectTag: string,
  taskId: string,
): Promise<void> {
  const key = redisKey("project_tasks", projectTag);
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  const taskIds = ((data?.task_ids as string[]) ?? []).filter((id) => id !== taskId);
  taskIds.push(taskId);
  await storage.write(key, { task_ids: taskIds });
}

export async function getTasksByProject(
  storage: StorageAdapter<Record<string, unknown>>,
  projectTag: string,
): Promise<string[]> {
  const key = redisKey("project_tasks", projectTag);
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  return (data?.task_ids as string[]) ?? [];
}

// ── Tasks by assignee (index) ────────────────────────────────────────────
export async function addTaskToAssigneeIndex(
  storage: StorageAdapter<Record<string, unknown>>,
  assigneeId: number,
  taskId: string,
): Promise<void> {
  const key = redisKey("user_tasks", String(assigneeId));
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  const taskIds = ((data?.task_ids as string[]) ?? []).filter((id) => id !== taskId);
  taskIds.push(taskId);
  await storage.write(key, { task_ids: taskIds });
}

export async function getTasksByAssignee(
  storage: StorageAdapter<Record<string, unknown>>,
  assigneeId: number,
): Promise<string[]> {
  const key = redisKey("user_tasks", String(assigneeId));
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  return (data?.task_ids as string[]) ?? [];
}

// ── Projects ─────────────────────────────────────────────────────────────
export async function saveProject(
  storage: StorageAdapter<Record<string, unknown>>,
  project: Project,
): Promise<void> {
  const key = redisKey("project", project.tag);
  await storage.write(key, project as unknown as Record<string, unknown>);
}

export async function getProject(
  storage: StorageAdapter<Record<string, unknown>>,
  tag: string,
): Promise<Project | null> {
  const key = redisKey("project", tag);
  const data = (await storage.read(key)) as Record<string, unknown> | undefined;
  if (!data) return null;
  return data as unknown as Project;
}

// ── Reminders ────────────────────────────────────────────────────────────
export async function saveReminder(
  storage: StorageAdapter<Record<string, unknown>>,
  reminder: Reminder,
): Promise<void> {
  const key = redisKey("reminder", reminder.task_id);
  await storage.write(key, reminder as unknown as Record<string, unknown>);
}

// ── Clock ────────────────────────────────────────────────────────────────
/** Injectable clock seam — override in tests. */
export function now(): Date {
  return new Date();
}

/** Parse a due-date string into a Date. Supports natural language and ISO. */
export function parseDueDate(input: string, clock: () => Date = now): Date | null {
  const trimmed = input.trim().toLowerCase();
  const base = clock();

  if (trimmed === "today") {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59);
  }
  if (trimmed === "tomorrow") {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 0);
    return d;
  }

  // Try ISO parse
  const parsed = new Date(input.trim());
  if (!isNaN(parsed.getTime())) return parsed;

  // Try "next <weekday>"
  const weekdayMatch = /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.exec(trimmed);
  if (weekdayMatch) {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = days.indexOf(weekdayMatch[1].toLowerCase());
    const d = new Date(base);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    d.setHours(23, 59, 59, 0);
    return d;
  }

  return null;
}

/** Format a date for display (human-friendly). */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
