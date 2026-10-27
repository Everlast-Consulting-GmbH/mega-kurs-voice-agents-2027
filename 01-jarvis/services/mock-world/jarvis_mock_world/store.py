"""Small SQLite store: contract-validated JSON records, atomic reset and writes."""
from contextlib import contextmanager
from datetime import date
import json
from pathlib import Path
import sqlite3

from jarvis_contracts import Appointment, CalendarEvent, ChatMessage, Email, Lead, Patient

from .seed import seed_records

MODELS = dict(leads=Lead, emails=Email, events=CalendarEvent, patients=Patient, appointments=Appointment, chat=ChatMessage)


def records(db, kind):
    return [json.loads(row[0]) for row in db.execute("SELECT payload FROM records WHERE kind=? ORDER BY id", (kind,))]


def put(db, kind, value):
    value = MODELS[kind].model_validate(value).model_dump(mode="json", by_alias=True)
    db.execute("INSERT OR REPLACE INTO records VALUES (?, ?, ?)", (kind, value["id"], json.dumps(value, ensure_ascii=False)))
    return value


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self, *, write=False):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def initialize(self, today: date):
        with self.connect(write=True) as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, payload TEXT NOT NULL, PRIMARY KEY(kind, id))")
            db.execute("CREATE TABLE IF NOT EXISTS counters (kind TEXT PRIMARY KEY, value INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS history (month TEXT PRIMARY KEY, value INTEGER NOT NULL)")
            if not db.execute("SELECT 1 FROM counters LIMIT 1").fetchone():
                self._seed(db, today)

    def reset(self, today: date):
        with self.connect(write=True) as db:
            self._seed(db, today)

    def _seed(self, db, today):
        db.execute("DELETE FROM records")
        db.execute("DELETE FROM counters")
        db.execute("DELETE FROM history")
        data = seed_records(today)
        for kind, values in data.items():
            for value in values:
                put(db, kind, value)
            db.execute("INSERT INTO counters VALUES (?, ?)", (kind, 100 if kind == "appointments" else len(values)))
        # Historical pipeline snapshots are fictional seed data, not live analytics.
        month_index = today.year * 12 + today.month - 1
        for offset, value in zip(range(-5, 0), [260000, 285000, 310000, 335000, 360000]):
            year, month = divmod(month_index + offset, 12)
            db.execute("INSERT INTO history VALUES (?, ?)", (f"{year:04}-{month + 1:02}", value))

    def all(self, kind):
        with self.connect() as db:
            return records(db, kind)

    @staticmethod
    def next_id(db, kind, prefix):
        value = db.execute("UPDATE counters SET value=value+1 WHERE kind=? RETURNING value", (kind,)).fetchone()[0]
        return f"{prefix}-{value:03}"
