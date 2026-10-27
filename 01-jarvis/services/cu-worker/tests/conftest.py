def pytest_configure(config):
    # The root workspace also discovers these tests without this service's pyproject.
    config.addinivalue_line("markers", "desktop: requires the Linux desktop container")
    config.addinivalue_line("markers", "live: requires an Anthropic key and Praxis-App")
