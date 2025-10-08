# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

# Make Python predictable; set timezone
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Europe/London

# OS packages (keep minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
      tzdata ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# App folder
WORKDIR /app

# 1) Install Python deps (cached when requirements don’t change)
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
 && pip install -r requirements.txt

# 2) Copy your code
COPY . .

# Safer: run as a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Start the runner
CMD ["python", "-m", "dayflow.scheduler_main"]
