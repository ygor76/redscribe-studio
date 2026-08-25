FROM node:24-alpine
RUN apk add --no-cache unzip
WORKDIR /app
COPY DuoCast_v1.7.3_CHAT_PREVIEW_REFINOS.zip /tmp/duocast.zip
RUN unzip -q /tmp/duocast.zip -d /tmp/duocast \
    && cp -R /tmp/duocast/DuoCast_v1.7.3/. /app/ \
    && rm -rf /tmp/duocast /tmp/duocast.zip
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
