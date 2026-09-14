# QUIZVERSE — server image
# Runs the full product: app + REST API + AI proxy, with file storage.
#
#   docker build -t quizverse .
#   docker run -p 4317:4317 -e QV_API_SECRET=change-me -v quizverse-data:/data quizverse

FROM node:22-alpine

WORKDIR /app

# No dependencies to install: the app is plain ES modules.
COPY app ./app
COPY packages ./packages
COPY server ./server
COPY server.mjs package.json server/schema.sql ./

ENV HOST=0.0.0.0 \
    PORT=4317 \
    QV_STORAGE=file \
    QV_DATA_DIR=/data \
    NODE_ENV=production

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
