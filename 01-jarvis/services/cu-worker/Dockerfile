FROM python:3.12-slim-bookworm
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:99 PYTHONUNBUFFERED=1 \
    PRAXIS_URL=http://host.docker.internal:8700/praxis \
    CU_FRAME_DIR=/data/frames
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb openbox x11vnc novnc websockify xdotool scrot xclip \
    fonts-dejavu-core fonts-liberation supervisor x11-utils dbus-x11 tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml /app/pyproject.toml
COPY packages/contracts/python /app/packages/contracts/python
COPY services/cu-worker /app/services/cu-worker
RUN pip install --no-cache-dir uv && uv pip install --system \
    -c /app/services/cu-worker/requirements.lock \
    /app/packages/contracts/python /app/services/cu-worker pytest pytest-asyncio \
    && useradd --create-home --uid 1000 jarvis \
    && mkdir -p /data/frames /data/outbox /tmp/chromium \
    && chown -R jarvis:jarvis /data /tmp/chromium
USER jarvis
EXPOSE 8800 6080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supervisord", "-c", "/app/services/cu-worker/supervisord.conf"]
