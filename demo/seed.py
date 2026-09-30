"""
Seed Database and Workspace Generator — PNG5 Demo

Owner: Shared Demo Resources (Member 1 / Member 2 / Member 3)

Generates demo SQLite databases and workspace directory:
- demo/prod.db (production orders, accounts, users)
- demo/staging.db (staging catalog, stats)
- demo/workspace/ (sample reports, sentinel files, test data)
"""

import os
import sqlite3
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = DEMO_DIR / "workspace"
PROD_DB = DEMO_DIR / "prod.db"
STAGING_DB = DEMO_DIR / "staging.db"


def seed_all():
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    (WORKSPACE_DIR / "reports").mkdir(parents=True, exist_ok=True)
    (WORKSPACE_DIR / "secrets").mkdir(parents=True, exist_ok=True)
    (WORKSPACE_DIR / "output").mkdir(parents=True, exist_ok=True)

    # 1. Seed Production Database (demo/prod.db)
    conn_prod = sqlite3.connect(PROD_DB)
    cur_prod = conn_prod.cursor()
    
    cur_prod.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id INTEGER PRIMARY KEY,
            customer_name TEXT NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT NOT NULL
        )
    """)
    cur_prod.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            account_id INTEGER PRIMARY KEY,
            balance REAL NOT NULL,
            tier TEXT NOT NULL
        )
    """)
    cur_prod.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)
    
    # Insert initial sample data
    cur_prod.execute("DELETE FROM orders")
    cur_prod.executemany(
        "INSERT INTO orders (order_id, customer_name, total_amount, status) VALUES (?, ?, ?, ?)",
        [
            (101, "Acme Corp", 15400.0, "pending"),
            (102, "Global Tech", 3200.5, "pending"),
            (103, "Starlight Logistics", 8900.0, "shipped"),
        ]
    )
    
    cur_prod.execute("DELETE FROM accounts")
    cur_prod.executemany(
        "INSERT INTO accounts (account_id, balance, tier) VALUES (?, ?, ?)",
        [
            (1, 500000.0, "enterprise"),
            (2, 75000.0, "standard"),
        ]
    )
    
    conn_prod.commit()
    conn_prod.close()
    print(f"[OK] Seeded Production DB: {PROD_DB}")

    # 2. Seed Staging Database (demo/staging.db)
    conn_stg = sqlite3.connect(STAGING_DB)
    cur_stg = conn_stg.cursor()
    
    cur_stg.execute("""
        CREATE TABLE IF NOT EXISTS catalog (
            item_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            stock INTEGER NOT NULL
        )
    """)
    cur_stg.execute("DELETE FROM catalog")
    cur_stg.executemany(
        "INSERT INTO catalog (item_id, name, stock) VALUES (?, ?, ?)",
        [
            (501, "Industrial Sensor A1", 120),
            (502, "Gateway Node B2", 45),
        ]
    )
    conn_stg.commit()
    conn_stg.close()
    print(f"[OK] Seeded Staging DB: {STAGING_DB}")

    # 3. Seed Workspace Files
    q3_file = WORKSPACE_DIR / "reports" / "q3.txt"
    q3_file.write_text("Q3 Financial & Operational Report\nTotal Revenue: $4.2M\nStatus: Finalized\n", encoding="utf-8")

    sentinel_file = WORKSPACE_DIR / "sentinel.txt"
    sentinel_file.write_text("PROTECTED_SENTINEL_INTEGRITY_CHECK_OK\n", encoding="utf-8")

    secret_file = WORKSPACE_DIR / "secrets" / "key.txt"
    secret_file.write_text("sk-live-confidential-api-token-998877\n", encoding="utf-8")

    print(f"[OK] Seeded Workspace Files in: {WORKSPACE_DIR}")


if __name__ == "__main__":
    seed_all()
