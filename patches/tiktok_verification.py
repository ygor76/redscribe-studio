from __future__ import annotations

from flask import Response


VERIFICATION_FILES = {
    "tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt": "tiktok-developers-site-verification=V7i98WfQ8PcGChU9hdKsWROvqzITJhdY",
    "tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt": "tiktok-developers-site-verification=zE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I",
}


def _response(filename: str) -> Response:
    value = VERIFICATION_FILES.get(filename)
    if value is None:
        return Response("Not found", status=404, mimetype="text/plain")
    return Response(value, status=200, mimetype="text/plain")


def register_tiktok_verification(app) -> None:
    # Prefixo atual solicitado pelo TikTok Developers.
    @app.get("/api/tiktok/callback/tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")
    def tiktok_verify_callback_current():
        return _response("tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")

    # Mantém o token da tentativa anterior disponível caso o portal volte a pedi-lo.
    @app.get("/api/tiktok/callback/tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
    def tiktok_verify_callback_previous():
        return _response("tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")

    # Também expõe ambos na raiz para a verificação de prefixo do domínio base.
    @app.get("/tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")
    def tiktok_verify_root_current():
        return _response("tiktokV7i98WfQ8PcGChU9hdKsWROvqzITJhdY.txt")

    @app.get("/tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
    def tiktok_verify_root_previous():
        return _response("tiktokzE7WOzgbj6oap69bVbl0YtGj2Dnf0t7I.txt")
