# HEMU.UZ — bitta konteyner (API + frontend)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4700 DB_FILE=/data/movexgo.db UPLOAD_DIR=/data/uploads
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY seed.js ./
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown -R app:app /data
USER app
VOLUME ["/data"]
EXPOSE 4700
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4700/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
