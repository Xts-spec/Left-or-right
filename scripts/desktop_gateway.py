from __future__ import annotations

import argparse
import multiprocessing
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the desktop application's local service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9958)
    args = parser.parse_args()
    data = Path.cwd()
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{data / 'shuihuo_killer.db'}")
    os.environ.setdefault("REPORT_DIR", str(data / "reports"))
    os.environ.setdefault("LLM_PROFILES_PATH", str(data / "model_profiles.json"))

    import uvicorn
    from services.gateway.app import app

    uvicorn.run(app, host=args.host, port=args.port, loop="asyncio", http="h11", ws="websockets")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
