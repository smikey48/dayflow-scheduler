# dayflow/scheduler_main.py
import os, sys, logging
from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Optional, Any

from dayflow.planner import preprocess_recurring_tasks, schedule_day
LONDON = ZoneInfo("Europe/London")
try:
    # Supabase SDK
    from supabase import create_client  # type: ignore
except Exception:
    create_client = None  # type: ignore
def should_run_now(now: datetime | None = None) -> bool:
    now = now or datetime.now(LONDON)
    return now.time() >= time(7, 0)
if not should_run_now():
    print("[scheduler] Run-gate: before 07:00 Europe/London — exiting.")
    sys.exit(0)
    # in main(), early:


def main() -> int:
    # --- Logging & timezone ---

    tz_name = os.getenv("TZ", "Europe/London")
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO"), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logging.info("DayFlow scheduler runner starting (tz=%s)", tz_name)

    # --- Optional: connect to Supabase if env vars are present ---
    sb: Optional[Any] = None
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")

    if url and key and create_client:
        try:
            sb = create_client(url, key)
            logging.info("Supabase client created.")
        except Exception as e:
            logging.exception("Supabase client init failed: %s", e)
            return 1
    else:
        logging.info("Supabase URL/key not set yet (or SDK not installed) — skipping connection.")

    # --- Orchestration ---
    # --- Orchestration ---
    import pandas as pd  # add this import at the top if not present

    now_local = datetime.now(ZoneInfo(tz_name))
    run_date = now_local.date()
    logging.info("Run date = %s", run_date)

    instances = preprocess_recurring_tasks(run_date=run_date, supabase=sb)
    logging.info("Preprocessed %s instance(s)",
                len(instances) if hasattr(instances, "__len__") else "unknown")

    # >>> NEW: day bounds (local)
    day_start = datetime.combine(run_date, time(7, 0), tzinfo=LONDON)
    day_end   = datetime.combine(run_date, time(22, 0), tzinfo=LONDON)

    # >>> NEW: make a DataFrame for schedule_day
    tasks_df = pd.DataFrame(instances or [])

    # >>> NEW: envs for schedule_day
    test_user_id = os.getenv("TEST_USER_ID")
    dry_run = str(os.getenv("DRY_RUN", "false")).lower() in ("1", "true", "yes", "on")
    whitelist_env = os.getenv("TEMPLATE_WHITELIST")
    whitelist_ids = set(x.strip() for x in whitelist_env.split(",")) if whitelist_env else None

    schedule = schedule_day(
        tasks_df=tasks_df,
        day_start=day_start,
        day_end=day_end,
        supabase=sb,
        user_id=test_user_id,
        whitelist_template_ids=whitelist_ids,
        dry_run=dry_run,
    )
    logging.info("Scheduled %s item(s)", len(schedule) if hasattr(schedule, "__len__") else "unknown")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logging.exception("Runner crashed")
        sys.exit(1)


