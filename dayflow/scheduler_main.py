# dayflow/scheduler_main.py
import os, sys, logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, Any

from dayflow.planner import preprocess_recurring_tasks, schedule_day

try:
    # Supabase SDK
    from supabase import create_client  # type: ignore
except Exception:
    create_client = None  # type: ignore


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
    now_local = datetime.now(ZoneInfo(tz_name))
    run_date = now_local.date()
    logging.info("Run date = %s", run_date)

    instances = preprocess_recurring_tasks(run_date=run_date, supabase=sb)
    logging.info("Preprocessed %s instance(s)",
                 len(instances) if hasattr(instances, "__len__") else "unknown")

    schedule = schedule_day(instances=instances, run_date=run_date, supabase=sb)
    logging.info("Scheduled %s item(s)",
                 len(schedule) if hasattr(schedule, "__len__") else "unknown")

    logging.info("DayFlow scheduler runner finished OK.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logging.exception("Runner crashed")
        sys.exit(1)


