# dayflow/planner.py
from datetime import date
from typing import Any, Dict, List, Tuple
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo
# --- helpers to filter payload to existing table columns ---

from typing import Set

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
            "title","start_time","duration_minutes"
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

def upsert_scheduled_tasks(supabase: Any, instances: List[Dict]) -> Tuple[int, int]:
    """
    Write instances to scheduled_tasks. For now, simple insert (no upsert) and let DRY_RUN protect us.
    Later we can add idempotency (on_conflict) once your columns are finalised.
    """
    if not instances:
        return (0, 0)
    # NOTE: Supabase Python SDK supports upsert; we’re using insert initially during dry-run.
    resp = supabase.table("scheduled_tasks") \
    .upsert(instances, on_conflict="user_id,local_date,template_id") \
    .execute()

    inserted = len(resp.data or [])
    logging.info("Inserted %s scheduled task(s)", inserted)
    return (inserted, 0)

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
    return pd.DataFrame(resp.data or [])


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
    })

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
    if not tasks_df.empty and not old_schedule_df.empty and "task" in tasks_df.columns and "task" in old_schedule_df.columns:
        for _, template_task in tasks_df[tasks_df.get("is_template", True)].iterrows():
            template_id = str(template_task.get("id"))
            task_name = str(template_task.get("task", "")).strip().lower()

            if not task_name:
                continue

            mask = (
                old_schedule_df["task"].astype(str).str.strip().str.lower().eq(task_name)
            ) & (
                old_schedule_df["origin_template_id"].isna() |
                (old_schedule_df["origin_template_id"].astype(str) != template_id)
            ) & (
                ~old_schedule_df["is_template"].fillna(False).astype(bool)
            )

            if mask.any():
                logging.info("Patching origin_template_id for completed task '%s'", template_task.get("task"))
                old_schedule_df.loc[mask, "origin_template_id"] = template_id

    # this long code block generates one-off instances of tasks from template tasks
    for _, task in tasks_df.iterrows():

        # test for needed fields
        repeat_unit = (task.get("repeat_unit") or task.get("repeat") or None)
        if not repeat_unit:
            continue

        # check if this template has already been marked as completed today
        last_done = task.get("last_completed_date")
        if pd.notna(last_done):
            try:
                last_done_date = pd.to_datetime(last_done).date()
                if last_done_date == today.date():
                    logging.info("skipping '%s' — already marked completed today", task.get("task"))
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
            continue

        repeat_day_int = int(task.get("repeat_day")) if pd.notna(task.get("repeat_day")) else None
        repeat_interval = int(task.get("repeat_interval", 1) or 1)

        date_raw = task.get("date")
        reference_date = today if pd.isna(date_raw) else pd.to_datetime(date_raw, errors='coerce')

        if pd.isna(reference_date):
            reference_date = today
        if reference_date.tzinfo is None:
            reference_date = reference_date.tz_localize(LOCAL_TIMEZONE)
        else:
            reference_date = reference_date.tz_convert(LOCAL_TIMEZONE)
        if today.date() < reference_date.date():
            continue

        # test for recurrance and establish add_task as True or False
        add_task = False

        # is it daily?
        if repeat_unit == "daily":
            add_task = True

        # if not, is it weekly? set add_task to True if instantiation is due
        elif repeat_unit == "weekly":
            weeks_since = (today - reference_date).days // 7
            if (weeks_since % repeat_interval == 0 and
                (repeat_day_int is None or today.dayofweek == repeat_day_int)):
                add_task = True

        # if not, is it monthly? set add_task to true if instantiation is due
        elif repeat_unit == "monthly":
            months_since = (today.year - reference_date.year) * 12 + (today.month - reference_date.month)
            if months_since % repeat_interval == 0 and (repeat_day_int is None or today.day == repeat_day_int):
                add_task = True

        # skip if already instantiated
        if add_task and not old_schedule_df.empty:
            already_instantiated = old_schedule_df[
                (old_schedule_df.get("origin_template_id") == task.get("id")) &
                (pd.to_datetime(old_schedule_df["date"]).dt.date == today.date()) &
                (~old_schedule_df["is_template"].fillna(False).astype(bool)) &
                (~old_schedule_df["is_completed"].fillna(False).astype(bool)) &
                (~old_schedule_df["is_deleted"].fillna(False).astype(bool))
            ]
            if not already_instantiated.empty:
                logging.info("Skipping duplicate instantiation of '%s'", task.get("task"))
                continue

        if add_task:
            # instantiate task (shape matches scheduled_tasks upsert we use)
            new_task: Dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "user_id": str(user_id),
                "template_id": task.get("id"),
                "origin_template_id": task.get("id"),  # keep your field for continuity
                "title": task.get("task") or task.get("title") or "Untitled task",
                "local_date": str(today.date()),        # wall date
                "date": str(today.date()),              # your table requires NOT NULL "date"
                "start_time": start_time_utc.isoformat(),  # TIMESTAMPTZ
                "duration_minutes": duration_minutes,
                "is_template": False,
                "is_scheduled": True,
                "is_completed": False,
                "is_deleted": False,
                "is_reschedulable": True,
                "repeat_unit": repeat_unit,
                "tz_id": os.getenv("TZ", "Europe/London"),
            }
            generated_tasks.append(new_task)

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
    return all_new_tasks


def schedule_day(instances: List[Dict], run_date: date, supabase: Any) -> List[Dict]:
    """
    Original function name preserved. If DRY_RUN=true, only log; else write to DB.
    """
    dry_run = os.getenv("DRY_RUN", "true").lower() == "true"
    if dry_run:
        logging.info("[DRY_RUN] Would write %s scheduled task(s) for %s", len(instances), run_date)
        return instances

    inserted, _ = upsert_scheduled_tasks(supabase, instances)
    logging.info("Wrote %s scheduled task(s) for %s", inserted, run_date)
    return instances
