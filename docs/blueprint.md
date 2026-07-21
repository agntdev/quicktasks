# QuickTasks Task Manager — Bot specification

**Archetype:** workflow

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for small teams to create, assign, and track short tasks and reminders directly in chats and groups with automated reminders and status tracking.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- small teams
- startups
- project leads

## Success criteria

- Tasks created with title/assignee/due date in Telegram chats
- Automated reminders sent to assignees
- Status tracking with button interactions
- Admin notifications for overdue tasks

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with task creation options
- **/newtask** (command, actor: user, command: /newtask) — Start task creation wizard with optional quick-create syntax
- **Assign to me** (button, actor: user, callback: task:assign_self) — Claim task ownership
- **Mark Done** (button, actor: user, callback: task:mark_done) — Update task status to completed
- **/mytasks** (command, actor: user, command: /mytasks) — List all tasks assigned to the user
- **Task creation confirmation** (callback, actor: user, callback: task:confirm) — Finalize task creation with all required fields

## Flows

### Task creation
_Trigger:_ /newtask

1. Prompt for title
2. Optional description input
3. Assignee selection
4. Due date parsing
5. Project tagging
6. Final confirmation

_Data touched:_ Task

### Status update
_Trigger:_ task:mark_done

1. Verify permissions
2. Update status field
3. Notify assignee
4. Post update to original chat

_Data touched:_ Task

### Reminder scheduling
_Trigger:_ task:created

1. Parse due date
2. Schedule 24h pre-reminder
3. Schedule 1h pre-reminder
4. Schedule due-time alert

_Data touched:_ Reminder

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Task** _(retention: persistent)_ — Task with title, assignee, due date, status, and project tag
  - fields: title, description, assignee_id, due_date, status, priority, project_tag
- **Project** _(retention: persistent)_ — Task grouping label with optional reminder schedule
  - fields: tag, default_reminders
- **User** _(retention: persistent)_ — Telegram user with display name and username
  - fields: telegram_id, display_name, username
- **Reminder** _(retention: persistent)_ — Scheduled notification for task deadlines
  - fields: task_id, scheduled_times

## Integrations

- **Telegram** (required) — Bot API messaging and group chat integration
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure admin notification chat
- Set default reminder intervals per project
- View overdue task reports

## Notifications

- Task creation confirmation in original chat
- Direct message reminders to assignees
- Admin alerts for overdue tasks
- Status change notifications

## Permissions & privacy

- Tasks in groups are visible to all group members
- Direct chat tasks are private between creator and assignee
- Admin chat has read-only access to all task data

## Edge cases

- Natural language date parsing failures
- Invalid user mentions in task assignment
- Task deletion by original creator
- Reminder scheduling for past dates

## Required tests

- End-to-end task creation with quick-create syntax
- Reminder delivery sequence validation
- Status change notification flow
- Admin alert suppression for non-overdue tasks

## Assumptions

- Default admin chat is bot owner's personal chat
- Timezone inferred from user's Telegram profile
- No file storage beyond message attachments
