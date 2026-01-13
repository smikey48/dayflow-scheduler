# dayflow/scheduler_main.py
import os
import sys
import logging
import argparse
from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, Any
from pathlib import Path

import pandas as pd  # used to build tasks_df for schedule_day

def carry_forward_incomplete_one_offs(run_date: date, supabase) -> int:
    """
    Carry forward unfinished floating tasks from the last day the scheduler ran:
      - One-offs (repeat='none') → always carry forward
      - Repeats (daily/weekly/monthly) → carry forward only if NOT already present today
    Only applies to floating (non-appointment, non-routine), and not deleted/completed.
    IMPORTANT: Skip any task whose template is soft-deleted (task_templates.is_deleted = true).
    IMPORTANT: Skip any task that was explicitly deleted/skipped today (scheduled_tasks.is_deleted = true).
    
    NOTE: This function finds the most recent date < today that has scheduled tasks,
    rather than always using yesterday. This handles cases where the scheduler missed days.
    """
    if supabase is None:
        print("[carry_forward] Skipped (no Supabase client).")
        return 0

    today = run_date.isoformat()

    # 1) Find the most recent date before today that has scheduled tasks
    # This handles cases where the scheduler didn't run for several days
    last_run_resp = supabase.table("scheduled_tasks").select("local_date")\
        .lt("local_date", today)\
        .order("local_date", desc=True)\
        .limit(1)\
        .execute()
    
    if not last_run_resp.data:
        print("[carry_forward] No previous scheduled tasks found.")
        return 0
    
    last_run_date = last_run_resp.data[0]["local_date"]
    print(f"[carry_forward] Last scheduler run was on {last_run_date} (today is {today})")

    # 2) Get unfinished floating tasks from that last run date
    y_resp = supabase.table("scheduled_tasks").select(
        "user_id, title, template_id, duration_minutes, priority, is_appointment, is_routine, is_fixed, timezone"
    ).eq("local_date", last_run_date)\
     .eq("is_deleted", False)\
     .eq("is_completed", False)\
     .eq("is_appointment", False)\
     .eq("is_routine", False)\
     .execute()
    y_rows = y_resp.data or []
    if not y_rows:
        print(f"[carry_forward] No unfinished floating tasks on {last_run_date}.")
        return 0

    # 2) Fetch the templates for those rows to inspect repeat fields AND is_deleted
    template_ids = sorted({r["template_id"] for r in y_rows if r.get("template_id")})
    if not template_ids:
        print("[carry_forward] No template-linked rows to carry forward.")
        return 0

    t_resp = supabase.table("task_templates").select(
        "id, is_deleted, repeat_unit, repeat, repeat_interval, repeat_days, priority, date"
    ).in_("id", template_ids).execute()
    t_rows = t_resp.data or []
    t_by_id = {t["id"]: t for t in t_rows}

    # 3) Build a set of today's already-present template_ids to avoid dupes for repeats
    # Also fetch which ones have times to avoid overwriting scheduled tasks
    today_resp = supabase.table("scheduled_tasks").select("template_id, start_time, is_deleted")\
        .eq("local_date", today).execute()
    todays_templates = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id")}
    todays_scheduled = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id") and r.get("start_time")}
    todays_deleted = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id") and r.get("is_deleted")}
    
    if todays_deleted:
        print(f"[carry_forward] Found {len(todays_deleted)} deleted/skipped task(s) today - will not carry forward.")

    to_insert: list[dict] = []
    for r in y_rows:
        tid = r.get("template_id")
        if not tid:
            continue
        tmeta = t_by_id.get(tid, {})

        # **Skip** if the template was soft-deleted
        if tmeta.get("is_deleted") is True:
            continue

        # **Skip** if this task was deleted/skipped today (user explicitly skipped it)
        if tid in todays_deleted:
            continue

        # Skip if already scheduled today with a time (don't overwrite the scheduler's work)
        if tid in todays_scheduled:
            continue

        # Canonicalize repeat: prefer 'repeat' if present
        unit = (tmeta.get("repeat") or tmeta.get("repeat_unit") or "none").lower()

        if unit == "none":
            # one-off → check defer date before carrying forward
            defer_date = tmeta.get("date")
            if defer_date:
                # Parse defer date and compare with today
                try:
                    from datetime import datetime
                    defer_dt = datetime.fromisoformat(defer_date).date()
                    if defer_dt > run_date:
                        print(f"[carry_forward] Skipping '{r['title']}' - deferred until {defer_date}")
                        continue
                except (ValueError, TypeError) as e:
                    print(f"[carry_forward] Warning: invalid defer date '{defer_date}' for '{r['title']}': {e}")
            # If no defer date or defer date has passed, carry forward
            pass
        else:
            # repeating → only if not already present today
            if tid in todays_templates:
                continue

        # Insert shape MUST NOT include generated 'date'
        to_insert.append({
            "user_id": r["user_id"],
            "title": r["title"],
            "template_id": tid,
            "local_date": today,
            "start_time": None,
            "end_time": None,
            "duration_minutes": r.get("duration_minutes"),
            "priority": tmeta.get("priority", r.get("priority", 3)),
            "is_appointment": False,
            "is_routine": False,
            "is_fixed": r.get("is_fixed", False),
            "timezone": r.get("timezone", "Europe/London"),
        })

    if not to_insert:
        print("[carry_forward] Nothing to insert.")
        return 0

    # Use upsert to avoid duplicate key errors if task already exists
    ins_resp = (
        supabase.table("scheduled_tasks")
        .upsert(to_insert, on_conflict="user_id,local_date,template_id")
        .execute()
    )
    count = len(ins_resp.data or [])
    print(f"[carry_forward] Upserted {count} carried-forward tasks for {today}.")
    return count


def carry_forward_missed_days(run_date: date, supabase) -> int:
    """
    For days when the scheduler didn't run, instantiate tasks that should have appeared.
    
    This handles cases where the scheduler missed multiple days. For each missed day:
    - Daily tasks should have appeared
    - Weekly tasks (if that day of week matches)
    - Monthly tasks (if that day of month matches)
    
    These tasks are carried forward to today as incomplete floating tasks.
    """
    if supabase is None:
        print("[carry_forward_missed] Skipped (no Supabase client).")
        return 0
    
    today = run_date.isoformat()
    
    # 1) Find the last day the scheduler ran
    last_run_resp = supabase.table("scheduled_tasks").select("local_date")\
        .lt("local_date", today)\
        .order("local_date", desc=True)\
        .limit(1)\
        .execute()
    
    if not last_run_resp.data:
        print("[carry_forward_missed] No previous scheduled tasks found.")
        return 0
    
    last_run_date_str = last_run_resp.data[0]["local_date"]
    last_run_date = datetime.fromisoformat(last_run_date_str).date()
    
    # Calculate missed days
    days_missed = (run_date - last_run_date).days - 1
    if days_missed <= 0:
        print(f"[carry_forward_missed] No missed days (last run: {last_run_date_str}).")
        return 0
    
    print(f"[carry_forward_missed] Scheduler missed {days_missed} day(s) between {last_run_date_str} and {today}")
    
    # 2) Get all active templates
    t_resp = supabase.table("task_templates").select(
        "id, user_id, title, repeat_unit, repeat, repeat_interval, repeat_days, day_of_month, "
        "duration_minutes, priority, is_appointment, is_routine, is_fixed, timezone, is_deleted, date"
    ).eq("is_deleted", False).execute()
    
    templates = t_resp.data or []
    if not templates:
        print("[carry_forward_missed] No active templates found.")
        return 0
    
    # 3) Check what's already scheduled for today
    today_resp = supabase.table("scheduled_tasks").select("template_id, is_deleted")\
        .eq("local_date", today).execute()
    todays_templates = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id")}
    todays_deleted = {r["template_id"] for r in (today_resp.data or []) if r.get("template_id") and r.get("is_deleted")}
    
    to_insert: list[dict] = []
    
    # 4) For each missed day, check which tasks should have been instantiated
    for day_offset in range(1, days_missed + 1):
        missed_date = last_run_date + timedelta(days=day_offset)
        missed_date_str = missed_date.isoformat()
        
        for tmpl in templates:
            tid = tmpl["id"]
            
            # Skip if already scheduled for today or deleted today
            if tid in todays_templates or tid in todays_deleted:
                continue
            
            # Skip appointments and routines (they have fixed times, not carried forward)
            if tmpl.get("is_appointment") or tmpl.get("is_routine"):
                continue
            
            # Check if this template should have created an instance on missed_date
            unit = (tmpl.get("repeat") or tmpl.get("repeat_unit") or "none").lower()
            should_instantiate = False
            
            if unit == "daily":
                should_instantiate = True
            elif unit == "weekly":
                repeat_days = tmpl.get("repeat_days") or []
                if repeat_days:
                    dow = missed_date.weekday()  # Monday=0, Sunday=6
                    should_instantiate = dow in repeat_days
            elif unit == "monthly":
                day_of_month = tmpl.get("day_of_month")
                if day_of_month:
                    should_instantiate = missed_date.day == day_of_month
            elif unit == "none":
                # One-off: check if it was due on that missed date
                defer_date_str = tmpl.get("date")
                if defer_date_str:
                    try:
                        defer_date = datetime.fromisoformat(defer_date_str).date()
                        if defer_date == missed_date:
                            should_instantiate = True
                    except (ValueError, TypeError):
                        pass
            
            # If this task should have appeared on a missed day, carry it forward
            if should_instantiate:
                # Check if we already added this template (avoid duplicates)
                if not any(item["template_id"] == tid for item in to_insert):
                    to_insert.append({
                        "user_id": tmpl["user_id"],
                        "title": tmpl["title"],
                        "template_id": tid,
                        "local_date": today,
                        "start_time": None,
                        "end_time": None,
                        "duration_minutes": tmpl.get("duration_minutes"),
                        "priority": tmpl.get("priority", 3),
                        "is_appointment": False,
                        "is_routine": False,
                        "is_fixed": tmpl.get("is_fixed", False),
                        "timezone": tmpl.get("timezone", "Europe/London"),
                    })
                    print(f"[carry_forward_missed] Adding '{tmpl['title']}' (missed on {missed_date_str})")
    
    if not to_insert:
        print("[carry_forward_missed] No tasks to carry forward from missed days.")
        return 0
    
    # 5) Upsert the tasks
    ins_resp = (
        supabase.table("scheduled_tasks")
        .upsert(to_insert, on_conflict="user_id,local_date,template_id")
        .execute()
    )
    count = len(ins_resp.data or [])
    print(f"[carry_forward_missed] Upserted {count} tasks from missed days.")
    return count


try:
    from dotenv import load_dotenv
    # Load .env then .env.dev (second does not override existing process env)
    load_dotenv()                 # .env (if present)
    load_dotenv('.env.dev')       # your existing dev file
except Exception:
    pass

def _get_env(*names, default=None):
    for name in names:
        # check as-is, UPPER, and lower
        for variant in (name, name.upper(), name.lower()):
            val = os.getenv(variant)
            if val:
                return val
    return default

SUPABASE_URL = _get_env('SUPABASE_URL', 'supabase_url')
# Accept any of these for the service role key:
SUPABASE_SERVICE_ROLE_KEY = _get_env(
    'SUPABASE_SERVICE_ROLE_KEY',  # what the scheduler expects
    'SUPABASE_SERVICE_KEY',       # what your .env.dev uses
    'supabase_service_key'
)

# Optional: default write flags from env (so logs won’t say dry_run=True)
DAYFLOW_DRY_RUN = _get_env('DAYFLOW_DRY_RUN', default='0') in ('1', 'true', 'True')
DAYFLOW_WRITE   = _get_env('DAYFLOW_WRITE', default='1') in ('1', 'true', 'True')

def archive_then_delete_scheduled_tasks_by_ids(conn, task_ids: list[str]) -> int:
    """
    Moves rows to scheduled_tasks_archive, then deletes them from scheduled_tasks.
    Returns number of rows deleted.
    """
    if not task_ids:
        return 0

    with conn:
        with conn.cursor() as cur:
            # 1) Archive (archived_at will be filled by DEFAULT)
            cur.execute(
                """
                INSERT INTO public.scheduled_tasks_archive
                SELECT scheduled_tasks.*
                FROM public.scheduled_tasks
                WHERE id = ANY(%s)
                """,
                (task_ids,),
            )
            archived = cur.rowcount  # rowcount after INSERT reflects inserted rows

            # 2) Delete
            cur.execute(
                """
                DELETE FROM public.scheduled_tasks
                WHERE id = ANY(%s)
                """,
                (task_ids,),
            )
            deleted = cur.rowcount

    # Optional: sanity log
    if archived != deleted:
        print(f"[warn] archived {archived} rows but deleted {deleted} rows for IDs {len(task_ids)}")

    return deleted

def archive_then_delete_scheduled_tasks_by_condition(conn, where_sql: str, where_params: tuple) -> int:
    """
    Archive then delete using an arbitrary WHERE condition shared by both statements.
    Example where_sql: "user_id = %s AND date = %s"
    """
    if not where_sql.strip():
        raise ValueError("where_sql must be non-empty")

    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO public.scheduled_tasks_archive
                SELECT scheduled_tasks.*
                FROM public.scheduled_tasks
                WHERE {where_sql}
                """,
                where_params,
            )
            archived = cur.rowcount

            cur.execute(
                f"""
                DELETE FROM public.scheduled_tasks
                WHERE {where_sql}
                """,
                where_params,
            )
            deleted = cur.rowcount

    if archived != deleted:
        print(f"[warn] archived {archived} rows but deleted {deleted} rows for condition [{where_sql}] params={where_params}")

    return deleted

def _load_env_files_manual() -> None:
    """
    Load key=value lines from common env files in the repo root without
    overwriting existing os.environ values.
    Supports simple KEY=VALUE (quotes optional). Ignores comments and blanks.
    """
    candidates = [".env", ".env.local", ".env.dev", ".env.local.dev"]
    cwd = Path.cwd()
    for fname in candidates:
        path = cwd / fname
        if not path.exists():
            continue
        try:
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                # Do not overwrite existing real env vars
                if key and key not in os.environ:
                    os.environ[key] = val
        except Exception:
            # Keep scheduler resilient if a file has odd encodings or permissions
            logging.exception("Failed loading env file: %s", path)

# Load env immediately on import
_load_env_files_manual()




from dayflow.planner import preprocess_recurring_tasks, schedule_day

LONDON = ZoneInfo("Europe/London")

# -----------------------
# Helpers & run gate
# -----------------------
def should_run_now(now: Optional[datetime] = None) -> bool:
    """Default daily gate: run only at/after 07:00 Europe/London."""
    now = now or datetime.now(LONDON)
    return now.time() >= time(7, 0)

def _mask_secret(value: str, keep_start: int = 6, keep_end: int = 4) -> str:
    if not value:
        return "<missing>"
    if len(value) <= keep_start + keep_end:
        return value[0:1] + "…"  # very short, just hint
    return f"{value[:keep_start]}…{value[-keep_end:]}"

def _assert_required_env() -> None:
    """
    Verifies critical environment variables are present. Prints masked values so
    you can confirm which config is being used when running locally or in CI.
    Accepts either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.
    """
    url = os.getenv("SUPABASE_URL")
    role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    svc_key = os.getenv("SUPABASE_SERVICE_KEY")
    service_key = role_key or svc_key

    print("\n[Scheduler Env Preflight]")
    print(f"  SUPABASE_URL: {_mask_secret(url) if url else '<missing>'}")
    # Show both so it's obvious which one is set
    print(f"  SUPABASE_SERVICE_ROLE_KEY: {_mask_secret(role_key) if role_key else '<missing>'}")
    print(f"  SUPABASE_SERVICE_KEY:      {_mask_secret(svc_key) if svc_key else '<missing>'}")

    missing = []
    if not url:
        missing.append("SUPABASE_URL")
    if not service_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY")

    if missing:
        print(
            "\nERROR: Missing required environment variables.\n"
            f"Please set {', '.join(missing)} in your environment (.env, .env.dev, etc.).\n"
            "The scheduler will not be able to write to Supabase without them.\n"
        )
        sys.exit(2)
    print("[Env OK]\n")


# -----------------------
# CLI
# -----------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="dayflow-scheduler",
        description="Generate today's schedule from task templates."
    )
    p.add_argument(
        "--date",
        help="Run date in YYYY-MM-DD (default: 'today' in the given timezone).",
        default=None,
    )
    p.add_argument(
        "--timezone",
        help="IANA timezone for computing 'today' (default: Europe/London).",
        default=os.getenv("TZ", "Europe/London"),
    )
    p.add_argument(
        "--user",
        help="Limit scheduling to a single user_id (default: all users if supported).",
        default=os.getenv("TEST_USER_ID"),
    )
    p.add_argument(
        "--whitelist",
        help="Comma-separated template IDs to include (others ignored).",
        default=os.getenv("TEMPLATE_WHITELIST"),
    )
    p.add_argument(
        "--dry-run",
        help="Compute but do not write scheduled_tasks.",
        action="store_true",
        default=False,
    )
    p.add_argument(
        "--write",
        help="(deprecated) Ignored. Writes are ON by default unless --dry-run is set.",
        action="store_true",
        default=False,
    )

    p.add_argument(
        "--force",
        help="Bypass the 07:00 run gate (or set ALLOW_BEFORE_7=1).",
        action="store_true",
        default=str(os.getenv("ALLOW_BEFORE_7", "0")).lower() in ("1", "true", "yes", "on"),
    )
    return p.parse_args()


# -----------------------
# Main
# -----------------------
def main() -> int:
    _assert_required_env()  # 🔎 Fail fast if SUPABASE_URL / SERVICE_ROLE_KEY are not set

    # --- CLI / Logging ---
    args = parse_args()

    tz_name = args.timezone or os.getenv("TZ", "Europe/London")
    tz = ZoneInfo(tz_name)

    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO"), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    effective_dry_run = args.dry_run  # 🔁 single source of truth
    logging.info(
        "DayFlow scheduler starting (tz=%s, dry_run=%s, force=%s)",
        tz_name, effective_dry_run, args.force
    )



    # --- 07:00 gate (overridable) ---
    if not args.force and not should_run_now(datetime.now(LONDON)):
        print("[scheduler] Run-gate: before 07:00 Europe/London — exiting. Use --force to bypass.")
        return 0

    # --- Supabase client (service role) ---
    try:
        from supabase import create_client  # type: ignore
    except Exception:
        create_client = None  # type: ignore

    sb: Optional[Any] = None
    url = os.getenv("SUPABASE_URL")
    # Prefer SUPABASE_SERVICE_ROLE_KEY; fall back to legacy SUPABASE_SERVICE_KEY if present
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

    if url and key and create_client:
        try:
            sb = create_client(url, key)
            logging.info("Supabase client created.")
        except Exception as e:
            logging.exception("Supabase client init failed: %s", e)
            return 1
    else:
        logging.info("Supabase URL/key not set (or SDK missing) — running without DB writes.")

    # --- Resolve run date ---
    if args.date:
        if args.date.lower() == "today":
            run_date: date = datetime.now(tz).date()
        else:
            run_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        run_date = datetime.now(tz).date()

    logging.info("Run date = %s (%s local)", run_date, tz_name)

    # --- Whitelist handling ---
    whitelist_ids = None
    if args.whitelist:
        whitelist_ids = set(x.strip() for x in args.whitelist.split(",") if x.strip())
        logging.info("Whitelist active (%d ids).", len(whitelist_ids))

    # --- Orchestration ---
    # 0) FIRST: Carry forward incomplete tasks from the last day the scheduler ran
    #    This must run BEFORE preprocessing so carried tasks go through the scheduler
    if sb is not None:
        carry_forward_incomplete_one_offs(run_date=run_date, supabase=sb)
        # Also carry forward tasks that should have been instantiated on missed days
        carry_forward_missed_days(run_date=run_date, supabase=sb)

    # 1) Expand templates into instances for run_date
    instances = preprocess_recurring_tasks(run_date=run_date, supabase=sb, user_id=args.user)
    count_instances = len(instances) if hasattr(instances, "__len__") else None
    logging.info("Preprocessed %s instance(s).", count_instances if count_instances is not None else "unknown")

    # 1b) NEW: if the user deleted a task today, do NOT re-instantiate it on revise
    if sb is not None:
        today_str = run_date.isoformat()
        q = sb.table("scheduled_tasks").select("template_id, title").eq("local_date", today_str).eq("is_deleted", True)
        # If you're running single-user in dev, also filter by user:
        if args.user:
            q = q.eq("user_id", args.user)
        resp = q.execute()
        deleted_today_ids = {r["template_id"] for r in (resp.data or []) if r.get("template_id")}
        if deleted_today_ids:
            # Log which tasks are being filtered out
            deleted_titles = [r.get("title", "Untitled") for r in (resp.data or []) if r.get("template_id") in deleted_today_ids]
            logging.info("Found %d deleted/skipped task(s) today: %s", len(deleted_today_ids), ", ".join(deleted_titles[:5]))
            before = len(instances) if hasattr(instances, "__len__") else 0
            instances = [it for it in (instances or []) if it.get("template_id") not in deleted_today_ids]
            after = len(instances)
            logging.info("Deleted-today blocklist active: %d template(s) removed (from %d → %d).",
                        len(deleted_today_ids), before, after)
    # 1c) **NEW**: Exclude any instances whose template is soft-deleted (DB truth)
    if sb is not None:
        del_q = sb.table("task_templates").select("id").eq("is_deleted", True)
        # Filter by user to avoid removing tasks from other users with deleted templates
        if args.user:
            del_q = del_q.eq("user_id", args.user)
        del_resp = del_q.execute()
        deleted_template_ids = {r["id"] for r in (del_resp.data or [])}
        if deleted_template_ids:
            before = len(instances) if hasattr(instances, "__len__") else 0
            # handle either key being present in instances
            def _tid(it):
                return it.get("template_id") or it.get("origin_template_id")
            instances = [it for it in (instances or []) if _tid(it) not in deleted_template_ids]
            after = len(instances)
            logging.info("Template-deleted filter: %d template(s) removed (from %d → %d).",
                        len(deleted_template_ids), before, after)

    # 2) Day bounds (08:00–23:00 local by default, or current time if force mode and already past 08:00)
    now_time = datetime.now(LONDON)
    default_start = datetime.combine(run_date, time(8, 0), tzinfo=LONDON)
    
    if args.force and now_time.date() == run_date:
        # Force mode: start from whichever is later - current time or 08:00
        if now_time > default_start:
            day_start = now_time
            logging.info("Force mode: starting schedule from current time %s", day_start.strftime("%H:%M"))
        else:
            day_start = default_start
            logging.info("Force mode: starting schedule from default start time 08:00 (current time %s is earlier)", now_time.strftime("%H:%M"))
    else:
        day_start = default_start
    
    day_end = datetime.combine(run_date, time(23, 0), tzinfo=LONDON)

    # 3) Build DataFrame for the scheduler
    tasks_df = pd.DataFrame(instances or [])
    
    # 3a) **SAFETY**: Filter out appointments/routines without start times to prevent hangs
    if not tasks_df.empty:
        invalid_mask = (
            (tasks_df.get('is_appointment', False) | tasks_df.get('is_routine', False)) & 
            (tasks_df.get('start_time').isna() | (tasks_df.get('start_time') == ''))
        )
        invalid_count = invalid_mask.sum()
        if invalid_count > 0:
            invalid_tasks = tasks_df[invalid_mask][['title', 'template_id']].to_dict('records') if 'title' in tasks_df.columns else []
            logging.warning("⚠️  Found %d appointment(s)/routine(s) WITHOUT start times - SKIPPING to prevent hang:", invalid_count)
            for task in invalid_tasks[:5]:  # Show first 5
                logging.warning("   - '%s' (template: %s)", task.get('title', 'Untitled'), task.get('template_id', 'unknown'))
            tasks_df = tasks_df[~invalid_mask]
            logging.info("Filtered DataFrame now has %d tasks (removed %d invalid)", len(tasks_df), invalid_count)
    
    # 3b) Fetch existing scheduled tasks for today that lack time slots (e.g., carried forward)
    # and add them to tasks_df so they can be scheduled
    if sb is not None and args.user:
        try:
            today_str = run_date.isoformat()
            existing_resp = sb.table("scheduled_tasks").select("*") \
                .eq("user_id", args.user) \
                .eq("local_date", today_str) \
                .is_("start_time", "null") \
                .eq("is_deleted", False) \
                .eq("is_completed", False) \
                .execute()
            
            existing_unscheduled = existing_resp.data or []
            if existing_unscheduled:
                logging.info("Found %d existing unscheduled task(s) for %s - adding to scheduler", 
                           len(existing_unscheduled), today_str)
                
                # Only add tasks that are NOT already in instances (avoid duplicates)
                # Check by template_id
                existing_template_ids = {str(inst.get("template_id")) for inst in instances if inst.get("template_id")}
                new_tasks = [task for task in existing_unscheduled 
                           if str(task.get("template_id")) not in existing_template_ids]
                
                if new_tasks:
                    logging.info("Adding %d unique unscheduled tasks (filtered out %d duplicates)", 
                               len(new_tasks), len(existing_unscheduled) - len(new_tasks))
                    # Convert to DataFrame and append
                    existing_df = pd.DataFrame(new_tasks)
                    if not tasks_df.empty:
                        tasks_df = pd.concat([tasks_df, existing_df], ignore_index=True)
                    else:
                        tasks_df = existing_df
                else:
                    logging.info("All %d unscheduled tasks are already in instances - skipping", 
                               len(existing_unscheduled))
        except Exception as e:
            logging.warning("Failed to fetch existing unscheduled tasks: %s", e)

    # 3c) Check for deferred tasks that should not be scheduled today
    if not effective_dry_run:
        try:
            # Fetch all scheduled tasks for today (including ones with time slots)
            all_today_resp = sb.table("scheduled_tasks") \
                .select("id, template_id, title") \
                .eq("user_id", args.user) \
                .eq("local_date", today_str) \
                .eq("is_completed", False) \
                .eq("is_deleted", False) \
                .execute()
            
            all_today_tasks = all_today_resp.data or []
            if all_today_tasks:
                # Get unique template IDs
                template_ids = {task["template_id"] for task in all_today_tasks if task.get("template_id")}
                
                if template_ids:
                    # Fetch templates to check defer dates
                    templates_resp = sb.table("task_templates") \
                        .select("id, title, date, repeat_unit") \
                        .in_("id", list(template_ids)) \
                        .execute()
                    
                    # Build map of template_id -> defer_date for one-off tasks
                    deferred_templates = {}
                    for tmpl in (templates_resp.data or []):
                        if tmpl.get("repeat_unit") == "none" and tmpl.get("date"):
                            try:
                                defer_date = datetime.fromisoformat(tmpl["date"]).date()
                                if defer_date > run_date:
                                    deferred_templates[tmpl["id"]] = (tmpl.get("title"), defer_date)
                            except Exception:
                                pass
                    
                    # Delete tasks that should be deferred
                    if deferred_templates:
                        tasks_to_delete = [
                            task["id"] for task in all_today_tasks 
                            if task.get("template_id") in deferred_templates
                        ]
                        
                        if tasks_to_delete:
                            for tmpl_id, (title, defer_date) in deferred_templates.items():
                                logging.info("Removing deferred task '%s' from today's schedule (deferred until %s)", 
                                           title, defer_date)
                            
                            sb.table("scheduled_tasks").delete().in_("id", tasks_to_delete).execute()
                            logging.info("Removed %d deferred task(s) from today's schedule", len(tasks_to_delete))
        except Exception as e:
            logging.warning("Failed to check/remove deferred tasks: %s", e)

    # 4) Run the scheduler (this function should be the only writer to scheduled_tasks)
    schedule = schedule_day(
        tasks_df=tasks_df,
        day_start=day_start,
        day_end=day_end,
        supabase=sb,
        user_id=args.user,
        whitelist_template_ids=whitelist_ids,
        dry_run=effective_dry_run,
    )

    count_scheduled = len(schedule) if hasattr(schedule, "__len__") else None
    logging.info("Scheduled %s item(s).", count_scheduled if count_scheduled is not None else "unknown")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logging.exception("Runner crashed")
        sys.exit(1)

