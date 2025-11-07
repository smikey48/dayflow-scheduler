# dayflow/planner.py
from datetime import date
from typing import Any, Dict, List, Tuple
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo
# --- helpers to filter payload to existing table columns ---

from typing import Set

from typing import Tuple, Dict as TDict, List as TList
# ... existing imports and helpers ...

def archive_delete_for_user_day(sb, user_id: str, run_date) -> int:
    """
    Archives and deletes all scheduled_tasks for a given user and date
    using the Supabase RPC 'archive_then_delete_scheduled_tasks_by_ids'.
    """
    # 1) Fetch all matching ids
    resp = archive_delete_for_user_day(sb, user_id, run_date)


    ids = [row["id"] for row in (resp.data or [])]
    if not ids:
        print(f"[planner] no scheduled tasks to archive for {run_date}")
        return 0

    # 2) Archive + delete via RPC
    result = sb.rpc("archive_then_delete_scheduled_tasks_by_ids", {"ids": ids}).execute()
    deleted_count = result.data if isinstance(result.data, int) else 0

    if deleted_count != len(ids):
        print(f"[warn] archived {deleted_count} of {len(ids)} for {run_date}")
    else:
        print(f"[planner] archived and deleted {deleted_count} scheduled task(s) for {run_date}")

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
    dropped = 0
    for r in rows:
        k = (str(r.get("user_id")), str(r.get("local_date")), str(r.get("template_id")))
        if None in k or "None" in k:
            # If any key part missing, just pass it through (won't collide with well-formed rows)
            # You can also choose to skip these entirely.
            pass
        if k in seen:
            dropped += 1
            continue  # keep the first one; drop later duplicates
        seen[k] = r
    if dropped:
        logging.info("De-dup: dropped %s duplicate row(s) on (user_id,local_date,template_id)", dropped)
    return list(seen.values())
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
    resp = supabase.table("task_templates").select("*").eq("user_id", user_id).execute()
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
    resp = supabase.table("task_templates").select("*").eq("user_id", user_id).execute()
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
    df = pd.DataFrame(resp.data or [])

    # Ensure expected columns exist
    for col, default in [
        ("is_template", False),
        ("is_completed", False),
        ("is_deleted", False),
        ("repeat_unit", None),
        ("repeat_interval", 1),
        ("repeat_day", None),
        ("origin_template_id", None),
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
    - repeat_unit: 'daily' | 'weekly' | 'monthly' | None
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
        return (True, "daily")

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

def preprocess_recurring_tasks(run_date: date, supabase: Any) -> List[Dict]:
    """
    Adapter version of your original function:
    - loads templates + "old schedule" from Supabase
    - follows your rules to decide what to instantiate / carry forward
    - returns a list of instance dicts for upsert into scheduled_tasks

    NOTE: We run for exactly one user (TEST_USER_ID) during this phase, as agreed.
    """
    user_id = os.getenv("TEST_USER_ID")
    if not user_id:
        logging.warning("TEST_USER_ID not set; nothing to do.")
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

        used_live = supabase.table("scheduled_tasks") \
            .select("template_id, local_date") \
            .eq("user_id", user_id) \
            .neq("local_date", today_str) \
            .execute()
        used_arch = supabase.table("scheduled_tasks_archive") \
            .select("template_id, local_date") \
            .eq("user_id", user_id) \
            .neq("local_date", today_str) \
            .execute()

        used_other_ids = {row["template_id"] for row in (used_live.data or []) if row.get("template_id")}
        used_other_ids |= {row["template_id"] for row in (used_arch.data or []) if row.get("template_id")}

        # Normalize types for comparison
        tasks_df["id"] = tasks_df["id"].astype(str)
        one_off_mask = tasks_df["repeat_unit"].astype(str).str.lower().eq("none")
        used_mask = tasks_df["id"].isin(used_other_ids)

        # 🔎 NEW: log the exact one-offs we’re about to block
        to_block = tasks_df.loc[one_off_mask & used_mask, ["id", "title", "repeat_unit"]].copy()
        if not to_block.empty:
            logging.info("One-off block list (template_id,title,repeat_unit): %s", to_block.to_dict(orient="records"))
        
        blocked = (one_off_mask & used_mask)
        blocked_count = int(blocked.sum())
        if blocked_count:
            logging.info("Excluding %d one-off template(s) already used on a different day", blocked_count)
            tasks_df = tasks_df.loc[~blocked].copy()
    except Exception:
        logging.exception("Failed to exclude reused one-off templates; proceeding without this guard")


    # remove duplicates by origin_template_id + date (precautionary)
    if "origin_template_id" in old_schedule_df.columns and "date" in old_schedule_df.columns:
        old_schedule_df = (
            old_schedule_df.sort_values(old_schedule_df.columns[0])  # arbitrary stable sort
                             .drop_duplicates(subset=["origin_template_id", "date"], keep="first")
        )

    # normalize repeat_unit from legacy 'repeat' field
    if "repeat" in tasks_df.columns:
        tasks_df["repeat_unit"] = tasks_df["repeat_unit"].combine_first(tasks_df["repeat"])
    if "repeat" in old_schedule_df.columns:
        old_schedule_df["repeat_unit"] = old_schedule_df["repeat_unit"].combine_first(old_schedule_df["repeat"])
    old_schedule_df["is_template"] = old_schedule_df["is_template"].fillna(False).astype(bool)

    # establish an empty list for tasks to be generated in this function
    generated_tasks: List[Dict] = []

    # build list of template IDs that have already been completed today
    completed_today_template_ids = old_schedule_df[
        (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
        (old_schedule_df["is_completed"].fillna(False).astype(bool)) &
        (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date())
    ]["origin_template_id"].dropna().astype(str).unique().tolist()

    # filter out any templates from tasks_df that match those IDs
    if not tasks_df.empty:
        tasks_df = tasks_df[~tasks_df["id"].astype(str).isin(completed_today_template_ids)]

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
        reference_date = today if pd.isna(date_raw) else pd.to_datetime(date_raw, errors='coerce')
        reason = None  # will capture why we decided to instantiate

        if pd.isna(reference_date):
            reference_date = today
        if reference_date.tzinfo is None:
            reference_date = reference_date.tz_localize(LOCAL_TIMEZONE)
        else:
            reference_date = reference_date.tz_convert(LOCAL_TIMEZONE)
        if today.date() < reference_date.date():
            skip_events.append({
                "template_id": str(task.get("id")),
                "title": task.get("task") or task.get("title"),
                "reason": f"reference_date in future ({reference_date.date()})"
            })
            continue

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

        # skip if already instantiated
        if not old_schedule_df.empty:
            already_instantiated = old_schedule_df[
                (old_schedule_df.get("origin_template_id") == task.get("id")) &
                (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
                (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
                (~old_schedule_df["is_completed"].fillna(False).astype(bool)) &
                (~old_schedule_df["is_deleted"].fillna(False).astype(bool))
            ]
            if not already_instantiated.empty:
                logging.info("Skipping duplicate instantiation of '%s'", _name_for_log(task))
                skip_events.append({
                    "template_id": str(task.get("id")),
                    "title": task.get("task") or task.get("title"),
                    "reason": "already instantiated today (active)",
                })
                continue


        # instantiate task (shape matches scheduled_tasks upsert we use)
        # Derive flags from template (prefer explicit flags; fall back to kind)
        tmpl_kind = (str(task.get("kind") or "")).strip().lower()
        tmpl_is_appt = bool(task.get("is_appointment") or tmpl_kind == "appointment")
        tmpl_is_routine = bool(task.get("is_routine") or tmpl_kind == "routine")

        # If this template is 'floating' (one-off OR repeating), DO NOT set start/end now.
        # Let the floating scheduler place it within gaps (and respect window if present).
        if tmpl_kind == "floating":
            new_task: Dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "user_id": str(user_id),
                "template_id": task.get("id"),
                "origin_template_id": task.get("id"),
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
                "template_id": task.get("id"),
                "origin_template_id": task.get("id"),
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
                        d = dict(row)
                        # set today’s date & keep fields consistent
                        d["local_date"] = str(today.date())
                        d["date"] = str(today.date())
                        carry_forward_tasks.append(d)

    # existing today tasks still active (retain)
    existing_today_tasks = pd.DataFrame()
    if not old_schedule_df.empty:
        existing_today_tasks = old_schedule_df[
            (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
            (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
            (~old_schedule_df["is_completed"].fillna(False).astype(bool)) &
            (~old_schedule_df["is_deleted"].fillna(False).astype(bool)) &
            (old_schedule_df.get("origin_template_id").isin(tasks_df["id"].astype(str)) if not tasks_df.empty else False)
        ]

    # completed recurring tasks from today — must be retained in the schedule (for Done list)
    completed_today_tasks = pd.DataFrame()
    if not old_schedule_df.empty:
        completed_today_tasks = old_schedule_df[
            (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
            (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
            (old_schedule_df["is_completed"].fillna(False).astype(bool)) &
            (old_schedule_df.get("origin_template_id").isin(tasks_df["id"].astype(str)) if not tasks_df.empty else False)
        ]

    # combine: newly generated + already active from today + carried-forward + completed tasks
    all_new_tasks: List[Dict] = (
        generated_tasks
        + existing_today_tasks.to_dict(orient="records")
        + carry_forward_tasks
        + completed_today_tasks.to_dict(orient="records")
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
        return str(tid) if tid is not None else None

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
    # include only rows where start_time and end_time are NOT NaN/NaT
    # debugging print
    # print ("\nFUNCTION schedule_day tasks_df before dropna:\n", tasks_df)
    prescheduled_df = tasks_df.dropna(subset=['start_time', 'end_time'], how='any').copy()
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

        elif task_dict.get('is_routine') or task_dict.get('is_fixed'):
             # routines and other fixed tasks can be moved if they overlap or start before day_start
             # attempt to place at original start_time or the start of the day, whichever is later
             initial_attempt_start = max(day_start, task_dict['start_time'])

             new_start_time, new_end_time = find_next_free_slot(initial_attempt_start, duration, final_schedule_list)

             if new_start_time is not None:
                 task_dict['start_time'] = new_start_time
                 task_dict['end_time'] = new_end_time
                 final_schedule_list.append(task_dict)
             else:
                 print(f"Could not schedule fixed/routine task '{task_dict.get('task', 'Unnamed')}' within day bounds due to conflicts.")


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
    # print("\nFUNCTION schedule_day - free_gaps_list before floating task scheduling:\n", free_gaps_list)


    # filter for floating tasks from the original tasks_df (they were not included in prescheduled_df)
    # ensure 'is_floating' exists and is boolean
    # ensure 'is_floating' exists and is boolean; also infer from kind == 'floating'
    if 'is_floating' not in tasks_df.columns:
        tasks_df['is_floating'] = False
    else:
        tasks_df['is_floating'] = tasks_df['is_floating'].fillna(False).astype(bool)
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

    floating_tasks_only_df = floating_tasks_only_df.sort_values(
        by=['priority', 'duration_minutes'],
        ascending=[True, True]
    ).copy()

    # debugging print
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

    for _, task in floating_tasks_only_df.iterrows():
        # skip tasks with invalid duration
        if task['duration_minutes'] <= 0:
            print(f"Skipping floating task '{task.get('task', 'Unnamed')}' with invalid duration.")
            continue

        duration = pd.to_timedelta(task['duration_minutes'], unit='minutes')
        assigned = False

        # NEW: compute allowed window for this task (in LOCAL tz)
        allowed_start, allowed_end = _allowed_range_for_task(day_start, day_end, task)
        if allowed_end <= allowed_start:
            print(f"Window excludes placement today: '{task.get('task', task.get('title', 'Unnamed'))}' "
                  f"[{allowed_start.strftime('%H:%M')}–{allowed_end.strftime('%H:%M')}]")
            continue

        # iterate through free gaps to find a fit
        free_gaps_list.sort(key=lambda x: x[0])

        for gap_idx in range(len(free_gaps_list)):
            gap_start, gap_end = free_gaps_list[gap_idx]

            # Intersect gap with allowed window
            eff_start = max(gap_start, allowed_start)
            eff_end   = min(gap_end, allowed_end)

            if (eff_end - eff_start) >= duration:
                # schedule the task at the start of the effective gap
                start_time = eff_start
                end_time = start_time + duration

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
                    "is_floating": True,
                    "is_scheduled": True,
                    "is_completed": False,
                    "is_deleted": False,
                    "priority": p,
                    # copy other relevant columns as needed
                    "repeat": task.get('repeat'),
                    "repeat_unit": task.get('repeat_unit'),
                    "repeat_day": task.get('repeat_day'),
                    "origin_template_id": task.get('origin_template_id'),
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

                # update the gap (relative to original gap limits)
                new_gap_start = end_time
                # Important: adjust only within the original gap bounds
                if new_gap_start < gap_end:
                    free_gaps_list[gap_idx] = (new_gap_start, gap_end)
                else:
                    free_gaps_list.pop(gap_idx)
                assigned = True
                break  # move to next floating task

        if not assigned:
            print(f"No room inside window for '{task.get('task', task.get('title', 'Unnamed'))}' "
                  f"[{allowed_start.strftime('%H:%M')}–{allowed_end.strftime('%H:%M')}]; deferring.")
            unscheduled_tasks.append(task)


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

    # Compute local_date (mirror to 'date' as per notes)
    local_date = today_tz_aware.date()
    local_date_str = local_date.isoformat()

    # Build candidate rows from the computed schedule
    candidate_rows = []
    for _, row in full_schedule_df.iterrows():
        row_dict = row.to_dict()
        template_id = _row_template_id(row_dict)
        if template_id is None:
            # If we cannot identify a template_id, skip — conflict key depends on it.
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
        candidate_rows.append({
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
        })



    # Early exit if nothing to write
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

    # Perform upsert with explicit conflict target
    print(f"schedule_day: WRITING {len(filtered_rows)} row(s) to scheduled_tasks for {local_date_str}")

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

