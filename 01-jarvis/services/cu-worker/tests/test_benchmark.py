import runpy
from pathlib import Path

benchmark = runpy.run_path(str(Path(__file__).parents[1] / "scripts" / "benchmark.py"))


def rows(mode, successes, duration=5):
    return [dict(mode=mode, success=i < successes, durationSeconds=duration) for i in range(10)]


def test_benchmark_exit_acceptance_matches_time_and_success_targets():
    meets_target = benchmark["meets_target"]
    assert meets_target(rows("pixel", 9), "pixel")
    assert not meets_target(rows("pixel", 8), "pixel")
    assert not meets_target(rows("assisted", 10, 30), "assisted")
    assert meets_target(rows("assisted", 10, 19), "assisted")
    assert not meets_target(rows("assisted", 10)[:2], "assisted")
