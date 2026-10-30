from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test a native bundled desktop service.")
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--web-root", required=True, type=Path)
    options = parser.parse_args()
    binary, web = options.binary.resolve(), options.web_root.resolve()
    if not binary.is_file() or not (web / "settings.html").is_file():
        parser.error("A built native executable and its web resource directory are required.")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with tempfile.TemporaryDirectory(prefix="left-or-right-验收-") as directory:
        data = Path(directory)
        env = {
            **os.environ,
            "ZUOYOU_WEB_ROOT": str(web),
            "DATABASE_URL": f"sqlite:///{(data / 'smoke.db').as_posix()}",
            "REPORT_DIR": str(data / "reports"),
            "LLM_PROFILES_PATH": str(data / "profiles.json"),
            "GATEWAY_API_KEY": "",
            "LLM_PROVIDER": "mock",
            "LLM_MODEL": "smoke-model",
            "LLM_BASE_URL": "",
            "LLM_API_KEY": "",
            "ASR_PROVIDER": "stub",
            "RATE_LIMIT_ENABLED": "false",
        }
        with (data / "process.log").open("wb") as log:
            child = subprocess.Popen(
                [str(binary), "--host", "127.0.0.1", "--port", str(port)],
                cwd=data,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            try:
                deadline = time.monotonic() + 60
                ready = False
                while time.monotonic() < deadline and child.poll() is None:
                    try:
                        with opener.open(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                            ready = json.load(response).get("service") == "shuihuo-killer-gateway"
                        if ready:
                            break
                    except OSError:
                        pass
                    time.sleep(0.2)
                if not ready:
                    raise RuntimeError("The bundled local service did not become healthy.")
                for route in ("/", "/settings", "/modules/settings.css", "/api/ui/settings"):
                    with opener.open(f"http://127.0.0.1:{port}{route}", timeout=5) as response:
                        assert response.status == 200, route
                with opener.open(f"http://127.0.0.1:{port}/api/config/llm/profiles", timeout=5) as response:
                    profiles = json.load(response)
                    assert all(not profile.get("llm_api_key_configured") for profile in profiles["profiles"])
                print(json.dumps({"native_bundle_smoke": "passed", "isolated_user_data": True, "settings_available": True}))
            finally:
                if child.poll() is None:
                    child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)


if __name__ == "__main__":
    main()
