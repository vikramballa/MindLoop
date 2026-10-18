# syntax=docker/dockerfile:1.7
# One image definition for both API and worker. The worker adds the `voice` extra
# (faster-whisper), keeping the API image small.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    HF_HOME=/data/models \
    PATH="/app/.venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.9.17 /uv /usr/local/bin/uv
WORKDIR /app

ARG UV_EXTRAS=""
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project ${UV_EXTRAS}

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev ${UV_EXTRAS}

RUN useradd --uid 10001 --create-home app \
    && mkdir -p /data/audio /data/models \
    && chown -R app:app /data
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2).status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*", "--no-access-log"]
