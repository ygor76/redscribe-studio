from __future__ import annotations

from flask import Response


VERIFICATION_FILES = {
    # Verificações antigas mantidas por compatibilidade.
    "tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt": "tiktok-developers-site-verification=V7i98WfQ8PcGChU9hdKsWROvqzITJhdY",
    "tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt": "tiktok-developers-site-verification=zE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I",
    "tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt": "tiktok-developers-site-verification=jT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz",

    # Verificações atuais geradas pelo TikTok Developers.
    "tiktokbl64I8gSc2X5fCx0hIeF63QmPYhoIeMl.txt": "tiktok-developers-site-verification=bl64I8gSc2X5fCx0hIeF63QmPYhoIeMl",
    "tiktokNmvl0IsLw65It3fFoe42yj06bqdiGWvo.txt": "tiktok-developers-site-verification=Nmvl0IsLw65It3fFoe42yj06bqdiGWvo",
    "tiktokJXY8G34o9OXVuWI36DcFmGWwuXo96qTK.txt": "tiktok-developers-site-verification=JXY8G34o9OXVuWI36DcFmGWwuXo96qTK",
}


def _response(filename: str) -> Response:
    value = VERIFICATION_FILES.get(filename)
    if value is None:
        return Response("Not found", status=404, mimetype="text/plain")
    response = Response(value, status=200, mimetype="text/plain")
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


def _add_verification_route(app, rule: str, endpoint: str, filename: str) -> None:
    # Aceita a URL exata e também uma barra final, sem redirect.
    app.add_url_rule(rule, endpoint, lambda f=filename: _response(f), methods=["GET"])
    app.add_url_rule(rule + "/", endpoint + "_slash", lambda f=filename: _response(f), methods=["GET"])


def register_tiktok_verification(app) -> None:
    # Arquivos atuais — cada um somente no prefixo solicitado pelo portal.
    terms_file = "tiktokbl64I8gSc2X5fCx0hIeF63QmPYhoIeMl.txt"
    privacy_file = "tiktokNmvl0IsLw65It3fFoe42yj06bqdiGWvo.txt"
    web_file = "tiktokJXY8G34o9OXVuWI36DcFmGWwuXo96qTK.txt"

    _add_verification_route(app, f"/terms/{terms_file}", "tt_verify_terms_20260824", terms_file)
    _add_verification_route(app, f"/privacy/{privacy_file}", "tt_verify_privacy_20260824", privacy_file)
    _add_verification_route(app, f"/{web_file}", "tt_verify_web_20260824", web_file)

    # Verificações anteriores continuam públicas para não quebrar propriedades
    # antigas que ainda possam aparecer no painel do TikTok.
    old_latest = "tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt"
    old_v7 = "tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt"
    old_z = "tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt"

    _add_verification_route(app, f"/{old_latest}", "tt_verify_root_old_latest", old_latest)
    _add_verification_route(app, f"/terms/{old_latest}", "tt_verify_terms_old_latest", old_latest)
    _add_verification_route(app, f"/privacy/{old_latest}", "tt_verify_privacy_old_latest", old_latest)
    _add_verification_route(app, f"/api/tiktok/callback/{old_latest}", "tt_verify_callback_old_latest", old_latest)

    _add_verification_route(app, f"/{old_v7}", "tt_verify_root_v7", old_v7)
    _add_verification_route(app, f"/terms/{old_v7}", "tt_verify_terms_v7", old_v7)
    _add_verification_route(app, f"/privacy/{old_v7}", "tt_verify_privacy_v7", old_v7)
    _add_verification_route(app, f"/api/tiktok/callback/{old_v7}", "tt_verify_callback_v7", old_v7)

    _add_verification_route(app, f"/{old_z}", "tt_verify_root_z", old_z)
    _add_verification_route(app, f"/terms/{old_z}", "tt_verify_terms_z", old_z)
    _add_verification_route(app, f"/privacy/{old_z}", "tt_verify_privacy_z", old_z)
    _add_verification_route(app, f"/api/tiktok/callback/{old_z}", "tt_verify_callback_z", old_z)
