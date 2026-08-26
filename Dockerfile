FROM python:3.12-slim

# RedScribe Publish Hub 5.2.8 - Studio media bridge + TikTok
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    XDG_CACHE_HOME=/data/cache \
    HF_HOME=/data/cache/huggingface \
    REDSCRIBE_DATA_ROOT=/data/redscribe

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl unzip ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && ln -sf /usr/local/bin/deno /usr/bin/deno

WORKDIR /app

# Mantém o RedScribe original intacto. O pacote-fonte é apenas extraído no build.
COPY RedScribe_Studio_5.0.0_Railway_Original.zip /tmp/redscribe.zip
RUN unzip -q /tmp/redscribe.zip -d /tmp/redscribe-src \
    && cp -a /tmp/redscribe-src/RedScribe_Studio_5.0.0_Railway_Original/. /app/ \
    && rm -rf /tmp/redscribe.zip /tmp/redscribe-src

# Ponte híbrida + publicação TikTok + finalização/mídia segura do Estúdio.
COPY patches/local_bridge.js /app/static/local_bridge.js
COPY patches/tiktok_publish.js /app/static/tiktok_publish.js
COPY patches/publish_hub.js /app/static/publish_hub.js
COPY patches/studio_finish_patch.js /app/static/studio_finish_patch.js
COPY patches/tiktok_cloud.py /app/tiktok_cloud.py
COPY patches/tiktok_verification.py /app/tiktok_verification.py

# Registra apenas as rotas públicas dos arquivos de verificação do TikTok.
RUN printf '\nfrom tiktok_verification import register_tiktok_verification\nregister_tiktok_verification(app)\n' >> /app/tiktok_cloud.py

RUN python -c "from pathlib import Path; p=Path('/app/templates/dashboard.html'); s=p.read_text(encoding='utf-8'); marker='<script src=\"/static/dashboard.js?v=5.0.5\"></script>'; bridge='<script src=\"/static/local_bridge.js?v=5.2.8\"></script>'; s=s if 'local_bridge.js' in s else s.replace(marker, bridge+'\\n'+marker); p.write_text(s, encoding='utf-8')"
RUN python -c "from pathlib import Path; p=Path('/app/templates/dashboard.html'); s=p.read_text(encoding='utf-8'); marker='<script src=\"/static/studio.js?v=4.0.0\"></script>'; tiktok='<script src=\"/static/tiktok_publish.js?v=5.1.2\"></script>\\n<script src=\"/static/publish_hub.js?v=5.2.5\"></script>'; s=s if 'publish_hub.js' in s else s.replace(marker, marker+'\\n'+tiktok); p.write_text(s, encoding='utf-8')"
RUN python -c "from pathlib import Path; p=Path('/app/templates/dashboard.html'); s=p.read_text(encoding='utf-8'); marker='</body>'; patch='<script src=\"/static/studio_finish_patch.js?v=5.2.8\"></script>'; s=s if 'studio_finish_patch.js' in s else s.replace(marker, patch+'\\n'+marker); p.write_text(s, encoding='utf-8')"

RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements-cloud.txt

RUN mkdir -p /data/redscribe /data/cache

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 3600 --graceful-timeout 120 --keep-alive 5 --access-logfile - --error-logfile - tiktok_cloud:app"]