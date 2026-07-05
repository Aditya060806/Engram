import sqlite3
import os
import base64
import hashlib
from typing import Optional, List
from cryptography.fernet import Fernet
from models import (
    Source,
    ConflictEvent,
    ReconciliationLogEntry,
    ConfidenceHistoryEntry,
    DecaySettings,
)
from context import get_current_user

# Wrapper classes to make SQLite and PostgreSQL connections and cursors behave identically.
class DBRow:
    def __init__(self, data):
        self._data = data
        if isinstance(data, dict):
            self._is_dict = True
            self._keys = list(data.keys())
            self._values = list(data.values())
        elif hasattr(data, "keys"): # sqlite3.Row
            self._is_dict = True
            self._keys = list(data.keys())
            self._values = [data[k] for k in self._keys]
        else:
            self._is_dict = False
            self._values = list(data)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        elif self._is_dict:
            if key in self._keys:
                return self._data[key]
            # Try case-insensitive lookup
            for k in self._keys:
                if k.lower() == key.lower():
                    return self._data[k]
            raise KeyError(key)
        else:
            raise KeyError(key)

    def keys(self):
        if self._is_dict:
            return self._keys
        return []

def replace_placeholders(sql):
    result = []
    in_single_quote = False
    in_double_quote = False
    escape = False
    for char in sql:
        if escape:
            result.append(char)
            escape = False
            continue
        if char == '\\':
            result.append(char)
            escape = True
            continue
        if char == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
            result.append(char)
        elif char == '"' and not in_single_quote:
            in_double_quote = not in_double_quote
            result.append(char)
        elif char == '?' and not in_single_quote and not in_double_quote:
            result.append('%s')
        else:
            result.append(char)
    return "".join(result)

class DBCursorWrapper:
    def __init__(self, cursor, is_postgres):
        self.cursor = cursor
        self.is_postgres = is_postgres

    def execute(self, sql, parameters=None):
        if self.is_postgres:
            # Replace SQLite placeholders ? with %s safely
            sql = replace_placeholders(sql)
        if parameters is not None:
            self.cursor.execute(sql, parameters)
        else:
            self.cursor.execute(sql)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return DBRow(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [DBRow(r) for r in rows]

class DBConnectionWrapper:
    def __init__(self, conn, is_postgres):
        self.conn = conn
        self.is_postgres = is_postgres

    def cursor(self):
        if self.is_postgres:
            from psycopg2.extras import RealDictCursor
            return DBCursorWrapper(self.conn.cursor(cursor_factory=RealDictCursor), is_postgres=True)
        else:
            return DBCursorWrapper(self.conn.cursor(), is_postgres=False)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

DB_PATH = os.path.join(os.path.dirname(__file__), "engram_meta.db")

def get_db_connection():
    postgres_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    is_vercel = os.environ.get("VERCEL") == "1"
    
    if is_vercel and not postgres_url:
        raise RuntimeError(
            "DATABASE_URL or POSTGRES_URL environment variable is missing, "
            "but the application is running in a Vercel serverless environment. "
            "PostgreSQL is required in production."
        )
        
    if postgres_url:
        import psycopg2
        conn = psycopg2.connect(postgres_url)
        return DBConnectionWrapper(conn, is_postgres=True)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return DBConnectionWrapper(conn, is_postgres=False)


# Context manager for safe connection lifecycle
class _db:
    def __enter__(self):
        self.conn = get_db_connection()
        self.cursor = self.conn.cursor()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self.conn.commit()
        finally:
            self.conn.close()

    def execute(self, sql, params=None):
        return self.cursor.execute(sql, params)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()


def _ensure_user_id_column(conn, table: str):
    """Add user_id column if it doesn't exist (safe migration)."""
    allowed_tables = {"sources", "conflicts", "reconciliation_log", "confidence_history"}
    if table not in allowed_tables:
        raise ValueError(f"Unknown table: {table}")
    try:
        cursor = conn.cursor()
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except Exception:
        pass


def db_init():
    conn = get_db_connection()
    # On PostgreSQL a failing DDL statement (for example an ALTER TABLE that adds
    # a column which already exists) aborts the whole transaction, and every
    # subsequent statement then fails with InFailedSqlTransaction. SQLite does not
    # poison transactions the same way, which is why this only surfaces in
    # production. Enabling autocommit isolates each statement so a benign,
    # already-applied migration cannot break the rest of initialization.
    if conn.is_postgres:
        conn.conn.autocommit = True
    cursor = conn.cursor()
    
    # 1. Sources table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        url TEXT,
        file_path TEXT,
        content TEXT DEFAULT '',
        ingested_at TEXT NOT NULL,
        last_synced_at TEXT,
        status TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        cognee_data_id TEXT DEFAULT ''
    )
    """)
    try:
        cursor.execute("ALTER TABLE sources ADD COLUMN content TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        # Stable link from a source row to its Cognee data-item UUID, so forget()
        # can prune by exact id instead of fuzzy name matching.
        cursor.execute("ALTER TABLE sources ADD COLUMN cognee_data_id TEXT DEFAULT ''")
    except Exception:
        pass
    
    # 2. Conflicts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        old_node_summary TEXT NOT NULL,
        old_node_date TEXT NOT NULL,
        old_node_source TEXT NOT NULL,
        new_node_summary TEXT NOT NULL,
        new_node_date TEXT NOT NULL,
        new_node_source TEXT NOT NULL,
        topic TEXT NOT NULL,
        relationship TEXT NOT NULL,
        llm_confidence REAL NOT NULL,
        status TEXT NOT NULL,
        resolution_note TEXT,
        created_at TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT ''
    )
    """)
    
    # 3. Typed reconciliation log (audit trail/history of changes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reconciliation_log (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        old_summary TEXT,
        new_summary TEXT,
        source TEXT,
        created_at TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT ''
    )
    """)
    
    # 4. Confidence history tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS confidence_history (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        value_summary TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        reason TEXT NOT NULL,
        date TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT ''
    )
    """)
    
    # Migrate existing tables to add user_id column
    _ensure_user_id_column(conn, "sources")
    _ensure_user_id_column(conn, "conflicts")
    _ensure_user_id_column(conn, "reconciliation_log")
    _ensure_user_id_column(conn, "confidence_history")
    
    # Indexes for commonly queried columns
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sources_label ON sources(label)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conflicts_topic ON conflicts(topic)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conflicts_user ON conflicts(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conflicts_old_source ON conflicts(old_node_source)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conflicts_new_source ON conflicts(new_node_source)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reconciliation_log_topic ON reconciliation_log(topic)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reconciliation_log_user ON reconciliation_log(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_confidence_history_topic ON confidence_history(topic)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_confidence_history_user ON confidence_history(user_id)")

    # 5. Decay settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS decay_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        decay_start_days INTEGER NOT NULL,
        forget_threshold_days INTEGER NOT NULL
    )
    """)
    
    # 6. User AI Config table (BYOK)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_ai_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        model TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # 7. Server-side chat history (per user), so conversations survive across
    # devices and browser clears, not just localStorage.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_conversations (
        conv_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        messages TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (conv_id, user_id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id)")

    # 8. Lightweight Q&A feedback (👍/👎), stored here rather than the local Cognee
    # SDK session so the cloud-first deploy never loads the heavy pipeline for it.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qa_feedback (
        qa_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        score INTEGER,
        feedback_text TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (qa_id, user_id)
    )
    """)
    
    # Insert default decay settings if not present
    cursor.execute("SELECT COUNT(*) FROM decay_settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO decay_settings (id, decay_start_days, forget_threshold_days) VALUES (1, 60, 180)")
        
    # db_metadata for internal app tracking
    cursor.execute("CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT)")

    # Clean up any demo seed data from previous runs
    cursor.execute("DELETE FROM db_metadata WHERE key='seeded'")
    cursor.execute("DELETE FROM sources WHERE id IN ('1', '2', '3')")
    cursor.execute("DELETE FROM conflicts WHERE id IN ('1', '2', '3')")
    cursor.execute("DELETE FROM reconciliation_log WHERE id IN ('log1', 'log2', 'log3', 'log4', 'log5', 'log6', 'log7')")
    cursor.execute("DELETE FROM confidence_history WHERE id IN ('ch1', 'ch2', 'ch3', 'ch4')")

    conn.commit()
    conn.close()

# Encryption helpers for BYOK
def get_encryption_key() -> bytes:
    key_str = os.environ.get("ENGRAM_ENCRYPTION_KEY")
    if not key_str or len(key_str) < 16:
        raise RuntimeError(
            "ENGRAM_ENCRYPTION_KEY must be set to a random value of at least 16 characters. "
            "Generate one with: python -c \"import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""
        )
    try:
        return base64.urlsafe_b64encode(hashlib.sha256(key_str.encode()).digest())
    except Exception:
        raise RuntimeError("Invalid ENGRAM_ENCRYPTION_KEY format")

def encrypt_key(plain_key: str) -> str:
    f = Fernet(get_encryption_key())
    return f.encrypt(plain_key.encode()).decode()

def decrypt_key(encrypted_key: str) -> str:
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted_key.encode()).decode()

# User AI Config operations
def db_save_user_ai_config(provider: str, api_key: str, model: str):
    encrypted = encrypt_key(api_key)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO user_ai_config (id, provider, api_key_encrypted, model, updated_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            provider = excluded.provider,
            api_key_encrypted = excluded.api_key_encrypted,
            model = excluded.model,
            updated_at = excluded.updated_at
        """, (provider, encrypted, model, now))
        conn.commit()
    finally:
        conn.close()

def db_get_user_ai_config() -> Optional[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT provider, api_key_encrypted, model FROM user_ai_config WHERE id = 1")
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        decrypted = decrypt_key(row["api_key_encrypted"])
    except Exception:
        decrypted = ""
    # Self-heal: a row that no longer decrypts (e.g. ENGRAM_ENCRYPTION_KEY was
    # rotated) is unusable. Drop it and report no config so callers fall back to
    # env keys and startup can re-seed a fresh, correctly-encrypted config.
    if not decrypted:
        db_delete_user_ai_config()
        return None
    return {
        "provider": row["provider"],
        "api_key": decrypted,
        "model": row["model"]
    }

def db_delete_user_ai_config():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_ai_config WHERE id = 1")
        conn.commit()
    finally:
        conn.close()

# Sources CRUD
def db_save_source(s: Source, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO sources (id, type, label, url, file_path, ingested_at, last_synced_at, status, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status=excluded.status,
            last_synced_at=excluded.last_synced_at,
            file_path=excluded.file_path
        """, (s.id, s.type, s.label, s.url, s.filePath, s.ingestedAt, s.lastSyncedAt, s.status, user_id))
        conn.commit()
    finally:
        conn.close()

def _claim_orphaned_sources(user_id: str) -> None:
    """Assign sources with empty user_id to the given user. Runs once per user per session."""
    if not user_id:
        return
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE sources SET user_id = ? WHERE user_id = ''", (user_id,))
        conn.commit()
        cursor.execute("UPDATE conflicts SET user_id = ? WHERE user_id = ''", (user_id,))
        cursor.execute("UPDATE reconciliation_log SET user_id = ? WHERE user_id = ''", (user_id,))
        cursor.execute("UPDATE confidence_history SET user_id = ? WHERE user_id = ''", (user_id,))
        conn.commit()
    finally:
        conn.close()

def db_get_sources(user_id: str = "") -> List[Source]:
    user_id = user_id or get_current_user()
    if user_id:
        _claim_orphaned_sources(user_id)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        try:
            from datetime import datetime, timezone, timedelta
            cutoff = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
            cursor.execute("UPDATE sources SET status='ready' WHERE status='processing' AND ingested_at < ?", (cutoff,))
        except Exception:
            pass

        if user_id:
            cursor.execute("SELECT * FROM sources WHERE user_id = ? ORDER BY ingested_at DESC", (user_id,))
        else:
            cursor.execute("SELECT * FROM sources ORDER BY ingested_at DESC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [
        Source(
            id=r["id"],
            type=r["type"],
            label=r["label"],
            url=r["url"],
            filePath=r["file_path"],
            ingestedAt=r["ingested_at"],
            lastSyncedAt=r["last_synced_at"],
            status=r["status"]
        )
        for r in rows
    ]

def db_update_source_content(source_id: str, content: str, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("UPDATE sources SET content = ? WHERE id = ? AND user_id = ?", (content, source_id, user_id))
        else:
            cursor.execute("UPDATE sources SET content = ? WHERE id = ?", (content, source_id))
        conn.commit()
    finally:
        conn.close()

def db_get_source_content(source_label: str, user_id: str = "") -> Optional[str]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT content FROM sources WHERE label = ? AND user_id = ?", (source_label, user_id))
        else:
            cursor.execute("SELECT content FROM sources WHERE label = ?", (source_label,))
        row = cursor.fetchone()
    finally:
        conn.close()
    return row["content"] if row else None

def db_update_source_cognee_id(source_id: str, cognee_data_id: str, user_id: str = ""):
    """Store the Cognee data-item UUID for a source so forget() can prune by exact id."""
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("UPDATE sources SET cognee_data_id = ? WHERE id = ? AND user_id = ?", (cognee_data_id, source_id, user_id))
        else:
            cursor.execute("UPDATE sources SET cognee_data_id = ? WHERE id = ?", (cognee_data_id, source_id))
        conn.commit()
    finally:
        conn.close()

def db_get_source_cognee_id(source_id: str, user_id: str = "") -> Optional[str]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT cognee_data_id FROM sources WHERE id = ?", (source_id,))
        row = cursor.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        val = row["cognee_data_id"]
    except (KeyError, IndexError):
        return None
    return val or None

def db_delete_source(source_id: str, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT label FROM sources WHERE id=? AND user_id=?", (source_id, user_id))
        row = cursor.fetchone()
        if row:
            label = row["label"]

            cursor.execute("SELECT DISTINCT topic FROM conflicts WHERE (old_node_source=? OR new_node_source=?) AND user_id=?", (label, label, user_id))
            topics = [r["topic"] for r in cursor.fetchall()]

            cursor.execute("DELETE FROM conflicts WHERE (old_node_source=? OR new_node_source=?) AND user_id=?", (label, label, user_id))
            cursor.execute("DELETE FROM reconciliation_log WHERE source=? AND user_id=?", (label, user_id))

            if topics:
                placeholders = ",".join("?" for _ in topics)
                cursor.execute(f"DELETE FROM confidence_history WHERE topic IN ({placeholders}) AND user_id=?", topics + [user_id])

        cursor.execute("DELETE FROM sources WHERE id=? AND user_id=?", (source_id, user_id))

        cursor.execute("SELECT COUNT(*) FROM sources WHERE user_id=?", (user_id,))
        if cursor.fetchone()[0] == 0:
            cursor.execute("DELETE FROM conflicts WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM reconciliation_log WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM confidence_history WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM db_metadata WHERE key='seeded'")

        conn.commit()
    finally:
        conn.close()

# Conflicts CRUD
def db_save_conflict(c: ConflictEvent, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO conflicts (
            id, old_node_summary, old_node_date, old_node_source,
            new_node_summary, new_node_date, new_node_source,
            topic, relationship, llm_confidence, status, resolution_note, created_at, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status=excluded.status,
            resolution_note=excluded.resolution_note
        """, (
            c.id, c.oldNodeSummary, c.oldNodeDate, c.oldNodeSource,
            c.newNodeSummary, c.newNodeDate, c.newNodeSource,
            c.topic, c.relationship, c.llmConfidence, c.status, c.resolutionNote, c.createdAt, user_id
        ))
        conn.commit()
    finally:
        conn.close()

def db_get_conflicts(include_resolved: bool = True, user_id: str = "") -> List[ConflictEvent]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            if include_resolved:
                cursor.execute("SELECT * FROM conflicts WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
            else:
                cursor.execute("SELECT * FROM conflicts WHERE status='pending' AND user_id = ? ORDER BY created_at DESC", (user_id,))
        else:
            if include_resolved:
                cursor.execute("SELECT * FROM conflicts ORDER BY created_at DESC")
            else:
                cursor.execute("SELECT * FROM conflicts WHERE status='pending' ORDER BY created_at DESC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [
        ConflictEvent(
            id=r["id"],
            oldNodeSummary=r["old_node_summary"],
            oldNodeDate=r["old_node_date"],
            oldNodeSource=r["old_node_source"],
            newNodeSummary=r["new_node_summary"],
            newNodeDate=r["new_node_date"],
            newNodeSource=r["new_node_source"],
            topic=r["topic"],
            relationship=r["relationship"],
            llmConfidence=r["llm_confidence"],
            status=r["status"],
            resolutionNote=r["resolution_note"],
            createdAt=r["created_at"]
        )
        for r in rows
    ]

def db_get_distinct_users() -> List[str]:
    """Return every distinct non-empty user_id that owns reconcilable memory.
    Used by the scheduled maintenance job so decay runs for all users, not just
    the caller. Unions conflicts + confidence_history so a user is covered even
    if one table is empty."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id FROM conflicts WHERE user_id != '' "
            "UNION SELECT user_id FROM confidence_history WHERE user_id != ''"
        )
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [r["user_id"] for r in rows if r["user_id"]]


# Reconciliation Log CRUD
def db_save_reconciliation_log_entry(e: ReconciliationLogEntry, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO reconciliation_log (id, event_type, topic, old_summary, new_summary, source, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (e.id, e.eventType, e.topic, e.oldSummary, e.newSummary, e.source, e.createdAt, user_id))
        conn.commit()
    finally:
        conn.close()

def db_get_reconciliation_log(topic: Optional[str] = None, user_id: str = "") -> List[ReconciliationLogEntry]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            if topic:
                cursor.execute("SELECT * FROM reconciliation_log WHERE topic=? AND user_id=? ORDER BY created_at DESC", (topic, user_id))
            else:
                cursor.execute("SELECT * FROM reconciliation_log WHERE user_id=? ORDER BY created_at DESC", (user_id,))
        else:
            if topic:
                cursor.execute("SELECT * FROM reconciliation_log WHERE topic=? ORDER BY created_at DESC", (topic,))
            else:
                cursor.execute("SELECT * FROM reconciliation_log ORDER BY created_at DESC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [
        ReconciliationLogEntry(
            id=r["id"],
            eventType=r["event_type"],
            topic=r["topic"],
            oldSummary=r["old_summary"],
            newSummary=r["new_summary"],
            source=r["source"],
            createdAt=r["created_at"]
        )
        for r in rows
    ]

# Confidence History CRUD
def db_save_confidence_history_entry(e: ConfidenceHistoryEntry, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO confidence_history (id, topic, value_summary, confidence_score, reason, date, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (e.id, e.topic, e.valueSummary, e.confidenceScore, e.reason, e.date, user_id))
        conn.commit()
    finally:
        conn.close()

def db_get_confidence_history(topic: Optional[str] = None, user_id: str = "") -> List[ConfidenceHistoryEntry]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            if topic:
                cursor.execute("SELECT * FROM confidence_history WHERE topic=? AND user_id=? ORDER BY date ASC", (topic, user_id))
            else:
                cursor.execute("SELECT * FROM confidence_history WHERE user_id=? ORDER BY date ASC", (user_id,))
        else:
            if topic:
                cursor.execute("SELECT * FROM confidence_history WHERE topic=? ORDER BY date ASC", (topic,))
            else:
                cursor.execute("SELECT * FROM confidence_history ORDER BY date ASC")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [
        ConfidenceHistoryEntry(
            id=r["id"],
            topic=r["topic"],
            valueSummary=r["value_summary"],
            confidenceScore=r["confidence_score"],
            reason=r["reason"],
            date=r["date"]
        )
        for r in rows
    ]

def db_get_distinct_topics(user_id: str = "") -> List[str]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
            SELECT topic FROM confidence_history WHERE user_id=?
            UNION
            SELECT topic FROM reconciliation_log WHERE user_id=?
            UNION
            SELECT topic FROM conflicts WHERE user_id=?
            ORDER BY topic
            """, (user_id, user_id, user_id))
        else:
            cursor.execute("""
            SELECT topic FROM confidence_history
            UNION
            SELECT topic FROM reconciliation_log
            UNION
            SELECT topic FROM conflicts
            ORDER BY topic
            """)
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [r["topic"] for r in rows]

def db_get_timeline_topics(user_id: str = "") -> List[str]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT DISTINCT topic FROM confidence_history WHERE user_id=? ORDER BY topic", (user_id,))
        else:
            cursor.execute("SELECT DISTINCT topic FROM confidence_history ORDER BY topic")
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [r["topic"] for r in rows]

# Decay Settings CRUD
def db_get_decay_settings() -> DecaySettings:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT decay_start_days, forget_threshold_days FROM decay_settings WHERE id=1")
        row = cursor.fetchone()
    finally:
        conn.close()
    return DecaySettings(
        decayStartDays=row["decay_start_days"],
        forgetThresholdDays=row["forget_threshold_days"]
    )

def db_update_decay_settings(s: DecaySettings):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE decay_settings
        SET decay_start_days=?, forget_threshold_days=?
        WHERE id=1
        """, (s.decayStartDays, s.forgetThresholdDays))
        conn.commit()
    finally:
        conn.close()

def db_reseed(user_id: str = ""):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM db_metadata WHERE key='seeded'")
        if user_id:
            cursor.execute("DELETE FROM sources WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM conflicts WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM reconciliation_log WHERE user_id=?", (user_id,))
            cursor.execute("DELETE FROM confidence_history WHERE user_id=?", (user_id,))
        else:
            cursor.execute("DELETE FROM sources")
            cursor.execute("DELETE FROM conflicts")
            cursor.execute("DELETE FROM reconciliation_log")
            cursor.execute("DELETE FROM confidence_history")
        conn.commit()
    finally:
        conn.close()
    db_init()


def db_seed_demo(user_id: str = ""):
    """Populate a rich, illustrative demo dataset for the given user.

    Seeds sources, contradictions (pending + resolved), a reconciliation log,
    and confidence history so Graph, Resolve, Ask, and Recap all show something
    meaningful without a live ingest.
    """
    import uuid as _uuid
    from datetime import datetime, timezone, timedelta

    user_id = user_id or get_current_user()
    now = datetime.now(timezone.utc)

    def days_ago(n: int) -> str:
        return (now - timedelta(days=n)).isoformat()

    def sid() -> str:
        return "demo_" + _uuid.uuid4().hex[:10]

    # ── Sources ──
    sources = [
        Source(id=sid(), type="github", label="acme/payments-api", url="https://github.com/acme/payments-api",
               filePath=None, ingestedAt=days_ago(6), lastSyncedAt=days_ago(6), status="ready"),
        Source(id=sid(), type="pdf", label="Q3 Architecture Decisions.pdf", url=None,
               filePath=None, ingestedAt=days_ago(4), lastSyncedAt=days_ago(4), status="ready"),
        Source(id=sid(), type="conversation", label="ChatGPT — Auth Brainstorm", url=None,
               filePath=None, ingestedAt=days_ago(9), lastSyncedAt=days_ago(9), status="ready"),
        Source(id=sid(), type="article", label="PostgreSQL vs SQLite at Scale", url="https://example.com/pg-vs-sqlite",
               filePath=None, ingestedAt=days_ago(12), lastSyncedAt=days_ago(12), status="ready"),
    ]
    for s in sources:
        db_save_source(s, user_id=user_id)

    # ── Conflicts (2 pending, 1 resolved) ──
    conflicts = [
        ConflictEvent(
            id=sid(), topic="Primary Database",
            oldNodeSummary="SQLite is enough for our scale", oldNodeDate=days_ago(12), oldNodeSource="PostgreSQL vs SQLite at Scale",
            newNodeSummary="Migrate to PostgreSQL + PGVector for scale and hybrid search", newNodeDate=days_ago(4), newNodeSource="Q3 Architecture Decisions.pdf",
            relationship="supersedes", llmConfidence=0.90, status="pending", resolutionNote=None, createdAt=days_ago(4),
        ),
        ConflictEvent(
            id=sid(), topic="Auth Strategy",
            oldNodeSummary="Client-side session checks are fine for now", oldNodeDate=days_ago(9), oldNodeSource="ChatGPT — Auth Brainstorm",
            newNodeSummary="Enforce a server-side shared-secret proxy gate", newNodeDate=days_ago(6), newNodeSource="acme/payments-api",
            relationship="supersedes", llmConfidence=0.88, status="pending", resolutionNote=None, createdAt=days_ago(6),
        ),
        ConflictEvent(
            id=sid(), topic="Deployment Target",
            oldNodeSummary="Deploy to a single Docker VPS", oldNodeDate=days_ago(20), oldNodeSource="PostgreSQL vs SQLite at Scale",
            newNodeSummary="Move to Vercel serverless + managed Postgres", newNodeDate=days_ago(4), newNodeSource="Q3 Architecture Decisions.pdf",
            relationship="contradicts", llmConfidence=0.82, status="resolved_keep_new", resolutionNote="Serverless fits the traffic profile better.", createdAt=days_ago(4),
        ),
    ]
    for c in conflicts:
        db_save_conflict(c, user_id=user_id)

    # ── Reconciliation log ──
    logs = [
        ReconciliationLogEntry(id=sid(), eventType="new_decision", topic="Primary Database",
                               oldSummary=None, newSummary="PostgreSQL + PGVector", source="Q3 Architecture Decisions.pdf", createdAt=days_ago(4)),
        ReconciliationLogEntry(id=sid(), eventType="new_decision", topic="Auth Strategy",
                               oldSummary=None, newSummary="Server-side shared-secret proxy gate", source="acme/payments-api", createdAt=days_ago(6)),
        ReconciliationLogEntry(id=sid(), eventType="changed", topic="Deployment Target",
                               oldSummary="Single Docker VPS", newSummary="Vercel serverless + managed Postgres", source="Q3 Architecture Decisions.pdf", createdAt=days_ago(4)),
        ReconciliationLogEntry(id=sid(), eventType="added", topic="Payments", oldSummary=None,
                               newSummary="Stripe webhook handling ingested from repo", source="acme/payments-api", createdAt=days_ago(6)),
    ]
    for e in logs:
        db_save_reconciliation_log_entry(e, user_id=user_id)

    # ── Confidence history ──
    history = [
        ConfidenceHistoryEntry(id=sid(), topic="Primary Database", valueSummary="SQLite is enough", confidenceScore=0.70, reason="initial_ingest", date=days_ago(12)),
        ConfidenceHistoryEntry(id=sid(), topic="Primary Database", valueSummary="PostgreSQL + PGVector", confidenceScore=0.90, reason="reinforced", date=days_ago(4)),
        ConfidenceHistoryEntry(id=sid(), topic="Auth Strategy", valueSummary="Client-side session", confidenceScore=0.65, reason="initial_ingest", date=days_ago(9)),
        ConfidenceHistoryEntry(id=sid(), topic="Auth Strategy", valueSummary="Server-side proxy gate", confidenceScore=0.88, reason="reinforced", date=days_ago(6)),
        ConfidenceHistoryEntry(id=sid(), topic="Deployment Target", valueSummary="Single Docker VPS", confidenceScore=0.60, reason="initial_ingest", date=days_ago(20)),
        ConfidenceHistoryEntry(id=sid(), topic="Deployment Target", valueSummary="Single Docker VPS", confidenceScore=0.12, reason="decay_tick", date=days_ago(4)),
        ConfidenceHistoryEntry(id=sid(), topic="Deployment Target", valueSummary="Vercel serverless", confidenceScore=0.82, reason="reinforced", date=days_ago(4)),
    ]
    for h in history:
        db_save_confidence_history_entry(h, user_id=user_id)


# ── Server-side chat history CRUD ──
def db_save_conversation(conv_id: str, title: str, messages_json: str, user_id: str = ""):
    from datetime import datetime, timezone
    user_id = user_id or get_current_user()
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO chat_conversations (conv_id, user_id, title, messages, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(conv_id, user_id) DO UPDATE SET
            title=excluded.title,
            messages=excluded.messages,
            updated_at=excluded.updated_at
        """, (conv_id, user_id, title, messages_json, now))
        conn.commit()
    finally:
        conn.close()


def db_list_conversations(user_id: str = "") -> List[dict]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT conv_id, title, updated_at FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        )
        rows = cursor.fetchall()
    finally:
        conn.close()
    return [{"id": r["conv_id"], "title": r["title"], "updatedAt": r["updated_at"]} for r in rows]


def db_get_conversation(conv_id: str, user_id: str = "") -> Optional[str]:
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT messages FROM chat_conversations WHERE conv_id = ? AND user_id = ?",
            (conv_id, user_id),
        )
        row = cursor.fetchone()
    finally:
        conn.close()
    return row["messages"] if row else None


def db_delete_conversation(conv_id: str, user_id: str = ""):
    user_id = user_id or get_current_user()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM chat_conversations WHERE conv_id = ? AND user_id = ?",
            (conv_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()


# ── Q&A feedback CRUD ──
def db_save_qa_feedback(qa_id: str, score: Optional[int], feedback_text: Optional[str], user_id: str = ""):
    from datetime import datetime, timezone
    user_id = user_id or get_current_user()
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO qa_feedback (qa_id, user_id, score, feedback_text, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(qa_id, user_id) DO UPDATE SET
            score=excluded.score,
            feedback_text=excluded.feedback_text,
            created_at=excluded.created_at
        """, (qa_id, user_id, score, feedback_text, now))
        conn.commit()
    finally:
        conn.close()
