# dayflow/planner.py
from __future__ import annotations
from datetime import date
from typing import Any, Dict, List, Tuple
import logging
import os

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
        instances.append({
            "template_id": t.get("id"),
            "user_id":     t.get("user_id"),
            "title":       t.get("title", "Untitled task"),
            "local_date":  str(run_date),    # hybrid time model: local wall-date
            "start_time":  t.get("start_time", "09:00:00"),   # fallback if not present
            "duration_minutes": t.get("duration_minutes", 30),
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
    resp = supabase.table("scheduled_tasks").insert(instances).execute()
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
