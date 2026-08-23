FROM python:3.12-slim

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

RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements-cloud.txt

RUN mkdir -p /data/redscribe /data/cache

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 3600 --graceful-timeout 120 --keep-alive 5 --access-logfile - --error-logfile - app:app"]
