from __future__ import annotations

import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import app as core
from flask import Response, jsonify, redirect, request, session

app = core.app

TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API_BASE = "https://open.tiktokapis.com/v2"

CLIENT_KEY = os.environ.get("TIKTOK_CLIENT_KEY", "").strip()
CLIENT_SECRET = os.environ.get("TIKTOK_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.environ.get(
    "TIKTOK_REDIRECT_URI",
    "https://redscribe-studio-production.up.railway.app/api/tiktok/callback",
).strip()
APP_ORIGIN = os.environ.get(
    "REDSCRIBE_PUBLIC_ORIGIN",
    "https://redscribe-studio-production.up.railway.app",
).rstrip("/")

SCOPES = "user.info.basic,video.upload,video.publish"


def _conn_path(user_id: str) -> Path:
    return core._user_dir(user_id) / "tiktok_connection.json"


def _load_conn(user_id: str) -> dict[str, Any]:
    path = _conn_path(user_id)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_conn(user_id: str, data: dict[str, Any]) -> None:
    path = _conn_path(user_id)
    core._atomic_write_json(path, data)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def _form_post(url: str, fields: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
    body = urllib.parse.urlencode({k: v for k, v in fields.items() if v is not None}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
            "User-Agent": "RedScribe/5.1.2",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            data = json.loads(raw)
        except Exception:
            data = {"error": "http_error", "error_description": raw[-1200:]}
        raise RuntimeError(data.get("error_description") or data.get("message") or str(data)) from exc
    data = json.loads(raw or "{}")
    if data.get("error") and not data.get("access_token"):
        err = data.get("error")
        if isinstance(err, dict):
            raise RuntimeError(err.get("message") or err.get("code") or str(err))
        raise RuntimeError(data.get("error_description") or str(err))
    return data


def _json_post(url: str, token: str, payload: dict[str, Any], timeout: int = 45) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "User-Agent": "RedScribe/5.1.2",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            data = json.loads(raw)
        except Exception:
            data = {"error": {"code": f"http_{exc.code}", "message": raw[-1200:]}}
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            raise RuntimeError(err.get("message") or err.get("code") or str(err)) from exc
        raise RuntimeError(raw[-1200:] or str(exc)) from exc
    data = json.loads(raw or "{}")
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict) and err.get("code") not in (None, "", "ok"):
        raise RuntimeError(err.get("message") or err.get("code") or str(err))
    return data


def _configured() -> bool:
    return bool(CLIENT_KEY and CLIENT_SECRET and REDIRECT_URI)


def _token_for(user_id: str) -> tuple[str, dict[str, Any]]:
    data = _load_conn(user_id)
    if not data.get("access_token"):
        raise RuntimeError("Conecte sua conta do TikTok primeiro.")
    now = int(time.time())
    expires_at = int(data.get("expires_at") or 0)
    if expires_at and expires_at > now + 300:
        return str(data["access_token"]), data
    refresh = str(data.get("refresh_token") or "")
    if not refresh:
        raise RuntimeError("A conexão do TikTok expirou. Conecte novamente.")
    refreshed = _form_post(
        TIKTOK_TOKEN_URL,
        {
            "client_key": CLIENT_KEY,
            "client_secret": CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        },
    )
    data.update(
        {
            "access_token": refreshed.get("access_token") or data.get("access_token"),
            "refresh_token": refreshed.get("refresh_token") or refresh,
            "open_id": refreshed.get("open_id") or data.get("open_id"),
            "scope": refreshed.get("scope") or data.get("scope"),
            "expires_at": now + int(refreshed.get("expires_in") or 86400),
            "refresh_expires_at": now + int(refreshed.get("refresh_expires_in") or 31536000),
            "updated_at": now,
        }
    )
    _save_conn(user_id, data)
    return str(data["access_token"]), data


def _creator_info(token: str) -> dict[str, Any]:
    return _json_post(f"{TIKTOK_API_BASE}/post/publish/creator_info/query/", token, {})


def _source_info(video_size: int) -> dict[str, Any]:
    size = max(1, int(video_size))
    if size <= 64 * 1024 * 1024:
        chunk = size
        count = 1
    else:
        chunk = 10 * 1024 * 1024
        count = max(1, size // chunk)
    return {
        "source": "FILE_UPLOAD",
        "video_size": size,
        "chunk_size": int(chunk),
        "total_chunk_count": int(count),
    }


@app.get("/api/tiktok/status")
@core.login_required
def tiktok_status():
    user = core.current_user()
    data = _load_conn(user["id"])
    return jsonify(
        {
            "ok": True,
            "configured": _configured(),
            "connected": bool(data.get("access_token")),
            "open_id": data.get("open_id"),
            "scope": data.get("scope"),
            "expires_at": data.get("expires_at"),
            "redirect_uri": REDIRECT_URI,
        }
    )


@app.get("/api/tiktok/connect")
@core.login_required
def tiktok_connect():
    if not _configured():
        return jsonify(
            {
                "error": "TikTok ainda não foi configurado no servidor. Adicione TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET no Railway."
            }
        ), 503
    state = secrets.token_urlsafe(32)
    session["tiktok_oauth_state"] = state
    params = {
        "client_key": CLIENT_KEY,
        "scope": SCOPES,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "state": state,
    }
    return redirect(TIKTOK_AUTHORIZE_URL + "?" + urllib.parse.urlencode(params))


@app.get("/api/tiktok/callback")
def tiktok_callback():
    user = core.current_user()
    if not user:
        return Response("Sessão do RedScribe não encontrada. Feche esta janela e entre novamente.", status=401, mimetype="text/plain")
    expected = str(session.pop("tiktok_oauth_state", "") or "")
    state = str(request.args.get("state") or "")
    if not expected or not secrets.compare_digest(expected, state):
        return Response("Falha de segurança no login do TikTok (state inválido).", status=400, mimetype="text/plain")
    if request.args.get("error"):
        msg = request.args.get("error_description") or request.args.get("error") or "Autorização cancelada."
        return Response(f"Não foi possível conectar ao TikTok: {msg}", status=400, mimetype="text/plain")
    code = str(request.args.get("code") or "")
    if not code:
        return Response("O TikTok não retornou o código de autorização.", status=400, mimetype="text/plain")
    try:
        token = _form_post(
            TIKTOK_TOKEN_URL,
            {
                "client_key": CLIENT_KEY,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
            },
        )
        now = int(time.time())
        saved = {
            "access_token": token.get("access_token"),
            "refresh_token": token.get("refresh_token"),
            "open_id": token.get("open_id"),
            "scope": token.get("scope"),
            "expires_at": now + int(token.get("expires_in") or 86400),
            "refresh_expires_at": now + int(token.get("refresh_expires_in") or 31536000),
            "created_at": now,
            "updated_at": now,
        }
        _save_conn(user["id"], saved)
    except Exception as exc:
        return Response(f"Falha ao concluir a conexão com o TikTok: {exc}", status=500, mimetype="text/plain")

    html = f"""<!doctype html><meta charset="utf-8"><title>TikTok conectado</title>
<style>body{{font-family:system-ui;background:#0b0b0c;color:#fff;display:grid;place-items:center;height:100vh;margin:0}}
div{{max-width:520px;padding:28px;border:1px solid #2b2b2e;border-radius:18px;background:#151517}}strong{{font-size:22px}}</style>
<div><strong>TikTok conectado ao RedScribe.</strong><p>Você já pode fechar esta janela.</p></div>
<script>
try{{ if(window.opener) window.opener.postMessage({{type:'redscribe-tiktok-connected'}}, {json.dumps(APP_ORIGIN)}); }}catch(e){{}}
setTimeout(()=>window.close(),900);
</script>"""
    return Response(html, mimetype="text/html")


@app.post("/api/tiktok/disconnect")
@core.login_required
def tiktok_disconnect():
    user = core.current_user()
    path = _conn_path(user["id"])
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
    return jsonify({"ok": True})


@app.post("/api/tiktok/creator-info")
@core.login_required
def tiktok_creator_info():
    user = core.current_user()
    if not _configured():
        return jsonify({"error": "TikTok não configurado no servidor."}), 503
    try:
        token, _ = _token_for(user["id"])
        data = _creator_info(token)
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/api/tiktok/publish/init")
@core.login_required
def tiktok_publish_init():
    user = core.current_user()
    payload = request.get_json(silent=True) or {}
    try:
        token, _ = _token_for(user["id"])
        creator = _creator_info(token)
        creator_data = creator.get("data") if isinstance(creator, dict) else {}
        options = creator_data.get("privacy_level_options") if isinstance(creator_data, dict) else []
        privacy = str(payload.get("privacy_level") or "")
        if options and privacy not in options:
            privacy = str(options[0])
        if not privacy:
            privacy = "SELF_ONLY"
        size = int(payload.get("video_size") or 0)
        if size <= 0:
            raise RuntimeError("Tamanho do vídeo inválido.")
        caption = str(payload.get("caption") or "")[:2200]
        post_info = {
            "title": caption,
            "privacy_level": privacy,
            "disable_duet": bool(payload.get("disable_duet")),
            "disable_comment": bool(payload.get("disable_comment")),
            "disable_stitch": bool(payload.get("disable_stitch")),
            "video_cover_timestamp_ms": max(0, int(payload.get("video_cover_timestamp_ms") or 1000)),
        }
        if bool(payload.get("is_aigc")):
            post_info["is_aigc"] = True
        if bool(payload.get("brand_organic_toggle")):
            post_info["brand_organic_toggle"] = True
        request_body = {"post_info": post_info, "source_info": _source_info(size)}
        data = _json_post(f"{TIKTOK_API_BASE}/post/publish/video/init/", token, request_body)
        d = data.get("data") or {}
        return jsonify(
            {
                "ok": True,
                "publish_id": d.get("publish_id"),
                "upload_url": d.get("upload_url"),
                "source_info": request_body["source_info"],
                "privacy_level": privacy,
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/api/tiktok/draft/init")
@core.login_required
def tiktok_draft_init():
    user = core.current_user()
    payload = request.get_json(silent=True) or {}
    try:
        token, _ = _token_for(user["id"])
        size = int(payload.get("video_size") or 0)
        if size <= 0:
            raise RuntimeError("Tamanho do vídeo inválido.")
        source = _source_info(size)
        data = _json_post(f"{TIKTOK_API_BASE}/post/publish/inbox/video/init/", token, {"source_info": source})
        d = data.get("data") or {}
        return jsonify({"ok": True, "publish_id": d.get("publish_id"), "upload_url": d.get("upload_url"), "source_info": source})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/api/tiktok/publish/status")
@core.login_required
def tiktok_publish_status():
    user = core.current_user()
    payload = request.get_json(silent=True) or {}
    publish_id = str(payload.get("publish_id") or "")
    if not publish_id:
        return jsonify({"error": "publish_id ausente."}), 400
    try:
        token, _ = _token_for(user["id"])
        data = _json_post(f"{TIKTOK_API_BASE}/post/publish/status/fetch/", token, {"publish_id": publish_id})
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
