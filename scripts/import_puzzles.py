#!/usr/bin/env python3
import argparse
import json
import math
import sqlite3
from pathlib import Path

try:
    import pyarrow.parquet as pq
except ImportError:
    pq = None


COLUMN_ALIASES = {
    "id": ["id", "puzzleid", "puzzle_id"],
    "fen": ["fen"],
    "moves": ["moves", "correct_moves", "solution"],
    "rating": ["rating", "elo"],
    "themes": ["themes", "theme"],
    "similar_puzzles": ["similar_puzzles", "similar", "nearest", "neighbors"],
}


def find_column(columns, key):
    normalized = {column.lower().replace("_", ""): column for column in columns}
    for alias in COLUMN_ALIASES[key]:
        match = normalized.get(alias.lower().replace("_", ""))
        if match:
            return match
    return None


def list_value(value):
    if value is None:
        return []

    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item)]

    if hasattr(value, "tolist"):
        return list_value(value.tolist())

    if isinstance(value, float) and math.isnan(value):
        return []

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if str(item)]
        except json.JSONDecodeError:
            pass
        return [part for part in stripped.replace(",", " ").split() if part]

    return [str(value)]


def rating_value(value):
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def create_schema(conn):
    conn.executescript(
        """
        DROP TABLE IF EXISTS puzzles;

        CREATE TABLE puzzles (
          id TEXT PRIMARY KEY,
          fen TEXT NOT NULL,
          moves TEXT NOT NULL,
          rating INTEGER NOT NULL DEFAULT 0,
          themes TEXT NOT NULL DEFAULT '[]',
          similar_puzzles TEXT NOT NULL DEFAULT '[]'
        );
        """
    )


def create_indexes(conn):
    conn.executescript(
        """
        CREATE INDEX idx_puzzles_rating ON puzzles(rating);
        CREATE INDEX idx_puzzles_id_rating ON puzzles(id, rating);
        """
    )


def parquet_columns(parquet_path):
    if pq is None:
        raise SystemExit("Missing Python dependency. Run: python3 -m pip install pyarrow")

    return pq.ParquetFile(parquet_path).schema_arrow.names


def iter_parquet_rows(parquet_path, columns, limit=None, batch_size=5000):
    selected_columns = sorted({column for column in columns.values() if column})
    emitted = 0

    parquet_file = pq.ParquetFile(parquet_path)
    for batch in parquet_file.iter_batches(batch_size=batch_size, columns=selected_columns):
        for row in batch.to_pylist():
            if limit and emitted >= limit:
                return
            emitted += 1
            yield row


def import_parquet(parquet_path, db_path, limit=None, batch_size=5000):
    if pq is None:
        raise SystemExit("Missing Python dependency. Run: python3 -m pip install pyarrow")

    parquet_path = Path(parquet_path).expanduser().resolve()
    db_path = Path(db_path).expanduser().resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    parquet_column_names = parquet_columns(parquet_path)

    columns = {
        key: find_column(parquet_column_names, key)
        for key in COLUMN_ALIASES
    }

    required = ["id", "fen", "moves"]
    missing = [key for key in required if not columns[key]]
    if missing:
        raise SystemExit(
            f"Missing required parquet columns: {', '.join(missing)}. Found: {', '.join(parquet_column_names)}"
        )

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        conn.execute("PRAGMA temp_store=FILE")
        create_schema(conn)
        insert_sql = """
        INSERT OR REPLACE INTO puzzles
          (id, fen, moves, rating, themes, similar_puzzles)
        VALUES (?, ?, ?, ?, ?, ?)
        """
        rows = []
        imported_count = 0

        for row in iter_parquet_rows(parquet_path, columns, limit, batch_size):
            puzzle_id = str(row[columns["id"]]).strip()
            fen = str(row[columns["fen"]]).strip()

            if not puzzle_id or not fen:
                continue

            moves = list_value(row[columns["moves"]])
            themes = list_value(row[columns["themes"]]) if columns["themes"] else []
            similar = (
                list_value(row[columns["similar_puzzles"]])
                if columns["similar_puzzles"]
                else []
            )
            rating = rating_value(row[columns["rating"]]) if columns["rating"] else 0

            rows.append(
                (
                    puzzle_id,
                    fen,
                    json.dumps(moves),
                    rating,
                    json.dumps(themes),
                    json.dumps(similar),
                )
            )

            if len(rows) >= batch_size:
                conn.executemany(insert_sql, rows)
                imported_count += len(rows)
                print(f"Imported {imported_count} puzzles...", flush=True)
                rows.clear()

        if rows:
            conn.executemany(insert_sql, rows)
            imported_count += len(rows)

        create_indexes(conn)
        conn.execute("PRAGMA optimize")
        conn.commit()

    print(f"Imported {imported_count} puzzles into {db_path}")


def main():
    parser = argparse.ArgumentParser(description="Import puzzle parquet into E4Square SQLite database.")
    parser.add_argument("parquet_path", help="Path to the source parquet file.")
    parser.add_argument(
        "--db",
        default="server/data/puzzles.db",
        help="Output SQLite database path. Defaults to server/data/puzzles.db.",
    )
    parser.add_argument("--limit", type=int, default=None, help="Optional row limit for test imports.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5000,
        help="Rows to process per parquet/sqlite batch. Defaults to 5000 to keep memory bounded.",
    )
    args = parser.parse_args()

    import_parquet(args.parquet_path, args.db, args.limit, args.batch_size)


if __name__ == "__main__":
    main()
