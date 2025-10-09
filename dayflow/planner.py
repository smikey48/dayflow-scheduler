# dayflow/planner.py
from __future__ import annotations
from datetime import date
from typing import Any, Dict, List, Tuple
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

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

def preprocess_recurring_tasks(run_date: date, supabase: Any) -> List[Dict]:
    """
    Original function name preserved. Reads TEST_USER_ID and prepares instances from templates.
    Replace plan_instances_for_today(...) with your real logic when ready.
    """
    test_user_id = os.getenv("TEST_USER_ID")
    if not test_user_id:
        logging.warning("TEST_USER_ID not set; nothing to do.")
        return []
    templates = get_templates_for_user(supabase, test_user_id)
    instances = plan_instances_for_today(templates, run_date)
    return instances

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
