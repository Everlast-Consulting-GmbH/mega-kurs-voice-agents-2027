.PHONY: install gen test mock up down demo demo-stop demo-reset demo-status

install:
	pnpm install
	uv sync --all-packages --all-extras
	cd agents/jarvis && npm ci --ignore-scripts --workspaces=false

gen:
	pnpm gen

# Python suites run one by one: several services share test module names.
PY_SUITES := packages/contracts/python services/mock-world services/orchestrator services/cu-worker

test:
	pnpm -r test
	cd agents/jarvis && npm test
	@for s in $(PY_SUITES); do echo "== $$s"; uv run --all-packages pytest -q $$s || exit 1; done

# Event stream without backend (port 8787), for HUD development without keys.
mock:
	pnpm mock-events --scenario full-demo --loop

up:
	docker compose up -d --build

down:
	docker compose down

# One laptop, one command: see tools/demo.sh
demo:
	tools/demo.sh start

demo-stop:
	tools/demo.sh stop

demo-reset:
	tools/demo.sh reset

demo-status:
	tools/demo.sh status
