import sqlite3
from typing import List, Dict, Any

MAX_ROWS = 100

def get_db_connection():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    return conn

def execute_read_query(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    if "INSERT" in query.upper() or "UPDATE" in query.upper() or "DELETE" in query.upper():
        raise PermissionError("Write operations not allowed in read query")
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        results = cursor.fetchmany(MAX_ROWS + 1)
        if len(results) > MAX_ROWS:
            raise ValueError(f"Result set exceeds maximum allowed rows ({MAX_ROWS})")
        return [dict(row) for row in results]
    finally:
        conn.close()

def execute_write_query(query: str, params: tuple = ()):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        conn.execute("BEGIN TRANSACTION")
        cursor.execute(query, params)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
