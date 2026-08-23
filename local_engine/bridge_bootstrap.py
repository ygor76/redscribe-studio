from __future__ import annotations

import logging
import os
import shutil
import socket
import threading
import time
import webbrowser
from pathlib import Path

# Tudo pesado e persistente fica no computador do usuário.
_local_app_data = os.environ.get("LOCALAPPDATA")
if _local_app_data:
    _root = Path(_local_app_data) / "RedScribe"
else:
    _root = Path.home() / "AppData" / "Local" / "RedScribe"

_data_root = _root / "data"
_cache_root = _root / "cache"
_log_root = _root / "logs"
for _folder in (_data_root, _cache_root, _log_root):
    _folder.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("REDSCRIBE_DATA_ROOT", str(_data_root))
os.environ.setdefault("HF_HOME", str(_cache_root / "huggingface"))
os.environ.setdefault("XDG_CACHE_HOME", str(_cache_root))
os.environ.setdefault("WHISPER_DEVICE", "cpu")
os.environ.setdefault("WHISPER_COMPUTE_TYPE", "int8")

logging.basicConfig(
    filename=str(_log_root / "local_engine.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

import app as core  # noqa: E402
from flask import jsonify, request  # noqa: E402

LOCAL_USER_ID = "redscribe-local-engine"
LOCAL_WEB_URL = os.environ.get(
    "REDSCRIBE_WEB_URL",
    "https://redscribe-studio-production.up.railway.app",
).rstrip("/")


def _ensure_local_user() -> dict:
    accounts = core._load_accounts()
    user = next((u for u in accounts if u.get("id") == LOCAL_USER_ID), None)
    if user:
        return user
    now = int(time.time())
    user = {
        "id": LOCAL_USER_ID,
        "name": "RedScribe Local",
        "email": "local-engine@redscribe.invalid",
        "password_hash": "",
        "created_at": now,
        "last_login_at": now,
        "access_mode": "full",
        "plan": "preview",
        "shorts_quota": None,
        "plan_expires_at": None,
    }
    accounts.append(user)
    core._save_accounts(accounts)
    return user


_LOCAL_USER = _ensure_local_user()

# Os endpoints originais continuam iguais; apenas a identidade vem do helper local.
def _local_current_user() -> dict:
    return _LOCAL_USER


core.current_user = _local_current_user


def _allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True
    origin = origin.rstrip("/")
    if origin == LOCAL_WEB_URL:
        return True
    return origin in {
        "http://127.0.0.1:8765",
        "http://localhost:8765",
        "http://127.0.0.1",
        "http://localhost",
    }


@core.app.before_request
def _bridge_guard():
    origin = request.headers.get("Origin")
    if origin and not _allowed_origin(origin):
        return jsonify({"error": "Origem não autorizada pelo RedScribe Local Engine."}), 403
    if request.method == "OPTIONS":
        response = core.app.make_default_options_response()
        return response
    return None


@core.app.after_request
def _bridge_cors(response):
    origin = request.headers.get("Origin")
    if origin and _allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Cache-Control, X-Requested-With"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        # Chrome/Edge modernos fazem preflight de acesso da web pública ao loopback.
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
    return response


@core.app.get("/bridge/health")
def bridge_health():
    usage = shutil.disk_usage(_data_root)
    return jsonify(
        {
            "ok": True,
            "engine": "RedScribe Local Engine",
            "version": "5.1.0-hybrid",
            "data_root": str(_data_root),
            "free_bytes": int(usage.free),
            "total_bytes": int(usage.total),
        }
    )


@core.app.get("/bridge/info")
def bridge_info():
    return jsonify(
        {
            "ok": True,
            "web_url": LOCAL_WEB_URL,
            "data_root": str(_data_root),
            "log_file": str(_log_root / "local_engine.log"),
        }
    )


def _port_is_free(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def main() -> None:
    host = "127.0.0.1"
    port = int(os.environ.get("REDSCRIBE_LOCAL_PORT", "8765"))
    logging.info("Iniciando RedScribe Local Engine em %s:%s", host, port)
    logging.info("Dados locais: %s", _data_root)

    if not _port_is_free(host, port):
        logging.info("A porta %s já está em uso; assumindo que o engine já está aberto.", port)
        try:
            webbrowser.open(LOCAL_WEB_URL)
        except Exception:
            pass
        return

    if os.environ.get("REDSCRIBE_OPEN_WEB", "1") != "0":
        threading.Timer(1.2, lambda: webbrowser.open(LOCAL_WEB_URL)).start()

    # O servidor fica restrito ao loopback: nenhum outro computador da rede consegue acessá-lo.
    core.app.run(host=host, port=port, threaded=True, use_reloader=False, debug=False)


if __name__ == "__main__":
    main()
