ROOT := $(abspath ../..)
ENV := $(CURDIR)/.venv
export UV_PROJECT_ENVIRONMENT := $(ENV)
.PHONY: install run test reset

# Bootstrap only this service, without changing the shared workspace lockfile.
install:
	uv venv --allow-existing --python 3.12 $(ENV)
	uv pip install --python $(ENV)/bin/python -e $(ROOT)/packages/contracts/python -e . pytest httpx

run:
	uv run --no-sync --package jarvis-mock-world uvicorn jarvis_mock_world.app:app --host 0.0.0.0 --port 8700

test:
	uv run --no-sync --package jarvis-mock-world pytest tests -q

reset:
	curl --fail-with-body -X POST http://localhost:8700/admin/reset
