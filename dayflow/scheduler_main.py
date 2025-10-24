# dayflow/scheduler_main.py
import os
import sys
import logging
import argparse
from datetime import datetime, date, time
from zoneinfo import ZoneInfo
from typing import Optional, Any

import pandas as pd  # used to build tasks_df for schedule_day

from dayflow.planner import preprocess_recurring_tasks, schedule_day

LONDON = ZoneInfo("Europe/London")

# -----------------------
# Helpers & run gate
# -----------------------
def should_run_now(now: Optional[datetime] = None) -> bool:
    """Default daily gate: run only at/after 07:00 Europe/London."""
    now = now or datetime.now(LONDON)
    return now.time() >= time(7, 0)


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
        default=str(os.getenv("DRY_RUN", "false")).lower() in ("1", "true", "yes", "on"),
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
    # --- CLI / Logging ---
    args = parse_args()

    tz_name = args.timezone or os.getenv("TZ", "Europe/London")
    tz = ZoneInfo(tz_name)

    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO"), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logging.info("DayFlow scheduler starting (tz=%s, dry_run=%s, force=%s)", tz_name, args.dry_run, args.force)

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
    # 1) Expand templates into instances for run_date
    instances = preprocess_recurring_tasks(run_date=run_date, supabase=sb)
    count_instances = len(instances) if hasattr(instances, "__len__") else None
    logging.info("Preprocessed %s instance(s).", count_instances if count_instances is not None else "unknown")

    # 2) Day bounds (07:00–22:00 local)
    day_start = datetime.combine(run_date, time(7, 0), tzinfo=LONDON)
    day_end = datetime.combine(run_date, time(22, 0), tzinfo=LONDON)

    # 3) Build DataFrame for the scheduler
    tasks_df = pd.DataFrame(instances or [])

    # 4) Run the scheduler (this function should be the only writer to scheduled_tasks)
    schedule = schedule_day(
        tasks_df=tasks_df,
        day_start=day_start,
        day_end=day_end,
        supabase=sb,
        user_id=args.user,
        whitelist_template_ids=whitelist_ids,
        dry_run=args.dry_run,
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
