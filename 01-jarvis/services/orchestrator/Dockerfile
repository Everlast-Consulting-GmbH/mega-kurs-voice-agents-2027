FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY packages/contracts /app/packages/contracts
COPY services/orchestrator /app/services/orchestrator
RUN pip install --no-cache-dir /app/packages/contracts/python /app/services/orchestrator \
    && useradd --create-home jarvis
ENV JARVIS_CONTRACTS_DIR=/app/packages/contracts HOST=0.0.0.0
USER jarvis
EXPOSE 8787
CMD ["jarvis-orchestrator"]
