FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY packages/contracts/python /app/packages/contracts/python
COPY services/mock-world/pyproject.toml /app/services/mock-world/pyproject.toml
COPY services/mock-world/jarvis_mock_world /app/services/mock-world/jarvis_mock_world
RUN pip install --no-cache-dir /app/packages/contracts/python /app/services/mock-world \
    && useradd --create-home jarvis \
    && mkdir -p /app/data && chown jarvis:jarvis /app/data
USER jarvis
ENV MOCK_WORLD_DB=/app/data/world.sqlite
EXPOSE 8700
CMD ["uvicorn", "jarvis_mock_world.app:app", "--host", "0.0.0.0", "--port", "8700"]
