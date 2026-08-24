from __future__ import annotations

from flask import Response


VERIFICATION_FILES = {
    "tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt": "tiktok-developers-site-verification=V7i98WfQ8PcGChU9hdKsWROvqzITJhdY",
    "tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt": "tiktok-developers-site-verification=zE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I",
    "tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt": "tiktok-developers-site-verification=jT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz",
}


def _response(filename: str) -> Response:
    value = VERIFICATION_FILES.get(filename)
    if value is None:
        return Response("Not found", status=404, mimetype="text/plain")
    response = Response(value, status=200, mimetype="text/plain")
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


def _add_verification_route(app, rule: str, endpoint: str, filename: str) -> None:
    # O portal do TikTok às vezes consulta o mesmo arquivo com uma barra final
    # depois de .txt. Servimos as duas formas diretamente, sem redirect.
    app.add_url_rule(rule, endpoint, lambda f=filename: _response(f), methods=["GET"])
    app.add_url_rule(rule + "/", endpoint + "_slash", lambda f=filename: _response(f), methods=["GET"])


def register_tiktok_verification(app) -> None:
    latest = "tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt"
    old_v7 = "tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt"
    old_z = "tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt"

    # Token atual nas propriedades usadas pelo app.
    _add_verification_route(app, f"/{latest}", "tt_verify_root_latest", latest)
    _add_verification_route(app, f"/terms/{latest}", "tt_verify_terms_latest", latest)
    _add_verification_route(app, f"/privacy/{latest}", "tt_verify_privacy_latest", latest)
    _add_verification_route(app, f"/api/tiktok/callback/{latest}", "tt_verify_callback_latest", latest)

    # Tokens anteriores continuam públicos porque o painel do TikTok pode
    # manter uma propriedade já iniciada e tentar validá-la novamente.
    _add_verification_route(app, f"/{old_v7}", "tt_verify_root_v7", old_v7)
    _add_verification_route(app, f"/terms/{old_v7}", "tt_verify_terms_v7", old_v7)
    _add_verification_route(app, f"/privacy/{old_v7}", "tt_verify_privacy_v7", old_v7)
    _add_verification_route(app, f"/api/tiktok/callback/{old_v7}", "tt_verify_callback_v7", old_v7)

    _add_verification_route(app, f"/{old_z}", "tt_verify_root_z", old_z)
    _add_verification_route(app, f"/terms/{old_z}", "tt_verify_terms_z", old_z)
    _add_verification_route(app, f"/privacy/{old_z}", "tt_verify_privacy_z", old_z)
    _add_verification_route(app, f"/api/tiktok/callback/{old_z}", "tt_verify_callback_z", old_z)
