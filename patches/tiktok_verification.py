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
    return Response(value, status=200, mimetype="text/plain")


def register_tiktok_verification(app) -> None:
    # Token atual. O TikTok pode pedir o mesmo arquivo em prefixos diferentes
    # (Web, Termos e Privacidade), então servimos o arquivo exatamente em cada um.
    current = "tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt"

    @app.get("/tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt")
    def tiktok_verify_root_latest():
        return _response(current)

    @app.get("/terms/tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt")
    def tiktok_verify_terms_latest():
        return _response(current)

    @app.get("/privacy/tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt")
    def tiktok_verify_privacy_latest():
        return _response(current)

    # Também deixa o token atual no prefixo do callback, caso o portal peça
    # verificação específica da URI de redirecionamento.
    @app.get("/api/tiktok/callback/tiktokjT54QMeEfFhqu4P8Z0ITHDO3gzkMUjxz.txt")
    def tiktok_verify_callback_latest():
        return _response(current)

    # Mantém as verificações anteriores disponíveis por compatibilidade.
    @app.get("/api/tiktok/callback/tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")
    def tiktok_verify_callback_current():
        return _response("tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")

    @app.get("/api/tiktok/callback/tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
    def tiktok_verify_callback_previous():
        return _response("tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")

    @app.get("/tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")
    def tiktok_verify_root_current():
        return _response("tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")

    @app.get("/tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
    def tiktok_verify_root_previous():
        return _response("tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
