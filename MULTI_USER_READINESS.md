# Multi-User Readiness Guide for DayFlow

This guide walks you through making DayFlow ready for testing with friends, step by step.

## Current Status Assessment

✅ **Already Complete:**
- Email/password authentication via Supabase Auth
- Protected routes with middleware
- All API routes require authentication
- User-specific data filtering in frontend

⚠️ **Needs Attention:**
- Row Level Security (RLS) policies on database tables
- Hard-coded user IDs in utility scripts
- Scheduler auto-run configuration
- Development environment variables
- User onboarding flow

---

## Step 1: Database Security - Row Level Security (RLS)

**What:** Ensure users can only access their own data at the database level.

**Why:** Even if your application code filters by user_id, without RLS someone could use the Supabase client directly to access other users' data.

### Tables that need RLS:

1. **task_templates** - Users' recurring task definitions
2. **scheduled_tasks** - Daily task instances
3. **scheduled_tasks_archive** - Historical records
4. **voice_jobs** - Voice recording processing queue

### Action Required:

You need to run SQL in your Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_jobs ENABLE ROW LEVEL SECURITY;

-- Policy for task_templates: Users can only access their own templates
CREATE POLICY "Users can view own templates"
  ON task_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON task_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON task_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON task_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Policy for scheduled_tasks: Users can only access their own tasks
CREATE POLICY "Users can view own scheduled tasks"
  ON scheduled_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled tasks"
  ON scheduled_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled tasks"
  ON scheduled_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled tasks"
  ON scheduled_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Policy for scheduled_tasks_archive
CREATE POLICY "Users can view own archived tasks"
  ON scheduled_tasks_archive FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own archived tasks"
  ON scheduled_tasks_archive FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for voice_jobs: Users can only access their own voice jobs
CREATE POLICY "Users can view own voice jobs"
  ON voice_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice jobs"
  ON voice_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice jobs"
  ON voice_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice jobs"
  ON voice_jobs FOR DELETE
  USING (auth.uid() = user_id);
```

**Testing RLS:**
After enabling, try to query another user's data using the service role key - it should work (service role bypasses RLS). But using the anon key with a user's session token should only show that user's data.

---

## Step 2: Scheduler Auto-Run Per User

**What:** Currently you have a scheduled task that runs the scheduler at 07:00. This is hardcoded for your user ID.

**Why:** Each user needs their schedule generated independently at their preferred time.

### Current Setup (Windows Task Scheduler):
- Task: Runs at 07:00 Europe/London
- Command: `python -m dayflow.scheduler_main --date today --user YOUR_ID --force --write`

### Options for Multi-User:

#### Option A: Scheduled Job per User (Simple, Manual)
- Create a Windows Task for each friend
- Each runs at their preferred time
- Command: `python -m dayflow.scheduler_main --date today --user THEIR_ID --force --write`
- **Pros:** Simple, reliable, full control
- **Cons:** Manual setup for each user

#### Option B: Database-Driven Scheduler (Advanced)
- Create a `user_preferences` table with `scheduler_time` field
- Create one scheduled task that runs every hour
- Queries all users who need scheduling at current hour
- Runs scheduler for each user
- **Pros:** Scales automatically, users can configure their own time
- **Cons:** More complex to implement

#### Option C: Manual Trigger Only (Testing Phase)
- Disable auto-scheduling entirely
- Users click "Recreate Schedule" button when needed
- **Pros:** No background jobs needed, simple for testing
- **Cons:** Requires user action daily

**Recommendation for Testing:** Start with Option C (manual trigger only). Your friends can click "Recreate Schedule" when they start their day. This gives you time to gather feedback before implementing automatic scheduling.

**Action Required:**
1. Disable your current Windows Task Scheduler job (don't delete, just disable)
2. Document for testers: "Click the refresh button at the top of Today page each morning"
3. Monitor if they forget - if it's a problem, implement Option A for each tester

---

## Step 3: Environment Variables & Deployment

**What:** Your `.env.local` file contains your personal Supabase credentials.

**Why:** Friends need to use the same Supabase project (same credentials) but shouldn't need to clone your repo.

### Current Credentials (in .env.local):
- `NEXT_PUBLIC_SUPABASE_URL` - Safe to share (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Safe to share (public, RLS-protected)
- `SUPABASE_SERVICE_ROLE_KEY` - **SECRET** - Do NOT share

### Deployment Options:

#### Option A: Deploy to Vercel/Netlify (Recommended)
1. Push code to GitHub (without .env.local)
2. Deploy to Vercel: Connect GitHub repo
3. Add environment variables in Vercel dashboard
4. Share the deployed URL: `https://dayflow-yourname.vercel.app`

**Pros:**
- Friends just visit a URL, no setup needed
- Automatic HTTPS
- Free tier sufficient for testing
- Easy updates (push to GitHub = auto deploy)

**Cons:**
- Scheduler runs on your PC, not in cloud
- Voice worker runs on your PC, not in cloud

#### Option B: Keep Running on Your PC (Testing Only)
1. Keep dev server running on your PC
2. Use Cloudflare Tunnel (you already have this set up!)
3. Share your tunnel URL with friends
4. They access your PC through the tunnel

**Pros:**
- No deployment needed
- Scheduler and voice worker work as-is

**Cons:**
- Your PC must be running 24/7
- Slower for friends (going through your home connection)
- Security risk (exposing your dev environment)

**Recommendation:** Deploy to Vercel for testing. The scheduler can still run on your PC and update the shared database.

---

## Step 4: Scheduler & Voice Worker Architecture

**Current Setup:**
- Scheduler: Python script on your PC
- Voice Worker: Node script on your PC
- Both write to Supabase (cloud database)

**For Multi-User:**

### Scheduler:
- **Keep running on your PC** - It can service all users
- When it runs for a user, it only touches that user's data
- Can run sequentially for each user (e.g., 07:00 User A, 07:05 User B)

### Voice Worker:
- **Keep running on your PC** - It processes jobs for all users
- Polls the `voice_jobs` table for any user
- Already user-aware (jobs have `user_id` field)

**Action Required:**
1. Ensure scheduler can accept user ID parameter (✅ already done)
2. Ensure voice worker processes jobs for any user (✅ already done)
3. Keep both running on your PC during testing phase

**Future Scaling:**
- If testing is successful and you want to go bigger:
  - Deploy scheduler as AWS Lambda / Vercel Cron / GitHub Actions
  - Deploy voice worker as cloud function or container
  - For now, running on your PC is fine for 5-10 friends

---

## Step 5: User Onboarding Experience

**What:** When a friend signs up, they need some initial setup.

**Current Experience:**
1. User creates account
2. Sees empty "Today" page
3. No tasks, no templates, no guidance

**Recommended Improvements:**

### A. Welcome Page (Priority 1)
Create `app/welcome/page.tsx` that shows for first-time users:

```typescript
// Check if user has any templates
const { data: templates } = await supabase
  .from('task_templates')
  .select('id')
  .limit(1);

if (!templates || templates.length === 0) {
  // Show welcome page
}
```

**Welcome Page Content:**
- Welcome message explaining DayFlow
- Video or guide on how to use it
- Button: "Add Your First Task"
- Button: "Import Sample Schedule"

### B. Sample Templates (Priority 2)
Create a set of example tasks that new users can import:

```sql
-- Sample templates table
CREATE TABLE sample_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  duration_minutes int DEFAULT 30,
  priority int DEFAULT 3,
  repeat_unit text DEFAULT 'daily',
  is_routine boolean DEFAULT false,
  start_time time,
  category text -- 'morning', 'work', 'evening', etc.
);

-- Insert examples
INSERT INTO sample_templates (title, duration_minutes, start_time, category, is_routine)
VALUES
  ('Morning coffee/planning', 30, '08:00', 'morning', true),
  ('Check emails', 20, NULL, 'work', false),
  ('Exercise', 45, NULL, 'health', false),
  ('Lunch break', 60, '13:00', 'daily', true);
```

Function to copy samples to new user:

```typescript
async function importSampleTemplates(userId: string) {
  const { data: samples } = await supabase
    .from('sample_templates')
    .select('*');
  
  const userTemplates = samples.map(s => ({
    user_id: userId,
    title: s.title,
    description: s.description,
    duration_minutes: s.duration_minutes,
    priority: s.priority,
    repeat_unit: s.repeat_unit,
    is_routine: s.is_routine,
    start_time: s.start_time,
  }));
  
  await supabase.from('task_templates').insert(userTemplates);
}
```

### C. Inline Tutorial (Priority 3)
Add tooltips/hints on first use:
- "Click here to add a task"
- "This is your schedule for today"
- "Mark tasks complete by clicking ✓"

Use `localStorage` to track which hints have been shown.

---

## Step 6: Testing Checklist

Before inviting friends, test these scenarios:

### Account Creation
- [ ] Can create account with email/password
- [ ] Receive confirmation email (if enabled)
- [ ] Can log in after creation
- [ ] Can log out and log back in

### Data Isolation
- [ ] Create 2 test accounts
- [ ] Add tasks in Account A
- [ ] Log in as Account B
- [ ] Verify Account B doesn't see Account A's tasks
- [ ] Try to access Account A's task ID in Account B (should fail)

### Core Functionality (per user)
- [ ] Can add a task template
- [ ] Can edit a task template
- [ ] Can delete a task template
- [ ] Can create schedule (manual trigger)
- [ ] Schedule contains only their tasks
- [ ] Can mark task complete
- [ ] Can mark recurring task series complete
- [ ] Can skip a recurring task
- [ ] Can record voice note (if sharing Cloudflare tunnel)
- [ ] Voice note becomes a task only for them

### Scheduler (your PC)
- [ ] Can run scheduler for User A
- [ ] Can run scheduler for User B
- [ ] Each gets their own schedule
- [ ] No cross-contamination of data

### Performance
- [ ] Page loads in < 2 seconds
- [ ] Schedule generation completes in < 5 seconds
- [ ] Voice processing completes in < 30 seconds

---

## Step 7: Inviting Friends - The Process

### Preparation
1. **Complete Steps 1-4 above**
2. **Deploy to Vercel** (or keep tunnel running 24/7)
3. **Create a test account yourself** and use it for a day
4. **Write a simple guide** (see template below)

### User Guide Template

```markdown
# Welcome to DayFlow Testing!

Thanks for helping test DayFlow - an AI-powered ADHD-friendly daily scheduler.

## Getting Started

1. **Sign Up**
   - Go to [your-deployed-url]/auth/login
   - Click "Sign Up" 
   - Enter your email and create a password
   - Log in

2. **Add Your First Tasks**
   - Click "Tasks" in the top menu
   - Add 3-5 tasks you do regularly
   - Example: "Check emails", "Exercise", "Lunch"
   - Set how long each takes
   - Set if they repeat (daily/weekly/none)

3. **Create Your Schedule**
   - Go to "Today" page
   - Click the refresh button at the top
   - Wait 5 seconds
   - Your schedule appears!

4. **Using Your Schedule**
   - Check off tasks as you complete them: ✓
   - Click "Edit" to change task details
   - Click "Skip" to skip just today
   - Click "✓ Done" to finish a recurring task permanently

## What to Test

- Does the schedule make sense?
- Are the times reasonable?
- Does it handle your routines well?
- Can you easily add/edit/complete tasks?

## Reporting Issues

Send me a message with:
- What you were trying to do
- What happened (screenshot helps!)
- What you expected to happen

## Known Limitations

- You need to manually create schedule each morning (click refresh button)
- Voice input only works if I'm running my PC
- Mobile UI is not yet optimized

Thanks for testing! 🎉
```

### Initial Tester Group
**Start small:** 2-3 friends first
- Choose people who:
  - Will give honest feedback
  - Won't mind rough edges
  - Have ADHD or scheduling challenges (your target users)
  - Are available to chat if things break

**Gradual Expansion:**
- Week 1: 2-3 friends
- Week 2: If stable, add 3-5 more
- Week 3: If still stable, add 5-10 more

---

## Step 8: Monitoring & Support

### Things to Monitor

1. **Error Logs**
   - Check Vercel logs daily: `vercel logs`
   - Check your scheduler output
   - Check voice worker output

2. **Database Growth**
   - Supabase dashboard → Table sizes
   - scheduled_tasks: Should grow linearly (30 rows per user per day)
   - scheduled_tasks_archive: Clean up old data monthly

3. **User Feedback**
   - Create a simple form or use Discord/Slack
   - Ask: "What's confusing?" not "Do you like it?"

### Common Issues & Solutions

**"My schedule is empty"**
- Did they click the refresh button?
- Do they have any task templates?
- Check scheduler logs for errors

**"I can't see my tasks"**
- Are they logged in?
- Did RLS block their query? (check Supabase logs)

**"Voice recording doesn't work"**
- Is your PC running?
- Is Cloudflare Tunnel active?
- Is voice worker running?

---

## Step 9: Future Improvements

After successful testing, consider:

1. **Automatic Scheduling**
   - User sets preferred wake-up time
   - Scheduler runs automatically each day
   - Email/push notification when schedule ready

2. **Mobile App**
   - React Native or PWA
   - Push notifications
   - Offline support

3. **Social Features**
   - Share schedule with accountability buddy
   - Group tasks (family coordination)
   - Public routines library

4. **AI Enhancements**
   - Learn from completion patterns
   - Suggest optimal task times
   - Detect procrastination patterns
   - Adjust difficulty based on energy levels

5. **Integrations**
   - Google Calendar sync
   - Todoist import
   - Notion integration
   - Apple Health (for energy tracking)

---

## Quick Start Summary

**Absolute Minimum to Go Live:**

1. ✅ Run RLS SQL script (Step 1)
2. ✅ Deploy to Vercel (Step 3)
3. ✅ Keep scheduler running on your PC
4. ✅ Test with 2 accounts yourself
5. ✅ Write 1-page user guide
6. ✅ Invite 2 friends

**Can be added later:**
- Welcome page
- Sample templates
- Automatic scheduling
- Mobile optimization

**Time Estimate:**
- RLS setup: 15 minutes
- Vercel deployment: 30 minutes
- Testing: 1 hour
- User guide: 30 minutes
- **Total: ~2.5 hours**

---

## Ready to Start?

Let me know which step you'd like to tackle first! I recommend:

1. **Step 1 (RLS)** - Critical for security
2. **Step 3 (Deployment)** - Test yourself on Vercel
3. **Step 6 (Testing)** - Create 2nd account, verify isolation
4. **Step 7 (Invite)** - Start with your most patient friend

We can go through each step together. What would you like to start with?
