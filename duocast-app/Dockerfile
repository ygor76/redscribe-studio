# DuoCast v1.7.3 Railway build
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache unzip
COPY part*.b64 /tmp/
RUN cat /tmp/part*.b64 > /tmp/duocast.b64
RUN base64 -d /tmp/duocast.b64 > /tmp/duocast.zip
RUN unzip -t /tmp/duocast.zip
RUN unzip -q /tmp/duocast.zip -d /tmp/duocast && cp -R /tmp/duocast/DuoCast_v1.7.3/. /app/
RUN rm -rf /tmp/duocast /tmp/duocast.zip /tmp/duocast.b64 /tmp/part*.b64
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
