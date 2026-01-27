# dayflow/planner.py
from datetime import date
from typing import Any, Dict, List, Tuple, Optional
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo
# --- helpers to filter payload to existing table columns ---

from typing import Set

from typing import Tuple, Dict as TDict, List as TList
# ... existing imports and helpers ...

def archive_delete_for_user_day(sb, user_id: str, run_date, day_start=None) -> int:
    """
    Deletes scheduled_tasks for a given user and date that are NOT completed and NOT deleted/skipped.
    Preserves ALL completed tasks so they remain in the user's history for "Completed Today" 
    and won't be re-scheduled (they're filtered out during preprocessing).
    Preserves ALL deleted/skipped tasks so the scheduler knows not to re-instantiate them.
    Skip archiving since reschedule can happen multiple times a day causing duplicate key errors.
    """
    # 1) Fetch ids of tasks that are NOT completed AND NOT deleted (we keep completed + skipped tasks)
    resp = sb.table("scheduled_tasks").select("id, title, template_id").eq("user_id", user_id).eq("local_date", str(run_date)).eq("is_completed", False).eq("is_deleted", False).execute()

    ids_to_delete = [row["id"] for row in (resp.data or [])]
    
    if not ids_to_delete:
        logging.info(f"[archive_delete_for_user_day] No incomplete tasks to delete for {run_date}")
        return 0

    # Log what we're about to delete
    logging.info(f"[archive_delete_for_user_day] Deleting {len(ids_to_delete)} task(s) for {run_date}")
    for row in (resp.data or [])[:10]:  # Log first 10
        logging.info(f"  - Deleting: {row.get('title', 'Untitled')} (template: {row.get('template_id', 'None')[:8] if row.get('template_id') else 'None'})")

    # 2) Delete directly without archiving (avoids duplicate key errors on repeated reschedules)
    try:
        result = sb.table("scheduled_tasks").delete().in_("id", ids_to_delete).execute()
        deleted_count = len(ids_to_delete)  # Trust that we deleted all requested IDs
        logging.info(f"[archive_delete_for_user_day] Successfully deleted {deleted_count} task(s) for {run_date}")
    except Exception as e:
        logging.error(f"[archive_delete_for_user_day] Delete failed: {e}")
        raise

    return deleted_count

def _normalize_priority(value):
    """Default to 3 if missing/None/not an int; clamp to 1..5."""
    try:
        p = int(value) if value is not None else 3
    except (TypeError, ValueError):
        p = 3
    if p < 1:
        p = 1
    if p > 5:
        p = 5
    return p

def _dedupe_by_conflict(rows: TList[dict]) -> TList[dict]:
    """Remove duplicates that would share the same (user_id, local_date, template_id)."""
    seen: TDict[Tuple[str,str,str], dict] = {}
    result = []
    dropped = 0
    for r in rows:
        template_id = r.get("template_id")
        # Only deduplicate rows with a valid template_id
        # Rows without template_id (None or empty) are kept as-is
        if not template_id or template_id == "None":
            result.append(r)
            continue
            
        k = (str(r.get("user_id")), str(r.get("local_date")), str(template_id))
        if k in seen:
            dropped += 1
            continue  # keep the first one; drop later duplicates
        seen[k] = r
        result.append(r)
    if dropped:
        logging.info("De-dup: dropped %s duplicate row(s) on (user_id,local_date,template_id)", dropped)
    return result
def _discover_table_columns(supabase, table: str) -> Set[str]:
    """Try to discover existing columns by selecting one row."""
    try:
        resp = supabase.table(table).select("*").limit(1).execute()
        if resp.data and isinstance(resp.data, list) and len(resp.data) > 0:
            return set(resp.data[0].keys())
    except Exception:
        pass
    # fallback: a minimal, safe set you know exists in your schema
    if table == "scheduled_tasks":
        return {
            "id","user_id","template_id","local_date","date",
            "title","start_time","end_time","duration_minutes",
            "is_appointment","is_routine","is_fixed","timezone","tz_id",
            "is_template","is_scheduled","is_completed","is_deleted","repeat_unit","repeat_interval",
            "origin_template_id", "priority",
        }

    return set()

def _filter_instance_to_columns(inst: dict, allowed: Set[str]) -> dict:
    filtered = {k: v for k, v in inst.items() if k in allowed}
    # Optional: log anything we dropped (first time only)
    dropped = set(inst.keys()) - allowed
    if dropped:
        import logging
        logging.info("Dropping unknown columns for scheduled_tasks: %s", ", ".join(sorted(dropped)))
    return filtered

def to_utc_timestamp(local_date_str: str, time_str: str, tz_name: str) -> str:
    # e.g., "2025-10-09" + "09:00:00" in Europe/London -> "2025-10-09T08:00:00+00:00" (UTC)
    dt_local = datetime.fromisoformat(f"{local_date_str}T{time_str}").replace(tzinfo=ZoneInfo(tz_name))
    return dt_local.astimezone(ZoneInfo("UTC")).isoformat()

# --- Tiny data access helpers (Supabase) ---

def get_templates_for_user(supabase: Any, user_id: str) -> List[Dict]:
    """Fetch task_templates for one user. Adjust the selected columns as needed."""
    resp = supabase.table("task_templates").select("*").eq("user_id", user_id).eq("is_deleted", False).execute()
    data = resp.data or []
    logging.info("Fetched %s template(s) for user %s", len(data), user_id)
    return data

def plan_instances_for_today(templates: List[Dict], run_date: date) -> List[Dict]:
    """
    Turn templates into 'instances' for today.
    This is deliberately simple—plug your real recurrence logic here.
    """
    instances: List[Dict] = []
    for t in templates:
        tz_name = os.getenv("TZ", "Europe/London")
        start_clock = t.get("start_time", "09:00:00")  # template’s clock time or default
        instances.append({
            "template_id":       t.get("id"),
            "user_id":           t.get("user_id"),
            "title":             t.get("title", "Untitled task"),
            "local_date":        str(run_date),                # keep wall-date for grouping
            "date":              str(run_date),
            "duration_minutes":  t.get("duration_minutes", 30),
            # IMPORTANT: DB column 'start_time' is TIMESTAMPTZ, so send a UTC timestamp:
            "start_time":        to_utc_timestamp(str(run_date), start_clock, tz_name),
        })

    logging.info("Prepared %s instance(s) for %s", len(instances), run_date)
    return instances

def upsert_scheduled_tasks(supabase, instances):
    """
    Send only the columns our table actually has. Adjust the whitelist if your schema grows.
    """
    if not instances:
        return (0, 0)
    instances = _dedupe_by_conflict(instances)
    # 🚦 Minimal, safe whitelist for your table
    def _clamp_priority(v):
        try:
            n = int(v) if v is not None else 3
        except (TypeError, ValueError):
            n = 3
        if n < 1: return 1
        if n > 5: return 5
        return n
    for r in instances:
        r["priority"] = _clamp_priority(r.get("priority"))
    
    allowed = {
        "id",            # uuid
        "user_id",       # uuid (NOT NULL)
        "template_id",   # uuid (NOT NULL)
        "local_date",    # date (NOT NULL)
        "date",          # date (NOT NULL) -- mirrors local_date for now
        "title",         # text
        "start_time",    # timestamptz (UTC we computed)
        "duration_minutes",  # int
        "priority",
    }

    clean = [{k: v for k, v in inst.items() if k in allowed} for inst in instances]

    # ⚠️ Ensure the conflict target columns are present on every row
    for row in clean:
        missing = [k for k in ("user_id", "local_date", "template_id") if not row.get(k)]
        if missing:
            raise ValueError(f"Missing required upsert keys on row: {missing}")

    resp = supabase.table("scheduled_tasks") \
        .upsert(clean, on_conflict="user_id,local_date,template_id") \
        .execute()

    upserted = len(resp.data or [])
    logging.info("Upserted %s scheduled task(s)", upserted)
    return (upserted, 0)


# --- Your two top-level functions (call these from the runner) ---

# ---------------------------------------------------------------------------
# this function reads through the tasks_df dataframe
# selects the template (that is, recurring) tasks
# and instantiates, if needed, the tasks for today
# the function also has access to the schedule already built today or on a previous day, as updated in the streamlit gui
# tasks will be deleted from or re-introduced to the new schedule from the old one under certain conditions (see below)
# NB that a completely new schedule is created each time planning is run.
#
# if this code is being run for a second time on the same day
# for one-off tasks
#     if Done or Deleted in the GUI they will have been deleted from tasks.json there, so are not of concern here.
#       (the intention in future is that Done tasks will be transferred from the old to the new schedule
#       and then be listed again in the Done section of the GUI)
#     if Deferred or unmarked in the GUI they will be transferred from the old to the new schedule
# for recurring tasks (ie being processed here as a template)
#     if Done in the GUI they will not be re-instantiated
#       (the intention in future is that Done tasks will survive to be listed again in the Done section)
#     if Deleted in the GUI it is assumed that all instances are to be deleted
#       and they will be deleted from tasks.json there
#     if Daily and Deferred or unmarked in the GUI they will be left in tasks.json to be instantiated here.
#     if Daily but with an interval of greater than 1, or weekly or monthly
#         AND Deferred or unmarked they must be reintroduced into the new schedule from the old one
#         as it will not be automatically rescheduled
#
# if this code is being run on a second or subsequent day
# for one-off tasks
#     if Done or Deleted in the GUI they will be deleted from tasks.json there, so are not of concern here
#     if Deferred or unmarked in the GUI they will be transferred from the old to the new schedule
# for recurring tasks (ie being processed here as a template)
#     if Done in the GUI they will instantiated here as usual
#     if Deleted in the GUI it is assumed that all instances are to be deleted
#       and they will be deleted from tasks.json there, so are not of concern here.
#     if Daily and Deferred or unmarked in the GUI they will be instantiated here as normal
#     if Daily but with an interval of greater than 1, or weekly or monthly
#         AND Deferred or unmarked they will be transferred to the new schedule from the old one
#         as it will not be automatically instantiated
# ---------------------------------------------------------------------------

import os, uuid, logging
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from typing import Any, Dict, List
import pandas as pd

LOCAL_TIMEZONE = ZoneInfo(os.getenv("TZ", "Europe/London"))
UTC_TIMEZONE   = ZoneInfo("UTC")

def to_utc_timestamp(local_date_str: str, time_str: str, tz_name: str) -> str:
    # e.g., "2025-10-09" + "09:00:00" in Europe/London -> "2025-10-09T08:00:00+00:00" (UTC summer)
    dt_local = datetime.fromisoformat(f"{local_date_str}T{time_str}").replace(tzinfo=ZoneInfo(tz_name))
    return dt_local.astimezone(UTC_TIMEZONE).isoformat()

def _fetch_templates_df(supabase: Any, user_id: str) -> pd.DataFrame:
    resp = supabase.table("task_templates").select("*").eq("user_id", user_id).eq("is_deleted", False).execute()
    df = pd.DataFrame(resp.data or [])
    # 🔎 Debug: show how many templates we actually got and a small preview
    try:
        logging.info("templates: fetched %d row(s) for user_id=%s", len(df), user_id)
        logging.info("templates: columns=%s", list(df.columns))
        if len(df) > 0:
            preview_cols = [
                "id", "title", "task",
                "repeat_unit", "repeat", "repeat_interval",
                "repeat_day", "repeat_days",
                "start_time", "duration_minutes",
                "is_appointment", "is_fixed", "is_routine",
                "timezone", "last_completed_date", "date",
            ]
            present = [c for c in preview_cols if c in df.columns]
            logging.info(
                "templates: preview (up to 5)=%s",
                df[present].head(5).to_dict(orient="records")
            )
    except Exception:
        logging.exception("templates: debug logging failed")
    return df



def _fetch_old_schedule_df(supabase: Any, user_id: str, today: pd.Timestamp) -> pd.DataFrame:
    """
    Pull yesterday + today from scheduled_tasks (good enough to model your 'old' schedule rules).
    If you want a longer lookback later, widen the range.
    """
    today_str = today.date().isoformat()
    yday_str  = (today - pd.Timedelta(days=1)).date().isoformat()
    # Pull rows for yesterday and today (plus any others if you prefer)
    resp = supabase.table("scheduled_tasks").select("*").eq("user_id", user_id) \
        .in_("local_date", [yday_str, today_str]).execute()
    logging.info("Fetched %d rows from scheduled_tasks for dates %s, %s", len(resp.data or []), yday_str, today_str)
    df = pd.DataFrame(resp.data or [])
    if not df.empty and 'title' in df.columns:
        logging.info("Fetched titles: %s", df['title'].tolist()[:10])

    # Ensure expected columns exist
    for col, default in [
        ("is_template", False),
        ("is_completed", False),
        ("is_deleted", False),
        ("repeat_unit", None),
        ("repeat_interval", 1),
        ("repeat_day", None),
        ("origin_template_id", None),
        ("template_id", None),
        ("date", today.date()),  # your table also has NOT NULL "date"
    ]:
        if col not in df.columns:
            df[col] = default
    return df
def _is_due_today(
    *,
    repeat_unit: str | None,
    repeat_interval: int,
    repeat_day_int: int | None,
    repeat_days_list: list | None,
    today: pd.Timestamp,
    reference_date: pd.Timestamp,
) -> tuple[bool, str]:
    """
    Decide if a template instance is due today.
    Returns (is_due, reason).
    - repeat_unit: 'daily' | 'weekly' | 'monthly' | 'annual' | 'yearly' | None
    - repeat_interval: >=1
    - repeat_day_int: single day for weekly (Mon=0..Sun=6) or monthly (day of month)
    - repeat_days_list: list of weekdays for weekly (Mon=0..Sun=6)
    - today/reference_date are tz-aware pandas Timestamps (LOCAL_TIMEZONE)
    """
    if not repeat_unit:
        return (False, "no repeat_unit")

    ru = str(repeat_unit).strip().lower()
    if ru == "none":
    # one-off: due today iff reference_date == today (both are tz-aware Timestamps)
        if today.date() == reference_date.date():
            return (True, "one-off today")
        return (False, f"one-off not today (date={reference_date.date()}, today={today.date()})")

    if ru == "daily":
        # Daily tasks should only appear on or after their reference date
        # This prevents tasks with future reference dates from appearing prematurely
        # E.g., a daily task with date=2026-07-01 should not appear until July 1, 2026
        if today.date() < reference_date.date():
            return (False, f"daily task not yet active (starts {reference_date.date()})")
        # Check interval: every N days since reference_date
        days_since = (today - reference_date).days
        if days_since % max(1, int(repeat_interval or 1)) != 0:
            return (False, f"daily not due today (days_since={days_since}, interval={repeat_interval})")
        return (True, f"daily (days_since={days_since}, interval={repeat_interval})")

    if ru == "weekly":
        weeks_since = (today - reference_date).days // 7
        if weeks_since % max(1, int(repeat_interval or 1)) != 0:
            return (False, f"weekly not due this week (weeks_since={weeks_since}, interval={repeat_interval})")

        dow = int(today.dayofweek)
        if isinstance(repeat_days_list, list) and len(repeat_days_list) > 0:
            days = [int(x) for x in repeat_days_list if x is not None]
            if dow in days:
                return (True, f"weekly (weeks_since={weeks_since}, interval={repeat_interval}, dow={dow}, days={days})")
            return (False, f"weekly not due today (dow={dow}, days={days})")

        if repeat_day_int is not None:
            if dow == int(repeat_day_int):
                return (True, f"weekly (weeks_since={weeks_since}, interval={repeat_interval}, dow={dow}, day={repeat_day_int})")
            return (False, f"weekly not due today (dow={dow}, day={repeat_day_int})")

        # No specific day given: due any day in a due week
        return (True, f"weekly (weeks_since={weeks_since}, interval={repeat_interval}, any-day)")

    if ru == "monthly":
        months_since = (today.year - reference_date.year) * 12 + (today.month - reference_date.month)
        if months_since % max(1, int(repeat_interval or 1)) != 0:
            return (False, f"monthly not due this month (months_since={months_since}, interval={repeat_interval})")
        # day-of-month check (if provided)
        if repeat_day_int is None or today.day == int(repeat_day_int):
            return (True, f"monthly (months_since={months_since}, interval={repeat_interval}, day={repeat_day_int})")
        return (False, f"monthly not due today (day={today.day}, needed={repeat_day_int})")

    if ru == "annual" or ru == "yearly":
        years_since = today.year - reference_date.year
        if years_since % max(1, int(repeat_interval or 1)) != 0:
            return (False, f"annual not due this year (years_since={years_since}, interval={repeat_interval})")
        # month and day check (must match reference date)
        if today.month == reference_date.month and today.day == reference_date.day:
            return (True, f"annual (years_since={years_since}, interval={repeat_interval}, date={reference_date.month}/{reference_date.day})")
        return (False, f"annual not due today (today={today.month}/{today.day}, needed={reference_date.month}/{reference_date.day})")

    return (False, f"unsupported repeat_unit={ru}")
def _name_for_log(row_or_task) -> str:
    """Prefer 'task', then 'title', else a stable fallback."""
    try:
        get = row_or_task.get  # dict-like
    except AttributeError:
        # pandas Series
        get = row_or_task.__getitem__
    name = (get("task") or get("title") or "").strip()
    return name if name else f"Template {get('id') or get('template_id') or 'unknown'}"

def preprocess_recurring_tasks(run_date: date, supabase: Any, user_id: Optional[str] = None) -> List[Dict]:
    """
    Adapter version of your original function:
    - loads templates + "old schedule" from Supabase
    - follows your rules to decide what to instantiate / carry forward
    - returns a list of instance dicts for upsert into scheduled_tasks

    NOTE: If user_id not provided, falls back to TEST_USER_ID environment variable.
    """
    if not user_id:
        user_id = os.getenv("TEST_USER_ID")
    if not user_id:
        logging.warning("No user_id provided and TEST_USER_ID not set; nothing to do.")
        return []

    # create the Timestamp for today (local midnight)
    today = pd.Timestamp(run_date, tz=LOCAL_TIMEZONE).normalize()
    # instantiation debug collector
    instantiation_events: List[Dict[str, Any]] = []
    # skip debug collector
    skip_events: List[Dict[str, Any]] = []


    # tasks_df == templates from Supabase
    tasks_df = _fetch_templates_df(supabase, user_id)
    if tasks_df.empty:
        logging.info("No templates found for user %s", user_id)
        return []

    # old_schedule_df == prior instances from Supabase (yesterday + today)
    old_schedule_df = _fetch_old_schedule_df(supabase, user_id, today)
    if not old_schedule_df.empty:
        logging.info("Old schedule preview: %s", old_schedule_df[['title', 'is_completed', 'date']].head().to_dict('records') if 'title' in old_schedule_df.columns else "no title column")
    # ---- Make both DataFrames resilient to missing columns ----
    def _ensure_cols(df: pd.DataFrame, defaults: dict):
        for col, default in defaults.items():
            if col not in df.columns:
                df[col] = default
        return df

    # Expected baseline columns (adjust defaults as you prefer)
    tasks_df = _ensure_cols(tasks_df, {
        "id": None,
        "task": None,                 # some schemas use 'task', others 'title'
        "title": None,
        "repeat_unit": None,          # canonical field we’ll read
        "repeat": None,               # legacy/alternate field we can fall back to
        "repeat_interval": 1,
        "repeat_day": None,
        "start_time": "09:00:00",
        "duration_minutes": 30,
        "last_completed_date": None,
        "is_template": True,          # task_templates are templates by definition
        "date": None,
        "priority": 3,
        "window_start_local": None,
        "window_end_local": None,
    })

    old_schedule_df = _ensure_cols(old_schedule_df, {
        "id": None,
        "task": None,
        "title": None,
        "origin_template_id": None,
        "date": pd.Timestamp(run_date, tz=LOCAL_TIMEZONE).date(),
        "local_date": pd.Timestamp(run_date, tz=LOCAL_TIMEZONE).date(),
        "is_template": False,
        "is_completed": False,
        "is_deleted": False,
        "repeat_unit": None,
        "repeat_interval": 1,
        "repeat_day": None,
        "priority": 3,
    })

    # --- Normalize and clamp priority (1..5, default 3) ---
    def _normalize_priority_series(s):
        s = s.fillna(3)
        # coerce to numeric then clamp
        s = pd.to_numeric(s, errors="coerce").fillna(3).astype("int16")
        s = s.clip(lower=1, upper=5)
        return s
    # ---- Normalize repeat fields safely ----
    # Prefer repeat_unit; if missing, backfill from repeat (if present)
    if "repeat" in tasks_df.columns:
        tasks_df["repeat_unit"] = tasks_df["repeat_unit"].where(
            tasks_df["repeat_unit"].notna(), tasks_df["repeat"]
        )
    if "repeat" in old_schedule_df.columns:
        old_schedule_df["repeat_unit"] = old_schedule_df["repeat_unit"].where(
            old_schedule_df["repeat_unit"].notna(), old_schedule_df["repeat"]
        )

    # Ensure booleans are bools
    old_schedule_df["is_template"]  = old_schedule_df["is_template"].fillna(False).astype(bool)
    old_schedule_df["is_completed"] = old_schedule_df["is_completed"].fillna(False).astype(bool)
    old_schedule_df["is_deleted"]   = old_schedule_df["is_deleted"].fillna(False).astype(bool)

    # --- Block one-off templates that were already used on a different day ---
    # We allow same-day rebuilds: exclude only if the template appears in live/archive
    # with local_date <> today.
    try:
        today_str = str(today.date())

        # Fetch tasks used on other days with their completion and deletion status
        used_live = supabase.table("scheduled_tasks") \
            .select("template_id, local_date, is_completed, is_deleted") \
            .eq("user_id", user_id) \
            .neq("local_date", today_str) \
            .execute()
        used_arch = supabase.table("scheduled_tasks_archive") \
            .select("template_id, local_date, is_completed, is_deleted") \
            .eq("user_id", user_id) \
            .neq("local_date", today_str) \
            .execute()

        # Build set of templates that were COMPLETED on other days
        completed_other_ids = {row["template_id"] 
                               for row in (used_live.data or []) + (used_arch.data or [])
                               if row.get("template_id") and row.get("is_completed")}
        
        # Build set of templates that were USED (not deleted) on other days
        used_not_deleted_ids = {row["template_id"]
                                for row in (used_live.data or []) + (used_arch.data or [])
                                if row.get("template_id") and not row.get("is_deleted")}

        # Normalize types for comparison
        tasks_df["id"] = tasks_df["id"].astype(str)
        one_off_mask = tasks_df["repeat_unit"].astype(str).str.lower().eq("none")
        
        # Block if: one-off AND (completed elsewhere OR has date field != today OR used without date field)
        completed_mask = tasks_df["id"].isin(completed_other_ids)
        used_not_deleted_mask = tasks_df["id"].isin(used_not_deleted_ids)
        
        # Check if task has a date field
        if "date" in tasks_df.columns:
            has_date_mask = tasks_df["date"].notna()
            date_is_today_mask = tasks_df["date"].astype(str) == today_str
            date_not_today_mask = has_date_mask & ~date_is_today_mask
            no_date_mask = ~has_date_mask
        else:
            date_not_today_mask = pd.Series([False] * len(tasks_df), index=tasks_df.index)
            no_date_mask = pd.Series([True] * len(tasks_df), index=tasks_df.index)

        # Block logic:
        # 1. If completed elsewhere: always block
        # 2. If has date field != today: block
        # 3. If no date field AND used (not deleted) elsewhere: block (prevents re-scheduling one-offs)
        blocked = one_off_mask & (
            completed_mask | 
            date_not_today_mask | 
            (no_date_mask & used_not_deleted_mask)
        )

        # Log the exact one-offs we're about to block
        if blocked.sum() > 0:
            to_block_cols = ["id", "title", "repeat_unit"]
            if "date" in tasks_df.columns:
                to_block_cols.append("date")
            to_block = tasks_df.loc[blocked, to_block_cols].copy()
            if not to_block.empty:
                logging.info("One-off block list (id, title, date, reason):")
                for _, r in to_block.iterrows():
                    if r["id"] in completed_other_ids:
                        reason = "completed_elsewhere"
                    elif r.get("date") and str(r["date"]) != today_str:
                        reason = "wrong_date"
                    else:
                        reason = "used_elsewhere"
                    logging.info("  - %s: %s (date=%s, reason=%s)", r["id"], r["title"], r.get("date"), reason)
        
        blocked_count = int(blocked.sum())
        if blocked_count:
            logging.info("Excluding %d one-off template(s) (completed, wrong date, or already used elsewhere)", blocked_count)
            tasks_df = tasks_df.loc[~blocked].copy()
    except Exception:
        logging.exception("Failed to exclude reused one-off templates; proceeding without this guard")


    # remove duplicates by origin_template_id + date (precautionary)
    # BUT only deduplicate rows that actually HAVE an origin_template_id (not NULL)
    if "origin_template_id" in old_schedule_df.columns and "date" in old_schedule_df.columns:
        before_dedup = len(old_schedule_df)
        # Only deduplicate rows where origin_template_id is not null
        has_origin = old_schedule_df["origin_template_id"].notna()
        if has_origin.any():
            rows_with_origin = old_schedule_df[has_origin].copy()
            rows_without_origin = old_schedule_df[~has_origin].copy()
            
            # Deduplicate only the rows with origin_template_id
            rows_with_origin = rows_with_origin.sort_values(rows_with_origin.columns[0]).drop_duplicates(subset=["origin_template_id", "date"], keep="first")
            
            # Recombine
            old_schedule_df = pd.concat([rows_with_origin, rows_without_origin], ignore_index=True)
        
        after_dedup = len(old_schedule_df)
        if before_dedup != after_dedup:
            logging.info("Dropped %d duplicate rows by origin_template_id+date (kept only first of each)", before_dedup - after_dedup)

    # normalize repeat_unit from legacy 'repeat' field
    if "repeat" in tasks_df.columns:
        tasks_df["repeat_unit"] = tasks_df["repeat_unit"].combine_first(tasks_df["repeat"])
    if "repeat" in old_schedule_df.columns:
        old_schedule_df["repeat_unit"] = old_schedule_df["repeat_unit"].combine_first(old_schedule_df["repeat"])
    old_schedule_df["is_template"] = old_schedule_df["is_template"].fillna(False).astype(bool)

    # establish an empty list for tasks to be generated in this function
    generated_tasks: List[Dict] = []

    # build list of template IDs that have already been completed today
    # Use template_id (primary field) and fallback to origin_template_id
    logging.info("Old schedule shape: %s, checking for completed tasks today (%s)", old_schedule_df.shape, today.date())
    
    # Debug: show completed status
    if not old_schedule_df.empty and 'is_completed' in old_schedule_df.columns:
        completed_count = old_schedule_df['is_completed'].fillna(False).astype(bool).sum()
        logging.info("Old schedule has %d tasks marked as completed (any date)", completed_count)
    
    completed_today_mask = (
        (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
        (old_schedule_df["is_completed"].fillna(False).astype(bool)) &
        (pd.to_datetime(old_schedule_df["local_date"]).dt.date == today.date())
    )
    logging.info("Found %d completed tasks specifically today in old_schedule_df", completed_today_mask.sum())
    
    completed_today_template_ids = set()
    if completed_today_mask.any():
        # Try template_id first (primary field in scheduled_tasks)
        if "template_id" in old_schedule_df.columns:
            completed_today_template_ids.update(
                old_schedule_df[completed_today_mask]["template_id"].dropna().astype(str).unique()
            )
        # Also check origin_template_id as fallback
        if "origin_template_id" in old_schedule_df.columns:
            completed_today_template_ids.update(
                old_schedule_df[completed_today_mask]["origin_template_id"].dropna().astype(str).unique()
            )
    
    completed_today_template_ids = list(completed_today_template_ids)
    
    if completed_today_template_ids:
        logging.info("Completed today template IDs: %s", completed_today_template_ids)

    # filter out any templates from tasks_df that match those IDs
    if not tasks_df.empty and completed_today_template_ids:
        before_count = len(tasks_df)
        tasks_df = tasks_df[~tasks_df["id"].astype(str).isin(completed_today_template_ids)]
        after_count = len(tasks_df)
        if before_count != after_count:
            logging.info("Filtered out %d completed template(s) from today's schedule", before_count - after_count)

        # patch origin_template_id for completed tasks missing it (name-based)
    if not tasks_df.empty and not old_schedule_df.empty:
        # Ensure both name columns exist
        if "task" not in tasks_df.columns:
            tasks_df["task"] = None
        if "task" not in old_schedule_df.columns:
            old_schedule_df["task"] = None
        if "title" not in tasks_df.columns:
            tasks_df["title"] = None
        if "title" not in old_schedule_df.columns:
            old_schedule_df["title"] = None

        # Build a normalized name for matching: prefer 'task', then 'title'
        def _norm(s):
            return (str(s).strip().lower()) if s is not None else ""

        old_schedule_df["_norm_name"] = old_schedule_df["task"].apply(_norm)
        # Fallback to title where task is empty
        empty_mask = old_schedule_df["_norm_name"] == ""
        old_schedule_df.loc[empty_mask, "_norm_name"] = old_schedule_df.loc[empty_mask, "title"].apply(_norm)

        for _, template_task in tasks_df[tasks_df.get("is_template", True)].iterrows():
            template_id = str(template_task.get("id"))
            # prefer task, then title
            name_raw = template_task.get("task")
            if not name_raw:
                name_raw = template_task.get("title")
            task_name = _norm(name_raw)

            if not task_name:
                # no usable name; skip quietly
                continue

            mask = (
                (old_schedule_df["_norm_name"] == task_name)
            ) & (
                old_schedule_df["origin_template_id"].isna() |
                (old_schedule_df["origin_template_id"].astype(str) != template_id)
            ) & (
                ~old_schedule_df["is_template"].fillna(False).astype(bool)
            )

            if mask.any():
                logging.info("Patching origin_template_id for completed task '%s'", name_raw)
                old_schedule_df.loc[mask, "origin_template_id"] = template_id

        # cleanup helper column
        old_schedule_df.drop(columns=["_norm_name"], inplace=True, errors="ignore")


    # this long code block generates one-off instances of tasks from template tasks
    for _, task in tasks_df.iterrows():

        # test for needed fields — normalize repeat_unit ('none'/'null' treated as missing), then fallback to 'repeat'
        ru_primary  = str(task.get("repeat_unit") or "").strip().lower()
        ru_fallback = str(task.get("repeat") or "").strip().lower()
        ru = ru_primary if ru_primary else (ru_fallback if ru_fallback else None)  # keep 'none' if set
        repeat_unit = ru
        if repeat_unit is None or repeat_unit == "":
            skip_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "reason": "no repeat_unit/repeat"
            })
            continue



        # check if this template has already been marked as completed today
        last_done = task.get("last_completed_date")
        if pd.notna(last_done):
            try:
                last_done_date = pd.to_datetime(last_done).date()
                if last_done_date == today.date():
                    logging.info("skipping '%s' — already marked completed today", task.get("task"))
                    skip_events.append({
                        "template_id": str(task.get("id")),
                        "title": task.get("task") or task.get("title"),
                        "reason": "already completed today"
                    })
                    continue  # Skip instantiation
            except Exception as e:
                logging.info("error parsing last_completed_date for task '%s': %s", task.get("task"), e)

        # we now work with task timing
        # if not present set defaults of 09:00 start time and 30 mins duration
        raw_start_time = task.get("start_time")
        if isinstance(raw_start_time, pd.Timestamp):
            task_time_str = raw_start_time.strftime("%H:%M:%S")
        elif isinstance(raw_start_time, str) and raw_start_time.strip():
            # normalise to HH:MM:SS if needed
            tt = raw_start_time.strip()
            task_time_str = tt if len(tt.split(":")) == 3 else (tt + ":00" if len(tt.split(":")) == 2 else "09:00:00")
        else:
            task_time_str = "09:00:00"

        try:
            duration_minutes = int(task.get("duration_minutes", 30) or 30)
        except Exception:
            duration_minutes = 30

        # establish, test and manipulate the timing (UTC instant for DB)
        try:
            start_time_local = pd.Timestamp(f"{today.date()} {task_time_str}", tz=LOCAL_TIMEZONE)
            start_time_utc = start_time_local.astimezone(UTC_TIMEZONE)
            end_time_utc = start_time_utc + timedelta(minutes=duration_minutes)
        except Exception as e:
            logging.info("Error parsing start time for task '%s': %s", task.get("task", "Unnamed Task"), e)
            skip_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "reason": f"invalid start time ({task.get('start_time')})"
            })
            continue

                # Choose correct “day” field based on repeat_unit:
        # - monthly: prefer day_of_month, then fallback to repeat_day
        # - weekly/daily: repeat_day handled separately (weekly) or unused (daily)
        day_of_month = task.get("day_of_month")
        repeat_day_field = task.get("repeat_day")
        repeat_day_int = None
        if repeat_unit == "monthly":
            if pd.notna(day_of_month):
                try:
                    repeat_day_int = int(day_of_month)
                except Exception:
                    repeat_day_int = None
            elif pd.notna(repeat_day_field):
                try:
                    repeat_day_int = int(repeat_day_field)
                except Exception:
                    repeat_day_int = None
        else:
            if pd.notna(repeat_day_field):
                try:
                    repeat_day_int = int(repeat_day_field)
                except Exception:
                    repeat_day_int = None

        repeat_interval = int(task.get("repeat_interval", 1) or 1)

        date_raw = task.get("date")
        # For recurring monthly tasks with interval > 1 and no specific date, 
        # use last_completed_date if available to calculate proper intervals
        if pd.isna(date_raw) and repeat_unit == "monthly" and repeat_interval > 1:
            last_completed = task.get("last_completed_date")
            if pd.notna(last_completed):
                date_raw = last_completed
            else:
                # No completion history - for monthly tasks with day_of_month,
                # use the most recent occurrence of that day BEFORE today as reference
                day_of_month_val = task.get("day_of_month")
                if pd.notna(day_of_month_val):
                    try:
                        target_day = int(day_of_month_val)
                        # Find the most recent occurrence of this day
                        if today.day >= target_day:
                            # This month's occurrence has passed or is today
                            ref_month = today.month
                            ref_year = today.year
                        else:
                            # This month's occurrence hasn't happened yet, use last month
                            ref_month = today.month - 1 if today.month > 1 else 12
                            ref_year = today.year if today.month > 1 else today.year - 1
                        
                        # Create reference date for that day
                        import calendar
                        max_day = calendar.monthrange(ref_year, ref_month)[1]
                        actual_day = min(target_day, max_day)
                        date_raw = f"{ref_year}-{ref_month:02d}-{actual_day:02d}"
                    except Exception:
                        pass
        
        reference_date = today if pd.isna(date_raw) else pd.to_datetime(date_raw, errors='coerce')
        reason = None  # will capture why we decided to instantiate

        if pd.isna(reference_date):
            reference_date = today
        if reference_date.tzinfo is None:
            reference_date = reference_date.tz_localize(LOCAL_TIMEZONE)
        else:
            reference_date = reference_date.tz_convert(LOCAL_TIMEZONE)
        
        # DEBUG: Log reference date check for daily tasks
        if repeat_unit == "daily":
            logging.info(
                "Daily task '%s': today=%s, ref=%s, check=%s < %s = %s",
                task.get("task") or task.get("title"),
                today.date(),
                reference_date.date(),
                today.date(),
                reference_date.date(),
                today.date() < reference_date.date()
            )
        
        if today.date() < reference_date.date():
            skip_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "reason": f"reference_date in future ({reference_date.date()})"
            })
            continue

        # Check defer date for one-off tasks
        if repeat_unit == "none":
            defer_date_raw = task.get("date")
            if pd.notna(defer_date_raw):
                try:
                    defer_date = pd.to_datetime(defer_date_raw).date()
                    if defer_date > today.date():
                        skip_events.append({
                            "template_id": str(task.get("id")),
                            "title": task.get("task") or task.get("title"),
                            "reason": f"deferred until {defer_date}"
                        })
                        logging.info("Skipping one-off '%s' - deferred until %s", task.get("task") or task.get("title"), defer_date)
                        continue
                except Exception as e:
                    logging.debug("Could not parse defer date for '%s': %s", task.get("task") or task.get("title"), e)

        # Decide due-ness using centralized helper
        repeat_days_list = task.get("repeat_days") if isinstance(task.get("repeat_days"), list) else None
        add_task, reason = _is_due_today(
            repeat_unit=repeat_unit,
            repeat_interval=repeat_interval,
            repeat_day_int=repeat_day_int,
            repeat_days_list=repeat_days_list,
            today=today,
            reference_date=reference_date,
        )

        if not add_task:
            # record skip reason for diagnostics
            skip_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "reason": reason,
            })
            continue

        # skip if already instantiated (including deleted/skipped tasks)
        if not old_schedule_df.empty:
            # Match by origin_template_id or template_id (both fields may be present)
            task_id = str(task.get("id"))
            
            # Safety check: ensure columns exist
            if "template_id" not in old_schedule_df.columns:
                old_schedule_df["template_id"] = None
            if "origin_template_id" not in old_schedule_df.columns:
                old_schedule_df["origin_template_id"] = None
            
            template_match = (
                (old_schedule_df["origin_template_id"].astype(str) == task_id) |
                (old_schedule_df["template_id"].astype(str) == task_id)
            )
            
            already_instantiated = old_schedule_df[
                template_match &
                (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
                (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
                (~old_schedule_df["is_completed"].fillna(False).astype(bool))
            ]
            if not already_instantiated.empty:
                # Check if it's deleted/skipped
                is_deleted = already_instantiated["is_deleted"].fillna(False).astype(bool).any()
                reason = "already instantiated today (skipped)" if is_deleted else "already instantiated today (active)"
                logging.info("Skipping duplicate instantiation of '%s' (template_id=%s) - %s", 
                           _name_for_log(task), task_id, reason)
                skip_events.append({
                    "template_id": str(task.get("id")),
                    "title": task.get("task") or task.get("title"),
                    "reason": reason,
                })
                continue


        # instantiate task (shape matches scheduled_tasks upsert we use)
        # Derive flags from template (prefer explicit flags; fall back to kind)
        tmpl_kind = (str(task.get("kind") or "")).strip().lower()
        tmpl_is_appt = bool(task.get("is_appointment") or tmpl_kind == "appointment")
        tmpl_is_routine = bool(task.get("is_routine") or tmpl_kind == "routine")

        # CRITICAL: Ensure template_id is valid (not None/NaN)
        template_id = task.get("id")
        if not template_id or (isinstance(template_id, float) and pd.isna(template_id)):
            logging.warning(f"Skipping instantiation of '{_name_for_log(task)}' - missing template id")
            skip_events.append({
                "template_id": "MISSING",
                "title": task.get("task") or task.get("title"),
                "reason": "template has no id field",
            })
            continue

        # If this template is 'floating' (one-off OR repeating), DO NOT set start/end now.
        # Let the floating scheduler place it within gaps (and respect window if present).
        if tmpl_kind == "floating":
            new_task: Dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "user_id": str(user_id),
                "template_id": str(template_id),
                "origin_template_id": str(template_id),
                "title": task.get("task") or task.get("title") or "Untitled task",
                "local_date": str(today.date()),
                "date": str(today.date()),
                "start_time": None,
                "end_time": None,
                "duration_minutes": duration_minutes,
                "is_template": False,
                "is_scheduled": False,
                "is_completed": False,
                "is_deleted": False,
                "is_routine": False,
                "is_appointment": False,
                "is_reschedulable": True,
                "is_fixed": False,
                "is_floating": True,
                "repeat_unit": repeat_unit,
                "tz_id": os.getenv("TZ", "Europe/London"),
                "kind": "floating",
                "priority": _normalize_priority(task.get("priority")),
                # keep the window for the floating placer
                "window_start_local": task.get("window_start_local"),
                "window_end_local": task.get("window_end_local"),
            }
        else:
            tmpl_is_fixed = bool(task.get("is_fixed") or tmpl_is_appt)
            new_task: Dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "user_id": str(user_id),
                "template_id": str(template_id),
                "origin_template_id": str(template_id),
                "title": task.get("task") or task.get("title") or "Untitled task",
                "local_date": str(today.date()),
                "date": str(today.date()),
                "start_time": start_time_utc.isoformat(),
                "end_time": end_time_utc.isoformat(),
                "duration_minutes": duration_minutes,
                "is_template": False,
                "is_scheduled": True,
                "is_completed": False,
                "is_deleted": False,
                "is_routine": tmpl_is_routine,
                "is_appointment": tmpl_is_appt,
                "is_reschedulable": True,
                "is_fixed": tmpl_is_fixed,
                "repeat_unit": repeat_unit,
                "tz_id": os.getenv("TZ", "Europe/London"),
                "kind": tmpl_kind or None,
                "priority": _normalize_priority(task.get("priority")),
            }


        generated_tasks.append(new_task)

        # instantiation report entry
        try:
            instantiation_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "repeat_unit": repeat_unit,
                "repeat_interval": repeat_interval,
                "repeat_day": repeat_day_int,
                "repeat_days": repeat_days_list,
                "reference_date": str(reference_date.date()),
                "today": str(today.date()),
                "start_local": start_time_local.isoformat(),
                "start_utc": start_time_utc.isoformat(),
                "duration_min": duration_minutes,
                "reason": reason or "unspecified",
            })
        except Exception:
            logging.exception("instantiation_report: failed to append event")

            try:
                instantiation_events.append({
                    "template_id": str(task.get("id")),
                    "title": task.get("task") or task.get("title"),
                    "repeat_unit": repeat_unit,
                    "repeat_interval": repeat_interval,
                    "repeat_day": repeat_day_int,
                    "repeat_days": task.get("repeat_days"),
                    "reference_date": str(reference_date.date()),
                    "today": str(today.date()),
                    "start_local": start_time_local.isoformat(),
                    "start_utc": start_time_utc.isoformat(),
                    "duration_min": duration_minutes,
                    "reason": reason or "unspecified",
                })
            except Exception:
                logging.exception("instantiation_report: failed to append event")
        # instantiation report
    if instantiation_events:
        logging.info("Instantiation report (%d): %s", len(instantiation_events), instantiation_events)
    else:
        logging.info("Instantiation report: none")
    # skip report (group by reason for readability)
    if skip_events:
        # simple grouping
        summary = {}
        for e in skip_events:
            summary.setdefault(e["reason"], 0)
            summary[e["reason"]] += 1
        logging.info("Skip report (%d): %s", len(skip_events), skip_events)
        logging.info("Skip summary: %s", summary)
    else:
        logging.info("Skip report: none")
    # --- carry-forward logic (previous day) ---
    carry_forward_tasks: List[Dict] = []
    if not old_schedule_df.empty:
        last_run_date = pd.to_datetime(old_schedule_df["date"]).dt.date.max()
        if last_run_date and last_run_date < today.date():
            for _, row in old_schedule_df.iterrows():
                if not row.get("is_completed", False) and not row.get("is_deleted", False):
                    repeat_unit = row.get("repeat_unit")
                    repeat_interval = int(row.get("repeat_interval") or 1)
                    if (repeat_unit == "daily" and repeat_interval > 1) or repeat_unit in ["weekly", "monthly"]:
                        # skip if the same task was already regenerated this run
                        if row.get("origin_template_id") in [t.get("origin_template_id") for t in generated_tasks]:
                            continue
                        
                        # For monthly/weekly tasks, verify they're actually due today before carrying forward
                        if repeat_unit in ["weekly", "monthly"]:
                            ref_date_str = row.get("date")
                            if ref_date_str:
                                try:
                                    ref_date = pd.to_datetime(ref_date_str).date()
                                    repeat_day = row.get("repeat_day")
                                    day_of_month = row.get("day_of_month")
                                    repeat_days = row.get("repeat_days")
                                    
                                    if repeat_unit == "monthly":
                                        months_since = (today.year - ref_date.year) * 12 + (today.month - ref_date.month)
                                        if months_since % max(1, repeat_interval) != 0:
                                            print(f"[carry-forward] Skipping '{row.get('title')}': not due this month (months_since={months_since}, interval={repeat_interval})")
                                            continue
                                        repeat_day_int = int(day_of_month) if pd.notna(day_of_month) else (int(repeat_day) if repeat_day is not None else None)
                                        if repeat_day_int is not None and today.day != repeat_day_int:
                                            print(f"[carry-forward] Skipping '{row.get('title')}': wrong day of month (today={today.day}, needed={repeat_day_int})")
                                            continue
                                    elif repeat_unit == "weekly":
                                        days_since = (today - ref_date).days
                                        weeks_since = days_since // 7
                                        if weeks_since % max(1, repeat_interval) != 0:
                                            print(f"[carry-forward] Skipping '{row.get('title')}': not in a due week")
                                            continue
                                        if repeat_days:
                                            dow = today.weekday()
                                            if dow not in repeat_days:
                                                print(f"[carry-forward] Skipping '{row.get('title')}': wrong day of week")
                                                continue
                                        elif repeat_day is not None:
                                            dow = today.weekday()
                                            if dow != int(repeat_day):
                                                print(f"[carry-forward] Skipping '{row.get('title')}': wrong day of week")
                                                continue
                                except Exception as e:
                                    print(f"[carry-forward] Error checking '{row.get('title')}': {e}")
                                    continue
                        
                        d = dict(row)
                        # set today’s date & keep fields consistent
                        d["local_date"] = str(today.date())
                        d["date"] = str(today.date())
                        # Update priority from template if available
                        tid = row.get("template_id") or row.get("origin_template_id")
                        if tid and tid in tasks_df["id"].values:
                            template = tasks_df[tasks_df["id"] == tid].iloc[0]
                            template_priority = template.get("priority")
                            if not pd.isna(template_priority):
                                d["priority"] = template_priority
                        carry_forward_tasks.append(d)

    # existing today tasks still active (retain)
    # NOTE: Include ALL non-completed, non-deleted scheduled tasks from today
    # regardless of whether their template was completed or not
    # BUT: Filter out tasks whose templates were skipped (e.g., daily tasks with future reference dates)
    existing_today_tasks = pd.DataFrame()
    if not old_schedule_df.empty:
        existing_today_tasks = old_schedule_df[
            (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
            (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
            (~old_schedule_df["is_completed"].fillna(False).astype(bool)) &
            (~old_schedule_df["is_deleted"].fillna(False).astype(bool))
        ]
        
        # CRITICAL FIX: Remove tasks whose templates were skipped for reasons OTHER than
        # 'already instantiated today'. That skip reason is expected and should NOT
        # cause us to drop existing tasks (it creates oscillation on rebuild).
        if not existing_today_tasks.empty:
            skipped_template_ids = {
                evt["template_id"]
                for evt in skip_events
                if "template_id" in evt
                and not str(evt.get("reason", "")).startswith("already instantiated today")
            }
            before_count = len(existing_today_tasks)
            existing_today_tasks = existing_today_tasks[
                ~existing_today_tasks["template_id"].isin(skipped_template_ids) &
                ~existing_today_tasks["origin_template_id"].isin(skipped_template_ids)
            ]
            after_count = len(existing_today_tasks)
            if before_count > after_count:
                logging.info(
                    "Filtered out %d existing task(s) whose templates were skipped today",
                    before_count - after_count
                )
        
        # Enrich existing tasks with window information and priority from their templates
        if not existing_today_tasks.empty and not tasks_df.empty:
            for idx, task in existing_today_tasks.iterrows():
                tid = task.get("template_id") or task.get("origin_template_id")
                if tid and tid in tasks_df["id"].values:
                    template = tasks_df[tasks_df["id"] == tid].iloc[0]
                    # Copy window fields from template if not already present
                    if pd.isna(task.get("window_start_local")) and not pd.isna(template.get("window_start_local")):
                        existing_today_tasks.at[idx, "window_start_local"] = template.get("window_start_local")
                    if pd.isna(task.get("window_end_local")) and not pd.isna(template.get("window_end_local")):
                        existing_today_tasks.at[idx, "window_end_local"] = template.get("window_end_local")
                    # Always use template priority (current value, not snapshot)
                    if not pd.isna(template.get("priority")):
                        existing_today_tasks.at[idx, "priority"] = template.get("priority")

    # completed recurring tasks from today — must be retained in the schedule (for Done list)
    # NOTE: Include ALL completed tasks from today regardless of template status
    completed_today_tasks = pd.DataFrame()
    if not old_schedule_df.empty:
        completed_today_tasks = old_schedule_df[
            (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
            (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
            (old_schedule_df["is_completed"].fillna(False).astype(bool))
        ]

    # NEW: Fetch tasks from scheduled_tasks that have NO time - these need to be scheduled
    # This handles carried-forward tasks that were added by carry_forward_incomplete_one_offs
    unscheduled_tasks = []
    try:
        today_str = str(today.date())
        unscheduled_resp = supabase.table("scheduled_tasks") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("local_date", today_str) \
            .is_("start_time", "null") \
            .eq("is_completed", False) \
            .eq("is_deleted", False) \
            .execute()
        
        if unscheduled_resp.data:
            logging.info("Found %d unscheduled task(s) that need time slots", len(unscheduled_resp.data))
            for task in unscheduled_resp.data:
                # Fetch template details to get window constraints
                tid = task.get("template_id")
                if tid and tid in tasks_df["id"].values:
                    template = tasks_df[tasks_df["id"] == tid].iloc[0]
                    # Add template fields that are needed for scheduling
                    task["window_start_local"] = template.get("window_start_local")
                    task["window_end_local"] = template.get("window_end_local")
                    task["priority"] = template.get("priority", task.get("priority", 3))
                unscheduled_tasks.append(task)
    except Exception as e:
        logging.warning("Failed to fetch unscheduled tasks: %s", e)

    # combine: newly generated + already active from today + carried-forward + completed tasks + unscheduled
    # IMPORTANT: Put freshly generated tasks FIRST so template updates (like time changes) take precedence.
    # Existing tasks are only kept if they don't conflict (e.g., manual edits to non-templated tasks).
    all_new_tasks: List[Dict] = (
        generated_tasks
        + carry_forward_tasks
        + existing_today_tasks.to_dict(orient="records")
        + completed_today_tasks.to_dict(orient="records")
        + unscheduled_tasks
    )

    # safety: ensure list of dicts
    if not all(isinstance(row, dict) for row in all_new_tasks):
        raise TypeError("all_new_tasks must be a list of dicts — found a non-dict element")

    logging.info("Prepared %s instance(s) for %s", len(all_new_tasks), today.date())
    all_new_tasks = _dedupe_by_conflict(all_new_tasks)
    logging.info("Prepared %s instance(s) for %s (post-dedupe)", len(all_new_tasks), today.date())
    return all_new_tasks



# this function is passed tasks_df, and the day start and day end times
# it extracts from tasks_df those tasks that have a fixed start and end time
# and that are due to happen today
# it then populates a scheduled_df with those fixed tasks
# and then looks to fill gaps with floating tasks

def schedule_day(
    tasks_df,
    day_start,
    day_end,
    *,
    supabase=None,                     # NEW: pass a supabase client to enable DB writes
    user_id=None,                      # NEW: required for DB writes
    whitelist_template_ids=None,       # NEW: optional set/list of template_ids to allow
    dry_run=False                       # NEW: override DRY_RUN env for this call (True/False). If None, read env.
):

    import os
    import uuid
    import hashlib
    import json
    import pandas as pd

    # helper constants (assumes these exist in your module; fallback if not)
    try:
        tz = LOCAL_TIMEZONE
    except NameError:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Europe/London")
    try:
        utc_tz = UTC_TIMEZONE
    except NameError:
        from zoneinfo import ZoneInfo
        utc_tz = ZoneInfo("UTC")

    # NEW: coerce day_start/day_end to tz-aware pandas Timestamps in LOCAL tz
    import pandas as pd
    def _as_local_ts(x):
        ts = pd.to_datetime(x)
        try:
            has_tz = ts.tz is not None
        except Exception:
            has_tz = getattr(ts, "tzinfo", None) is not None
        if not has_tz:
            return ts.tz_localize(tz)
        return ts.tz_convert(tz)

    day_start = _as_local_ts(day_start)
    day_end   = _as_local_ts(day_end)


    

    def _hash_snapshot(rows):
        # Stable hash for DRY_RUN behavior-change detection.
        norm = []
        for r in rows:
            norm.append({
                k: (json.dumps(v, sort_keys=True) if isinstance(v, (dict, list)) else v)
                for k, v in sorted(r.items())
            })
        blob = json.dumps(norm, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(blob).hexdigest()

    import pandas as pd  # ensure this import exists at top of file

    def _is_blank(v):
        if v is None:
            return True
        try:
            if pd.isna(v):
                return True
        except Exception:
            pass
        return isinstance(v, str) and v.strip() == ""

    def _safe_title(row):
        # Prefer title, then task; treat NaN/empty as blank
        for key in ("title", "task"):
            v = row.get(key)
            if not _is_blank(v):
                return str(v)
        # Final fallback
        return f"Template {row.get('origin_template_id') or row.get('template_id') or row.get('id') or 'unknown'}"


    def _row_template_id(row):
        # Prefer origin_template_id -> template_id -> id
        tid = row.get("origin_template_id") or row.get("template_id") or row.get("id")
        if tid is None:
            return None
        # Check for pandas NaN
        try:
            if pd.isna(tid):
                return None
        except (TypeError, ValueError):
            pass
        return str(tid)

    def _to_utc_iso(ts):
        # Ensure tz-aware, convert to UTC, ISO string
        if pd.isna(ts):
            return None
        ts = pd.to_datetime(ts, utc=True)
        return ts.tz_convert(utc_tz).isoformat()

    unscheduled_tasks = []
    # preserved_tasks = preserved_tasks or []

    # filter out template definitions — they are not real tasks to be scheduled
    # Guard: nothing to schedule
    if tasks_df is None or len(tasks_df) == 0:
        logging.info("schedule_day: received empty tasks_df; nothing to schedule.")
        return []

    # Robustly derive is_template when column missing
    is_template_series = (
        tasks_df["is_template"]
        if "is_template" in tasks_df.columns
        else pd.Series([False] * len(tasks_df), index=tasks_df.index)
    )
    num_templates = int((is_template_series == True).sum())

    tasks_df = tasks_df[tasks_df.get("is_template", False) != True].copy()
    print(f"Filtered out {num_templates} template task(s).")
    
    # Filter out deleted/skipped tasks - they should never be scheduled
    if "is_deleted" in tasks_df.columns:
        deleted_mask = tasks_df["is_deleted"].fillna(False).astype(bool)
        num_deleted = deleted_mask.sum()
        tasks_df = tasks_df[~deleted_mask].copy()
        if num_deleted > 0:
            print(f"Filtered out {num_deleted} deleted/skipped task(s) from scheduling.")
    
    # Filter out completed tasks - they should not be rescheduled
    if "is_completed" in tasks_df.columns:
        completed_mask = tasks_df["is_completed"].fillna(False).astype(bool)
        num_completed = completed_mask.sum()
        tasks_df = tasks_df[~completed_mask].copy()
        if num_completed > 0:
            print(f"Filtered out {num_completed} completed task(s) from scheduling.")
    
    print(f"[DEBUG] tasks_df after template filter: {len(tasks_df)} tasks")
    # Ensure key columns exist even for floating tasks (which may have no times yet).
    for col, default in [
        ("start_time", pd.NaT),
        ("end_time",   pd.NaT),
        ("date",       None),
        ("is_appointment", False),
        ("is_routine",     False),
        ("is_fixed",       False),
        ("is_floating",    False),
    ]:
        if col not in tasks_df.columns:
            tasks_df[col] = default

    # use global target timezone
    tz = tz

    # ensure start_time and end_time columns can hold datetime objects
    # handle potential NaT values from floating tasks

    # get today's date in the target timezone for comparison
    # ensure today is timezone-aware and normalized to midnight
    today_tz_aware = pd.Timestamp.now(tz=tz).normalize()
    # debugging print
    # print ("FUNCTION schedule_day - today_tz_aware:", today_tz_aware)
    # print("Schedule_day() called")
    # (assert no longer needed)
    # assert 'start_time' in tasks_df.columns, "'start_time' missing from tasks_df"


    schedule_list = [] # create an empty schedule list

    # filter for tasks that potentially have fixed times (appointments, routines, fixed recurring)
    # these are tasks where start_time and end_time should be set.
    # normalize floating flags before building prescheduled_df
    if 'is_floating' in tasks_df.columns:
        tasks_df['is_floating'] = tasks_df['is_floating'].fillna(False).astype(bool)
    else:
        tasks_df['is_floating'] = False

    if 'kind' in tasks_df.columns:
        kind_is_floating = (
            tasks_df['kind']
            .astype(str)
            .str.strip()
            .str.lower()
            .eq('floating')
            .fillna(False)
        )
        tasks_df['is_floating'] = tasks_df['is_floating'] | kind_is_floating

    # Floating tasks should never be treated as fixed/routine/appointment for scheduling
    for flag in ['is_fixed', 'is_routine', 'is_appointment']:
        if flag not in tasks_df.columns:
            tasks_df[flag] = False
        tasks_df.loc[tasks_df['is_floating'], flag] = False

    # include only rows where start_time and end_time are NOT NaN/NaT
    # debugging print
    # print ("\nFUNCTION schedule_day tasks_df before dropna:\n", tasks_df)
    prescheduled_df = tasks_df.dropna(subset=['start_time', 'end_time'], how='any').copy()

    # Only keep tasks that are truly fixed/routine/appointment in prescheduled_df.
    # This prevents already-timed floating tasks from being dropped here.
    for flag in ['is_appointment', 'is_routine', 'is_fixed']:
        if flag not in prescheduled_df.columns:
            prescheduled_df[flag] = False
        else:
            prescheduled_df[flag] = (
                prescheduled_df[flag]
                .astype('boolean')
                .fillna(False)
                .astype(bool)
            )
    prescheduled_df = prescheduled_df[
        prescheduled_df['is_appointment'] | prescheduled_df['is_routine'] | prescheduled_df['is_fixed']
    ].copy()

    if 'kind' in prescheduled_df.columns:
        prescheduled_df = prescheduled_df[
            prescheduled_df['kind'].astype(str).str.strip().str.lower() != 'floating'
        ].copy()

    # debugging print
    # print ("\nFUNCTION schedule_day prescheduled_df after dropna:\n", prescheduled_df)
    if prescheduled_df.empty or 'start_time' not in prescheduled_df.columns:
        print("prescheduled_df is empty or missing 'start_time'")
        print("Columns in prescheduled_df:", prescheduled_df.columns.tolist())
        # ✅ Do NOT return here. We still want to place floating tasks.
        # Create an empty frame and continue so the floating scheduler runs.
        prescheduled_df = pd.DataFrame(columns=tasks_df.columns.tolist())



    for col in ['start_time', 'end_time']:
        if col in prescheduled_df.columns:
            prescheduled_df[col] = pd.to_datetime(prescheduled_df[col], errors='coerce', utc=True)
            prescheduled_df[col] = prescheduled_df[col].dt.tz_convert(LOCAL_TIMEZONE)
        else:
            prescheduled_df[col] = pd.NaT

    # handle 'date' separately if storing as datetime.date
    if  'date' in prescheduled_df.columns:
        prescheduled_df['date'] = pd.to_datetime(prescheduled_df['date'], errors='coerce')
        prescheduled_df['date'] = prescheduled_df['date'].dt.date
    else:
        prescheduled_df['date'] = None


    # now filter prescheduled_df to include only tasks for today
    # compare the date part of the timezone-aware datetime objects
    # ensure the 'date' column is also timezone-aware and normalized before comparison

    # get today in LOCAL timezone
    # today_tz_aware = datetime.now(LOCAL_TIMEZONE)

    # fix timezone issues if needed
    if 'start_time' in prescheduled_df.columns:
        # if prescheduled_df['start_time'].dt.tz is None:
        #    prescheduled_df['start_time'] = prescheduled_df['start_time'].dt.tz_localize(UTC_TIMEZONE)

        # convert all start_time values to LOCAL timezone for safe comparison
        prescheduled_df['start_time'] = prescheduled_df['start_time'].dt.tz_convert(LOCAL_TIMEZONE)

    # match on 'date' column if it exists
    if 'date' in prescheduled_df.columns:
        date_match = prescheduled_df['date'].notna() & (
            prescheduled_df['date'] == today_tz_aware.date()
        )
    else:
        date_match = pd.Series([False] * len(prescheduled_df), index=prescheduled_df.index)


    # match on 'start_time' column if it exists
    if 'start_time' in prescheduled_df.columns:
        start_match = prescheduled_df['start_time'].notna() & (
            prescheduled_df['start_time'].dt.date == today_tz_aware.date()
        )
    else:
        start_match = pd.Series([False] * len(prescheduled_df), index=prescheduled_df.index)

    # keep tasks that match either filter
    prescheduled_df = prescheduled_df[start_match].copy()


    # debugging print
    # print ("\nFUNCTION schedule_day - prescheduled_df after date filter:\n", prescheduled_df)



    # define sorting order
    # higher priority number means lower scheduling priority (scheduled later if overlap)
    # ensure boolean flags exist for sorting
    # ensure boolean flags exist for sorting (no FutureWarning)
    for flag in ["is_appointment", "is_routine", "is_fixed"]:
        if flag not in prescheduled_df.columns:
            prescheduled_df[flag] = False
        else:
            prescheduled_df[flag] = (
                prescheduled_df[flag]
                .astype("boolean")   # pandas nullable bool
                .fillna(False)
                .astype(bool)
            )


    prescheduled_df = prescheduled_df.sort_values(
        by=['is_appointment', 'is_routine', 'start_time'], # appointments first, then routines, then others, then by start time
        ascending=[False, False, True] # appointments=True -> False comes first, routine=True -> False comes first, then start_time ascending
    ).copy()

    # debugging print
    # print("\nFUNCTION schedule_day - prescheduled_df sorted for scheduling:\n", prescheduled_df)

    final_schedule_list = []

    # function to find the next free slot
    def find_next_free_slot(current_time, duration, existing_schedule):
        """Finds the first time slot >= current_time where a task of duration won't overlap."""
        proposed_start = current_time
        while True:
            proposed_end = proposed_start + duration
            overlaps = False
            for scheduled_task in existing_schedule:
                # check for overlap
                if not (proposed_end <= scheduled_task['start_time'] or proposed_start >= scheduled_task['end_time']):
                    overlaps = True
                    # if overlap, the next possible start time is after the end of the conflicting task
                    proposed_start = scheduled_task['end_time']
                    break # check against all scheduled tasks again from the new proposed_start

            if not overlaps:
                # check if the found slot is within the day's end time
                if proposed_end <= day_end:
                     return proposed_start, proposed_end
                else:
                    return None, None # no slot found within the day's end time

            # if there was an overlap, loop continues from the new proposed_start


    # schedule tasks based on priority and finding free slots
    for _, row in prescheduled_df.iterrows():
        task_dict = row.to_dict()
        duration = task_dict['end_time'] - task_dict['start_time'] # calculate duration

        if task_dict.get('is_appointment'):
            # appointments keep their original time
            if task_dict['start_time'] >= day_start and task_dict['end_time'] <= day_end:
                final_schedule_list.append(task_dict)
            else:
                task_name = task_dict.get('task', 'Unnamed')
                print(f"Appointment '{task_name}' is outside the day boundaries ({day_start.strftime('%H:%M')} - {day_end.strftime('%H:%M')}).")
                # In non-interactive/cron environments we skip by default.
                # user_input = input(f"Do you want to include '{task_name}' anyway? (y/n): ").strip().lower()
                # if user_input == 'y':
                #     final_schedule_list.append(task_dict)
                # else:
                #     print(f"Skipping '{task_name}'.")

        elif task_dict.get('is_fixed'):
             # Fixed tasks (non-routine) cannot be moved past their scheduled time - skip if time has passed
             if task_dict['start_time'] < day_start:
                 print(f"Skipping past fixed task '{task_dict.get('task', 'Unnamed')}' (was scheduled for {task_dict['start_time'].strftime('%H:%M')})")
                 continue
             
             # attempt to place at original start_time or the start of the day, whichever is later
             initial_attempt_start = max(day_start, task_dict['start_time'])

             new_start_time, new_end_time = find_next_free_slot(initial_attempt_start, duration, final_schedule_list)

             if new_start_time is not None:
                 task_dict['start_time'] = new_start_time
                 task_dict['end_time'] = new_end_time
                 final_schedule_list.append(task_dict)
             else:
                 print(f"Could not schedule fixed task '{task_dict.get('task', 'Unnamed')}' within day bounds due to conflicts.")
        
        elif task_dict.get('is_routine'):
             # Routines can be moved to later in the day if their original time has passed
             # attempt to place at original start_time or current time, whichever is later
             initial_attempt_start = max(day_start, task_dict['start_time'])

             new_start_time, new_end_time = find_next_free_slot(initial_attempt_start, duration, final_schedule_list)

             if new_start_time is not None:
                 if new_start_time > task_dict['start_time']:
                     print(f"Routine '{task_dict.get('task', 'Unnamed')}' moved from {task_dict['start_time'].strftime('%H:%M')} to {new_start_time.strftime('%H:%M')}")
                 task_dict['start_time'] = new_start_time
                 task_dict['end_time'] = new_end_time
                 final_schedule_list.append(task_dict)
             else:
                 print(f"Could not schedule routine task '{task_dict.get('task', 'Unnamed')}' within day bounds due to conflicts.")


    # sort the scheduled fixed tasks by start time
    # check if final_schedule_list is empty before creating DataFrame
    if final_schedule_list:
        schedule_df_fixed = pd.DataFrame(final_schedule_list).sort_values("start_time").reset_index(drop=True)
    else:
        # create an empty DataFrame with appropriate columns if no fixed tasks were scheduled
        schedule_df_fixed = pd.DataFrame(columns=tasks_df.columns.tolist())
    # debugging print
    # print ("\nFUNCTION schedule_day - schedule_df_fixed after placing fixed tasks:\n", schedule_df_fixed)


    # scheduling floating tasks
    # calculate gaps between scheduled fixed tasks
    free_gaps_list = []
    current_time_for_gap = day_start # start checking for gaps from the beginning of the day

    if schedule_df_fixed.empty:
        # if no fixed tasks, one large gap for the whole day
        free_gaps_list.append((day_start, day_end))
    else:
        # loop through scheduled fixed tasks to find gaps
        for _, scheduled_task in schedule_df_fixed.iterrows():
            gap_end = scheduled_task['start_time']
            if gap_end > current_time_for_gap:
                free_gaps_list.append((current_time_for_gap, gap_end))
            current_time_for_gap = max(current_time_for_gap, scheduled_task['end_time'])

        # add the final gap after the last scheduled task until day_end
        if current_time_for_gap < day_end:
            free_gaps_list.append((current_time_for_gap, day_end))

    # debugging print
    print("\n[DEBUG] free_gaps_list before floating task scheduling:")
    for gap_start, gap_end in free_gaps_list:
        print(f"  Gap: {gap_start.strftime('%H:%M')} - {gap_end.strftime('%H:%M')}")


    # filter for floating tasks from the original tasks_df (they were not included in prescheduled_df)
    # ensure 'is_floating' exists and is boolean
    # ensure 'is_floating' exists and is boolean; also infer from kind == 'floating'
    if 'is_floating' not in tasks_df.columns:
        tasks_df['is_floating'] = False
    else:
        tasks_df['is_floating'] = tasks_df['is_floating'].fillna(False).astype(bool)
    
    # Infer is_floating from other flags: if not appointment/routine/fixed (WITH times), it's floating
    is_appt = tasks_df.get('is_appointment', pd.Series([False] * len(tasks_df))).fillna(False).astype(bool)
    is_rout = tasks_df.get('is_routine', pd.Series([False] * len(tasks_df))).fillna(False).astype(bool)
    is_fix = tasks_df.get('is_fixed', pd.Series([False] * len(tasks_df))).fillna(False).astype(bool)

    # Only treat a task as fixed/appointment/routine if it has a valid time range
    start_series = tasks_df.get('start_time', pd.Series([None] * len(tasks_df)))
    end_series = tasks_df.get('end_time', pd.Series([None] * len(tasks_df)))
    has_start = start_series.notna() & start_series.astype(str).str.strip().ne('')
    has_end = end_series.notna() & end_series.astype(str).str.strip().ne('')
    has_times = has_start & has_end

    is_appt_effective = is_appt & has_times
    is_rout_effective = is_rout & has_times
    is_fix_effective = is_fix & has_times

    inferred_floating = ~(is_appt_effective | is_rout_effective | is_fix_effective)
    tasks_df['is_floating'] = tasks_df['is_floating'] | inferred_floating
    if 'window_start_local' not in tasks_df.columns:
        tasks_df['window_start_local'] = None
    if 'window_end_local' not in tasks_df.columns:
        tasks_df['window_end_local'] = None

    if 'kind' in tasks_df.columns:
        kind_is_floating = (
            tasks_df['kind']
            .astype(str)
            .str.strip()
            .str.lower()
            .eq('floating')
            .fillna(False)
        )
        tasks_df['is_floating'] = tasks_df['is_floating'] | kind_is_floating

    floating_tasks_only_df = tasks_df[tasks_df['is_floating']].copy()

    print(f"[DEBUG] floating_tasks_only_df: {len(floating_tasks_only_df)} tasks")
    print(f"[DEBUG] prescheduled_df: {len(prescheduled_df)} tasks")
    # debugging print
    # print("\nFUNCTION schedule_day - floating_tasks_only_df:\n", floating_tasks_only_df)


    # make sure duration_minutes is numeric and handle errors
    floating_tasks_only_df['duration_minutes'] = pd.to_numeric(floating_tasks_only_df['duration_minutes'], errors='coerce').fillna(0).astype(int)

    # sort floating tasks by priority (highest first = lower priority number)
    # then by duration (shorter first to fit into smaller gaps)
    # default priority if missing; lower number = higher priority
    if "priority" not in floating_tasks_only_df.columns:
        floating_tasks_only_df["priority"] = 3

    # coerce to numeric (ints), fallback to 3
    floating_tasks_only_df["priority"] = (
        pd.to_numeric(floating_tasks_only_df["priority"], errors="coerce")
        .fillna(3)
        .astype(int)
    )

    # Deterministic ordering to avoid oscillation between runs.
    # Sort by priority (asc), then duration (desc to protect long tasks), then a stable tie-breaker.
    tie = (
        floating_tasks_only_df.get('origin_template_id')
        .fillna(floating_tasks_only_df.get('template_id'))
        .fillna(floating_tasks_only_df.get('title'))
        .fillna(floating_tasks_only_df.get('task'))
        .fillna(floating_tasks_only_df.get('id'))
        .astype(str)
    )
    floating_tasks_only_df['_tie'] = tie
    floating_tasks_only_df = floating_tasks_only_df.sort_values(
        by=['priority', 'duration_minutes', '_tie'],
        ascending=[True, False, True],
        kind='mergesort'
    ).copy()

    # debugging print
    print("[DEBUG] Floating task scheduling order:")
    for _, task in floating_tasks_only_df.iterrows():
        task_name = task.get('title') or task.get('task', 'Unnamed')
        priority = task.get('priority', '?')
        duration = task.get('duration_minutes', '?')
        print(f"  - {task_name}: priority={priority}, duration={duration}min")
        if task_name and "fix phil" in str(task_name).lower():
            print("[DEBUG] Fix Phil task snapshot:", {
                "title": task_name,
                "template_id": task.get("template_id"),
                "origin_template_id": task.get("origin_template_id"),
                "priority": priority,
                "duration_minutes": duration,
                "window_start_local": task.get("window_start_local"),
                "window_end_local": task.get("window_end_local"),
                "is_floating": task.get("is_floating"),
                "is_fixed": task.get("is_fixed"),
                "is_routine": task.get("is_routine"),
                "is_appointment": task.get("is_appointment"),
                "start_time": task.get("start_time"),
                "end_time": task.get("end_time"),
            })
    # print("\nFUNCTION schedule_day - floating_tasks_only_df sorted for scheduling:\n", floating_tasks_only_df)
    def _allowed_range_for_task(day_start_ts, day_end_ts, task_row):
        """
        Return (allowed_start, allowed_end) as tz-aware pandas Timestamps in LOCAL tz.
        Accepts naive/aware datetime or pandas Timestamp for day_start_ts/day_end_ts.
        """
        import pandas as pd

        # Ensure LOCAL tz-aware pandas Timestamps
        def _as_local_ts(x):
            ts = pd.to_datetime(x)
            try:
                has_tz = ts.tz is not None
            except Exception:
                has_tz = getattr(ts, "tzinfo", None) is not None
            if not has_tz:
                return ts.tz_localize(tz)
            return ts.tz_convert(tz)

        day_start_local = _as_local_ts(day_start_ts)
        day_end_local   = _as_local_ts(day_end_ts)

        ws = task_row.get('window_start_local')
        we = task_row.get('window_end_local')

        # No window → full day
        if ws is None or we is None or (isinstance(ws, float) and pd.isna(ws)) or (isinstance(we, float) and pd.isna(we)):
            return day_start_local, day_end_local

        # Convert to time-of-day
        def _to_time(x):
            if x is None:
                return None
            if isinstance(x, str):
                try:
                    return pd.to_datetime(x).time()
                except Exception:
                    return None
            try:
                from datetime import time as _t
                if isinstance(x, _t):
                    return x
            except Exception:
                pass
            try:
                return pd.to_datetime(str(x)).time()
            except Exception:
                return None

        ws_t = _to_time(ws)
        we_t = _to_time(we)
        if ws_t is None or we_t is None:
            return day_start_local, day_end_local

        base = day_start_local.normalize()
        try:
            ws_dt = pd.Timestamp.combine(base, ws_t).tz_localize(day_start_local.tz, nonexistent="shift_forward", ambiguous="NaT")
            we_dt = pd.Timestamp.combine(base, we_t).tz_localize(day_start_local.tz, nonexistent="shift_forward", ambiguous="NaT")
        except Exception:
            return day_start_local, day_end_local

        # Clamp to the day
        allowed_start = max(day_start_local, ws_dt)
        allowed_end   = min(day_end_local, we_dt)
        return allowed_start, allowed_end



    # schedule floating tasks into free gaps
    
    scheduled_floating_tasks_list = []
    
    # Build list of all scheduled tasks for overlap checking
    all_scheduled = schedule_df_fixed[['start_time', 'end_time']].to_dict('records') if not schedule_df_fixed.empty else []

    for _, task in floating_tasks_only_df.iterrows():
        # skip tasks with invalid duration
        if task['duration_minutes'] <= 0:
            print(f"Skipping floating task '{task.get('task', 'Unnamed')}' with invalid duration.")
            continue

        duration = pd.to_timedelta(task['duration_minutes'], unit='minutes')
        assigned = False

        # NEW: compute allowed window for this task (in LOCAL tz)
        allowed_start, allowed_end = _allowed_range_for_task(day_start, day_end, task)
        task_title = task.get('title', task.get('task', 'Unnamed'))
        print(f"[DEBUG] Task '{task_title}' window: {allowed_start.strftime('%H:%M')}-{allowed_end.strftime('%H:%M')}, has window_start={task.get('window_start_local')}, window_end={task.get('window_end_local')}")
        if allowed_end <= allowed_start:
            print(f"Window has passed for today: '{task.get('task', task.get('title', 'Unnamed'))}' "
                  f"[{allowed_start.strftime('%H:%M')}–{allowed_end.strftime('%H:%M')}]")
            # Add to unscheduled list so it appears in UI with explanation
            unscheduled_tasks.append(task)
            continue

        # iterate through free gaps to find a fit
        free_gaps_list.sort(key=lambda x: x[0])

        for gap_idx in range(len(free_gaps_list)):
            gap_start, gap_end = free_gaps_list[gap_idx]

            # Intersect gap with allowed window
            eff_start = max(gap_start, allowed_start)
            eff_end   = min(gap_end, allowed_end)

            if (eff_end - eff_start) >= duration:
                # Find next free slot within this effective gap
                task_title = task.get('title', task.get('task', 'Unnamed'))
                print(f"[DEBUG] Trying to fit '{task_title}' ({task['duration_minutes']}min) in gap {gap_start.strftime('%H:%M')}-{gap_end.strftime('%H:%M')}, eff: {eff_start.strftime('%H:%M')}-{eff_end.strftime('%H:%M')}")
                start_time, end_time = find_next_free_slot(eff_start, duration, all_scheduled)
                print(f"[DEBUG] Result: {start_time.strftime('%H:%M') if start_time else 'None'} - {end_time.strftime('%H:%M') if end_time else 'None'}")
                
                # Check if slot is within the effective gap bounds
                if start_time is None or end_time is None or end_time > eff_end:
                    print(f"[DEBUG] Rejected: end_time {end_time.strftime('%H:%M') if end_time else 'None'} > eff_end {eff_end.strftime('%H:%M')}")
                    continue  # No room in this gap, try next

                # normalize + clamp priority (1 = highest)
                p = task.get('priority', 3)
                try:
                    p = int(p)
                except (TypeError, ValueError):
                    p = 3
                p = 1 if p < 1 else (5 if p > 5 else p)

                scheduled_floating_tasks_list.append({
                    "task": task.get('task', 'Unnamed'),
                    "title": task.get('title') if isinstance(task.get('title'), str) and task.get('title').strip() else task.get('task', 'Untitled task'),
                    "start_time": start_time,
                    "end_time": end_time,
                    "duration_minutes": task['duration_minutes'],
                    "id": task.get('id', str(uuid.uuid4())),
                    "template_id": task.get('template_id') or task.get('origin_template_id'),
                    "origin_template_id": task.get('origin_template_id') or task.get('template_id'),
                    "is_floating": True,
                    "is_scheduled": True,
                    "is_completed": False,
                    "is_deleted": False,
                    "priority": p,
                    # copy other relevant columns as needed
                    "repeat": task.get('repeat'),
                    "repeat_unit": task.get('repeat_unit'),
                    "repeat_day": task.get('repeat_day'),
                    "is_recurring": task.get('is_recurring', False),
                    "is_fixed": task.get('is_fixed', False),
                    "is_routine": task.get('is_routine', False),
                    "is_appointment": task.get('is_appointment', False),
                    "is_aspiration": task.get('is_aspiration', False),
                    "date": today_tz_aware.date(),
                    # keep window for debug/inspection (optional)
                    "window_start_local": task.get("window_start_local"),
                    "window_end_local": task.get("window_end_local"),
                })
                
                # Add to all_scheduled to prevent future overlaps
                all_scheduled.append({'start_time': start_time, 'end_time': end_time})

                # update the gap - split it if we scheduled in the middle
                # If task was placed at the start of the gap, just shift gap start forward
                # If task was placed in the middle, split into two gaps
                gap_before = None
                gap_after = None
                
                if start_time > gap_start:
                    # There's space before the scheduled task
                    gap_before = (gap_start, start_time)
                
                if end_time < gap_end:
                    # There's space after the scheduled task
                    gap_after = (end_time, gap_end)
                
                # Replace the current gap with the new gap(s)
                free_gaps_list.pop(gap_idx)
                if gap_before:
                    free_gaps_list.insert(gap_idx, gap_before)
                    if gap_after:
                        free_gaps_list.insert(gap_idx + 1, gap_after)
                elif gap_after:
                    free_gaps_list.insert(gap_idx, gap_after)
                assigned = True
                break  # move to next floating task

        if not assigned:
            task_name = task.get('title', task.get('task', 'Unnamed'))
            print(f"No room inside window for '{task_name}' "
                  f"[{allowed_start.strftime('%H:%M')}–{allowed_end.strftime('%H:%M')}]; deferring.")
            if task_name and "fix phil" in str(task_name).lower():
                print("[DEBUG] Fix Phil unscheduled details:", {
                    "title": task_name,
                    "template_id": task.get("template_id"),
                    "origin_template_id": task.get("origin_template_id"),
                    "priority": task.get("priority"),
                    "duration_minutes": task.get("duration_minutes"),
                    "window_start_local": task.get("window_start_local"),
                    "window_end_local": task.get("window_end_local"),
                    "is_floating": task.get("is_floating"),
                    "is_fixed": task.get("is_fixed"),
                    "is_routine": task.get("is_routine"),
                    "is_appointment": task.get("is_appointment"),
                    "start_time": task.get("start_time"),
                    "end_time": task.get("end_time"),
                })
            unscheduled_tasks.append(task)


    # Second pass: recompute gaps from all scheduled items and retry unscheduled tasks
    if unscheduled_tasks:
        def _compute_gaps(all_sched, day_start_ts, day_end_ts):
            # all_sched: list of dicts with start_time/end_time
            slots = sorted(
                [s for s in all_sched if s.get('start_time') is not None and s.get('end_time') is not None],
                key=lambda x: x['start_time']
            )
            gaps = []
            current = day_start_ts
            for s in slots:
                st = s['start_time']
                en = s['end_time']
                if st > current:
                    gaps.append((current, st))
                if en > current:
                    current = en
            if current < day_end_ts:
                gaps.append((current, day_end_ts))
            return gaps

        # Normalize unscheduled tasks into a DataFrame for sorting
        retry_df = pd.DataFrame([
            t.to_dict() if hasattr(t, 'to_dict') else dict(t)
            for t in unscheduled_tasks
        ])

        if not retry_df.empty:
            # Coerce duration/priority
            retry_df['duration_minutes'] = pd.to_numeric(
                retry_df.get('duration_minutes'), errors='coerce'
            ).fillna(0).astype(int)
            if 'priority' not in retry_df.columns:
                retry_df['priority'] = 3
            retry_df['priority'] = pd.to_numeric(retry_df['priority'], errors='coerce').fillna(3).astype(int)
            retry_tie = (
                retry_df.get('origin_template_id')
                .fillna(retry_df.get('template_id'))
                .fillna(retry_df.get('title'))
                .fillna(retry_df.get('task'))
                .fillna(retry_df.get('id'))
                .astype(str)
            )
            retry_df['_tie'] = retry_tie
            retry_df = retry_df.sort_values(
                by=['priority', 'duration_minutes', '_tie'],
                ascending=[True, False, True],
                kind='mergesort'
            )

            free_gaps_list = _compute_gaps(all_scheduled, day_start, day_end)
            remaining = []

            for _, task in retry_df.iterrows():
                if task['duration_minutes'] <= 0:
                    remaining.append(task)
                    continue

                duration = pd.to_timedelta(task['duration_minutes'], unit='minutes')
                assigned = False
                allowed_start, allowed_end = _allowed_range_for_task(day_start, day_end, task)
                if allowed_end <= allowed_start:
                    remaining.append(task)
                    continue

                free_gaps_list.sort(key=lambda x: x[0])
                for gap_idx in range(len(free_gaps_list)):
                    gap_start, gap_end = free_gaps_list[gap_idx]
                    eff_start = max(gap_start, allowed_start)
                    eff_end = min(gap_end, allowed_end)
                    if (eff_end - eff_start) >= duration:
                        start_time, end_time = find_next_free_slot(eff_start, duration, all_scheduled)
                        if start_time is None or end_time is None or end_time > eff_end:
                            continue

                        # normalize + clamp priority (1 = highest)
                        p = task.get('priority', 3)
                        try:
                            p = int(p)
                        except (TypeError, ValueError):
                            p = 3
                        p = 1 if p < 1 else (5 if p > 5 else p)

                        scheduled_floating_tasks_list.append({
                            "task": task.get('task', 'Unnamed'),
                            "title": task.get('title') if isinstance(task.get('title'), str) and task.get('title').strip() else task.get('task', 'Untitled task'),
                            "start_time": start_time,
                            "end_time": end_time,
                            "duration_minutes": task['duration_minutes'],
                            "id": task.get('id', str(uuid.uuid4())),
                            "template_id": task.get('template_id') or task.get('origin_template_id'),
                            "origin_template_id": task.get('origin_template_id') or task.get('template_id'),
                            "is_floating": True,
                            "is_scheduled": True,
                            "is_completed": False,
                            "is_deleted": False,
                            "priority": p,
                            "repeat": task.get('repeat'),
                            "repeat_unit": task.get('repeat_unit'),
                            "repeat_day": task.get('repeat_day'),
                            "is_recurring": task.get('is_recurring', False),
                            "is_fixed": task.get('is_fixed', False),
                            "is_routine": task.get('is_routine', False),
                            "is_appointment": task.get('is_appointment', False),
                            "is_aspiration": task.get('is_aspiration', False),
                            "date": today_tz_aware.date(),
                            "window_start_local": task.get("window_start_local"),
                            "window_end_local": task.get("window_end_local"),
                        })

                        all_scheduled.append({'start_time': start_time, 'end_time': end_time})

                        gap_before = (gap_start, start_time) if start_time > gap_start else None
                        gap_after = (end_time, gap_end) if end_time < gap_end else None
                        free_gaps_list.pop(gap_idx)
                        if gap_before:
                            free_gaps_list.insert(gap_idx, gap_before)
                            if gap_after:
                                free_gaps_list.insert(gap_idx + 1, gap_after)
                        elif gap_after:
                            free_gaps_list.insert(gap_idx, gap_after)

                        assigned = True
                        break

                if not assigned:
                    task_name = task.get('title', task.get('task', 'Unnamed'))
                    if task_name and "fix phil" in str(task_name).lower():
                        print("[DEBUG] Fix Phil still unscheduled after retry:", {
                            "title": task_name,
                            "template_id": task.get("template_id"),
                            "origin_template_id": task.get("origin_template_id"),
                            "priority": task.get("priority"),
                            "duration_minutes": task.get("duration_minutes"),
                            "window_start_local": task.get("window_start_local"),
                            "window_end_local": task.get("window_end_local"),
                        })
                    remaining.append(task)

            unscheduled_tasks = remaining


    if unscheduled_tasks:
        print("\n" + "="*60)
        print(f"{len(unscheduled_tasks)} floating tasks could not be scheduled today:")
        for task in unscheduled_tasks:
            # Series.get works like dict.get; prefer 'title', then 'task', then a fallback
            name = task.get("title", None)
            if not name or (isinstance(name, str) and not name.strip()):
                name = task.get("task", None)
            if not name or (isinstance(name, str) and not name.strip()):
                name = f"Template {task.get('origin_template_id') or task.get('template_id') or task.get('id') or 'unknown'}"

            print(f" - {name} (Priority {task.get('priority', '?')}, Duration {task.get('duration_minutes', '?')} min)")
        print("="*60 + "\n")


    # In cron/non-interactive environments we do not pause for input.
    # if unscheduled_tasks:
    #     input("Press ENTER to acknowledge unscheduled floating tasks and continue...")

    # combine the scheduled fixed tasks and scheduled floating tasks
    scheduled_floating_tasks_df = pd.DataFrame(scheduled_floating_tasks_list)

    # concatenate and sort the final schedule
    # ensure columns match before concatenating - use concat which handles NaT/None gracefully.
    # we (should) align columns from schedule_df_fixed and scheduled_floating_tasks_df

    # get all unique columns from both dataframes (handle possibly empty frames)
    cols_fixed = set(schedule_df_fixed.columns) if not schedule_df_fixed.empty else set()
    cols_float = set(scheduled_floating_tasks_df.columns) if not scheduled_floating_tasks_df.empty else set()
    all_columns = list(cols_fixed | cols_float)

    parts = []
    if not schedule_df_fixed.empty:
        parts.append(schedule_df_fixed.reindex(columns=all_columns))
    if not scheduled_floating_tasks_df.empty:
        parts.append(scheduled_floating_tasks_df.reindex(columns=all_columns))

    if parts:
        full_schedule_df = pd.concat(parts, ignore_index=True)
    else:
        full_schedule_df = pd.DataFrame(columns=all_columns)


    full_schedule_df = pd.concat([schedule_df_fixed, scheduled_floating_tasks_df], ignore_index=True)


    # make sure start_time and end_time are datetime objects and timezone-aware before final sort
    for col in ['start_time', 'end_time']:
        if col in full_schedule_df.columns:

            # convert to datetime if they aren't already (should be from previous steps)
            full_schedule_df[col] = pd.to_datetime(full_schedule_df[col], errors='coerce', utc=True)
            full_schedule_df[col] = full_schedule_df[col].dt.tz_convert(UTC_TIMEZONE)
            # make sure they are localized to the target timezone
            if full_schedule_df[col].dt.tz is None:
                  full_schedule_df[col] = full_schedule_df[col].dt.tz_localize(tz, errors='coerce')
            elif full_schedule_df[col].dt.tz != tz:
                  full_schedule_df[col] = full_schedule_df[col].dt.tz_convert(tz)


    # final sort by start time
    full_schedule_df = full_schedule_df.sort_values(by='start_time').reset_index(drop=True)


    # ===== NEW: Supabase integration (UTC timestamptz + whitelist + pre-upsert dedupe) =====
    # Only perform DB writes if supabase and user_id are provided.
    if supabase is None or user_id is None:
        return full_schedule_df

    # Compute local_date from day_start (the date we're scheduling for)
    local_date = day_start.date()
    local_date_str = local_date.isoformat()

    # Fetch existing scheduled_tasks to preserve their descriptions (notes)
    existing_notes = {}
    try:
        existing_resp = supabase.table("scheduled_tasks") \
            .select("template_id, description") \
            .eq("user_id", user_id) \
            .eq("local_date", local_date_str) \
            .execute()
        if existing_resp.data:
            for task in existing_resp.data:
                tid = task.get("template_id")
                desc = task.get("description")
                if tid and desc:
                    existing_notes[str(tid)] = desc
            if existing_notes:
                print(f"schedule_day: Preserving notes for {len(existing_notes)} task(s)")
    except Exception as e:
        print(f"schedule_day: Warning - failed to fetch existing notes: {e}")

    # Build candidate rows from the computed schedule
    # Separate existing tasks (with id but no/invalid template_id) from new tasks
    candidate_rows = []
    existing_task_updates = []
    
    for _, row in full_schedule_df.iterrows():
        row_dict = row.to_dict()
        template_id = _row_template_id(row_dict)
        row_id = row_dict.get("id")
        has_existing_id = row_id and not pd.isna(row_id)
        
        # Check if this is an existing task (has id but template_id is None or doesn't match a template)
        # Existing tasks need to be updated by id, not upserted by template_id
        if has_existing_id and (template_id is None or template_id == str(row_id)):
            # This is an existing scheduled task - handle separately
            existing_task_updates.append((str(row_id), row_dict))
            continue
        
        if template_id is None:
            # No template_id and not an existing task - skip
            continue

        # Whitelist filter (if provided)
        if whitelist_template_ids:
            if isinstance(whitelist_template_ids, (set, list, tuple)):
                if template_id not in set(whitelist_template_ids):
                    continue

        start_ts = row_dict.get("start_time")
        if pd.isna(start_ts):
            continue

        # Convert times to UTC ISO strings and build row for actual schema
        start_time_utc_iso = _to_utc_iso(start_ts)
        if not start_time_utc_iso:
            continue
        end_ts = row_dict.get("end_time")
        end_time_utc_iso = _to_utc_iso(end_ts) if pd.notna(end_ts) else None
        try:
            dur = int(row_dict.get("duration_minutes")) if row_dict.get("duration_minutes") is not None else None
        except Exception:
            dur = None
        
        # Preserve description (notes) if it exists for this template_id
        # BUT: Clear error messages when task is successfully scheduled
        preserved_description = existing_notes.get(str(template_id))
        if preserved_description and ("No available time slot" in preserved_description or "window" in preserved_description.lower()):
            # Task is now successfully scheduled - clear the error message
            preserved_description = None
        
        row_data = {
            "user_id": user_id,
            "local_date": local_date_str,
            "template_id": str(template_id),
            "title": _safe_title(row_dict),
            "start_time": start_time_utc_iso,
            "end_time": end_time_utc_iso,
            "duration_minutes": dur,
            "timezone": os.getenv("TZ", "Europe/London"),
            # include flags if present on the row
            "is_appointment": bool(row_dict.get("is_appointment")),
            "is_routine": bool(row_dict.get("is_routine")),
            "is_fixed": bool(row_dict.get("is_fixed")),
            "priority": _normalize_priority(row_dict.get("priority")),
        }
        
        # Only include description if we have one to preserve (don't overwrite with None)
        if preserved_description is not None:
            row_data["description"] = preserved_description
        
        candidate_rows.append(row_data)    # Early exit if nothing to write
    if not candidate_rows:
        print("schedule_day: no candidate rows to upsert.")
        return full_schedule_df

    # Always attempt to upsert so changed fields (e.g., priority) get updated.
    rows_to_write = candidate_rows


    # 🚫 No dry-run branch — we always write if we have rows and a client
    if supabase is None:
        raise RuntimeError("schedule_day: supabase client is None but a write is required")
    # Filter out fields not present in the DB to avoid column errors
    allowed_cols = _discover_table_columns(supabase, "scheduled_tasks")

    rows_to_write = [{k: v for k, v in r.items() if k in allowed_cols} for r in rows_to_write]

    # Filter to only real table columns and avoid GENERATED columns like "date"
    allowed_cols = _discover_table_columns(supabase, "scheduled_tasks")
    generated_cols = {"date"}
    filtered_rows = [
        {k: v for k, v in r.items() if (k in allowed_cols and k not in generated_cols)}
        for r in rows_to_write
    ]
    if not filtered_rows:
        print("schedule_day: nothing to upsert after column filtering.")
        return full_schedule_df

    # ✅ Sanitize: replace NaN with None to keep JSON valid
    import pandas as pd
    def _json_sanitize(obj):
        out = {}
        for k, v in obj.items():
            try:
                if pd.isna(v):
                    out[k] = None
                    continue
            except Exception:
                pass
            out[k] = v
        return out

    filtered_rows = [_json_sanitize(r) for r in filtered_rows]

    # Filter out any tasks whose template_id matches an existing deleted record
    # This prevents the upsert from overwriting is_deleted=true back to false
    try:
        deleted_template_ids_resp = supabase.table("scheduled_tasks") \
            .select("template_id") \
            .eq("user_id", user_id) \
            .eq("local_date", str(local_date)) \
            .eq("is_deleted", True) \
            .execute()
        deleted_template_ids = {r["template_id"] for r in (deleted_template_ids_resp.data or []) if r.get("template_id")}
        
        if deleted_template_ids:
            before_count = len(filtered_rows)
            filtered_rows = [r for r in filtered_rows if r.get("template_id") not in deleted_template_ids]
            after_count = len(filtered_rows)
            if before_count != after_count:
                print(f"schedule_day: Excluded {before_count - after_count} task(s) that match deleted records")
    except Exception as e:
        print(f"schedule_day: Warning - could not check for deleted records: {e}")

    # Extra visibility
    print(
        f"schedule_day candidates={len(candidate_rows)} "
        f"filtered={len(filtered_rows)} "
        f"allowed_cols={sorted(list(allowed_cols))}"
    )
    try:
        from pprint import pformat
        print("schedule_day first row sample:", pformat(filtered_rows[0]) if filtered_rows else "<none>")
    except Exception:
        pass

    # DELETE existing tasks for this date before upserting new schedule
    # BUT: preserve tasks that we're about to update (those in existing_task_updates)
    # AND: preserve deleted tasks (is_deleted=True)
    print(f"schedule_day: DELETING old tasks for {local_date_str}")
    if existing_task_updates:
        # Get IDs of tasks to preserve
        preserve_ids = [task_id for task_id, _ in existing_task_updates]
        resp = supabase.table("scheduled_tasks").select("id").eq("user_id", user_id).eq("local_date", str(local_date)).eq("is_completed", False).eq("is_deleted", False).execute()
        ids_to_delete = [row["id"] for row in (resp.data or []) if row["id"] not in preserve_ids]
        if ids_to_delete:
            supabase.table("scheduled_tasks").delete().in_("id", ids_to_delete).execute()
        deleted_count = len(ids_to_delete)
    else:
        deleted_count = archive_delete_for_user_day(supabase, user_id, local_date, day_start=day_start)
    print(f"schedule_day: Deleted {deleted_count} old task(s)")

    # Perform upsert with explicit conflict target for NEW tasks
    print(f"schedule_day: WRITING {len(filtered_rows)} new task(s) to scheduled_tasks for {local_date_str}")

    # Validate that all rows have template_id set (catch NULLs that would bypass constraint)
    null_template_count = sum(1 for r in filtered_rows if not r.get("template_id"))
    if null_template_count > 0:
        logging.error(f"schedule_day: {null_template_count} row(s) have NULL template_id - will cause duplicates!")
        for r in filtered_rows:
            if not r.get("template_id"):
                logging.error(f"  - NULL template_id: {r.get('title', 'Untitled')}")

    try:
        result = (
            supabase.table("scheduled_tasks")
            

            .upsert(
                filtered_rows,
                on_conflict="user_id,local_date,template_id",
                ignore_duplicates=False
            )
            .execute()
             )

        upserted = len(result.data or [])
        print(
            f"schedule_day upserted={upserted} "
            f"attempted={len(candidate_rows)} "
            f"conflict_target=user_id,local_date,template_id"
        )
        
        # Update existing tasks by their id
        if existing_task_updates:
            print(f"schedule_day: UPDATING {len(existing_task_updates)} existing task(s)")
            for task_id, row_dict in existing_task_updates:
                start_ts = row_dict.get("start_time")
                start_time_utc_iso = _to_utc_iso(start_ts)
                if not start_time_utc_iso:
                    continue
                end_ts = row_dict.get("end_time")
                end_time_utc_iso = _to_utc_iso(end_ts) if pd.notna(end_ts) else None
                try:
                    dur = int(row_dict.get("duration_minutes")) if row_dict.get("duration_minutes") is not None else None
                except Exception:
                    dur = None
                
                update_data = {
                    "start_time": start_time_utc_iso,
                    "end_time": end_time_utc_iso,
                    "duration_minutes": dur,
                    "priority": _normalize_priority(row_dict.get("priority")),
                }
                # Clear error messages when task is successfully scheduled
                update_data["description"] = None
                
                # Remove None values except description (we want to explicitly set it to null)
                update_data = {k: v for k, v in update_data.items() if v is not None or k == "description"}
                
                if update_data:
                    supabase.table("scheduled_tasks").update(update_data).eq("id", task_id).execute()
        
        # Write unscheduled tasks to database so UI can display them with explanations
        if unscheduled_tasks:
            unscheduled_rows = []
            for task in unscheduled_tasks:
                template_id = _row_template_id(task.to_dict() if hasattr(task, 'to_dict') else task)
                if not template_id:
                    continue
                
                # Check if there's an existing note/explanation to preserve
                existing_explanation = existing_notes.get(str(template_id))
                
                # Only generate new explanation if there isn't already one
                if not existing_explanation:
                    # Calculate window for explanation
                    allowed_start, allowed_end = _allowed_range_for_task(day_start, day_end, task)
                    
                    # Check if window has expired (end time has passed)
                    if allowed_end <= allowed_start:
                        ws = task.get('window_start_local')
                        we = task.get('window_end_local')
                        if ws and we:
                            # Try to parse times for display
                            try:
                                ws_display = pd.to_datetime(ws).strftime('%H:%M')
                                we_display = pd.to_datetime(we).strftime('%H:%M')
                                explanation = f"⏰ Window has passed [{ws_display}–{we_display}]. Use 'Skip' or 'Tomorrow' to reschedule."
                            except:
                                explanation = "⏰ Time window has passed for today. Use 'Skip' or 'Tomorrow' to reschedule."
                        else:
                            explanation = "⏰ Time window has passed for today. Use 'Skip' or 'Tomorrow' to reschedule."
                    else:
                        explanation = f"No available time slot within window [{allowed_start.strftime('%H:%M')}–{allowed_end.strftime('%H:%M')}]"
                else:
                    explanation = existing_explanation
                
                name = task.get("title") or task.get("task", "Unnamed")
                duration = task.get("duration_minutes", 0)
                
                unscheduled_rows.append({
                    "user_id": user_id,
                    "local_date": local_date_str,
                    "template_id": str(template_id),
                    "title": name,
                    "start_time": None,
                    "end_time": None,
                    "duration_minutes": int(duration) if duration else None,
                    "timezone": os.getenv("TZ", "Europe/London"),
                    "is_appointment": False,
                    "is_routine": False,
                    "is_fixed": False,
                    "is_scheduled": False,  # Mark as not scheduled
                    "description": explanation,  # Store explanation
                    "priority": _normalize_priority(task.get("priority")),
                })
            
            if unscheduled_rows:
                filtered_unscheduled = [{k: v for k, v in r.items() if k in allowed_cols} for r in unscheduled_rows]
                filtered_unscheduled = [_json_sanitize(r) for r in filtered_unscheduled]
                
                print(f"schedule_day: WRITING {len(filtered_unscheduled)} unscheduled task(s) with explanations")
                supabase.table("scheduled_tasks").upsert(
                    filtered_unscheduled,
                    on_conflict="user_id,local_date,template_id",
                    ignore_duplicates=False
                ).execute()

    except Exception as e:
        err_msg = getattr(e, "message", None) or str(e)
        try:
            from pprint import pformat
            print("schedule_day upsert failed. Exception:", err_msg)
            if hasattr(e, "args") and e.args:
                print("args[0]:", pformat(e.args[0]))
            if hasattr(e, "response"):
                print("response:", pformat(getattr(e, "response")))
        except Exception:
            pass



    # Preserve original behavior: return the in-memory schedule DataFrame
    return full_schedule_df

