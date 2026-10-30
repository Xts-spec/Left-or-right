from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    argparse.ArgumentParser(description="Build the desktop application's bundled local service.").parse_args()
    args = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
        "--name", "left-or-right-gateway",
        "--distpath", str(ROOT / "desktop" / "backend"),
        "--workpath", str(ROOT / "output" / "backend-build"),
        "--specpath", str(ROOT / "output" / "backend-build"),
        "--paths", str(ROOT),
        "--collect-submodules", "services", "--collect-submodules", "libs",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.asyncio",
        "--hidden-import", "uvicorn.protocols.http.h11_impl",
        "--hidden-import", "uvicorn.protocols.websockets.websockets_impl",
        "--hidden-import", "uvicorn.lifespan.on",
        "--exclude-module", "tkinter", "--exclude-module", "IPython",
        "--exclude-module", "pytest",
    ]
    for directory in ["prompts", "db", "services/report_service/templates", "services/aigc_detect_service/templates"]:
        args.extend(["--add-data", f"{ROOT / directory}:{directory}"])
    args.append(str(ROOT / "scripts" / "desktop_gateway.py"))
    subprocess.run(args, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
