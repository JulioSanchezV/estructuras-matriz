"""Persistent pre-dispatch reservations. The database never receives a submission."""
import re
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass

class Refused(RuntimeError):
    pass

@dataclass(frozen=True)
class Limits:
    global_max: int
    user_day_max: int
    user_day_calls: int
    global_calls: int

class Ledger:
    def __init__(self, path):
        self.path = str(path)
        with closing(self.connect()) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL);
                INSERT OR IGNORE INTO control VALUES (1,0);
                CREATE TABLE IF NOT EXISTS totals (scope TEXT, period INTEGER, used INTEGER NOT NULL,
                    calls INTEGER NOT NULL, PRIMARY KEY (scope,period));
                CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, created INTEGER NOT NULL);
            """)
    def connect(self):
        return sqlite3.connect(self.path, timeout=3, isolation_level=None)
    def enable(self, flag):
        with closing(self.connect()) as db:
            db.execute("UPDATE control SET enabled=? WHERE id=1",(int(bool(flag)),))
    def reserve(self, actor, request_id, amount, limits, now=None):
        if not re.fullmatch(r"[a-f0-9]{32}", request_id) or not re.fullmatch(r"[a-f0-9]{32,64}",actor):
            raise Refused("Identificador de sesión o intento no válido.")
        if any(type(n) is not int or n < 1 for n in (amount,limits.global_max,limits.user_day_max,limits.user_day_calls,limits.global_calls)):
            raise Refused("No hay un presupuesto válido.")
        stamp = int(time.time() if now is None else now); day = stamp // 86400
        with closing(self.connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                if not db.execute("SELECT enabled FROM control WHERE id=1").fetchone()[0]:
                    raise Refused("El consumo está detenido.")
                # Idempotency tokens use a short window. Course totals survive expiry and restart.
                db.execute("DELETE FROM requests WHERE created < ?",(stamp-86400,))
                db.execute("DELETE FROM totals WHERE scope!='course' AND period < ?",(day-1,))
                if db.execute("SELECT 1 FROM requests WHERE id=?",(request_id,)).fetchone():
                    raise Refused("Ese intento ya se ha procesado. No se repite automáticamente.")
                for scope,period,cap,count in (("course",0,limits.global_max,limits.global_calls),(actor,day,limits.user_day_max,limits.user_day_calls)):
                    row = db.execute("SELECT used,calls FROM totals WHERE scope=? AND period=?",(scope,period)).fetchone() or (0,0)
                    if row[0]+amount > cap or row[1]+1 > count:
                        raise Refused("Se alcanzó el límite autorizado. No se inició la revisión.")
                    db.execute("INSERT INTO totals VALUES(?,?,?,1) ON CONFLICT(scope,period) DO UPDATE SET used=used+excluded.used,calls=calls+1",(scope,period,amount))
                db.execute("INSERT INTO requests VALUES(?,?)",(request_id,stamp))
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise
    def status(self):
        with closing(self.connect()) as db:
            return db.execute("SELECT enabled FROM control WHERE id=1").fetchone()[0]
