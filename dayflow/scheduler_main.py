# dayflow/scheduler_main.py
import os, sys, logging
from datetime import datetime
from zoneinfo import ZoneInfo

try:
    # Supabase SDK (we'll add it to requirements in the next step)
    from supabase import create_client
except Exception:
    create_client = None  # We'll still allow the script to run without it for now.

def main():
    # --- Logging & timezone ---
    tz_name = os.getenv("TZ", "Europe/London")
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO"), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logging.info("DayFlow scheduler runner starting (tz=%s)", tz_name)

    # --- Optional: connect to Supabase if env vars are present ---
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")

    if url and key and create_client:
        try:
            sb = create_client(url, key)
            # quick ping: list schemas (cheap metadata call via PostgREST)
            logging.info("Supabase client created.")
        except Exception as e:
            logging.exception("Supabase client init failed: %s", e)
            return 1
    else:
        logging.info("Supabase URL/key not set yet (or SDK not installed) — skipping connection.")

    # --- Placeholder for your real work ---
    now_local = datetime.now(ZoneInfo(tz_name))
    logging.info("Runner heartbeat at %s", now_local.strftime("%Y-%m-%d %H:%M:%S"))

    # You will later import and call:
    # from dayflow.planner import preprocess_recurring_tasks, schedule_day
    # instances = preprocess_recurring_tasks(run_date=now_local.date(), supabase=sb)
    # schedule  = schedule_day(instances=instances, run_date=now_local.date(), supabase=sb)

    logging.info("DayFlow scheduler runner finished OK.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logging.exception("Runner crashed")
        sys.exit(1)
