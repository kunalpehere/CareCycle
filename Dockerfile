# Set NODE_IMAGE to an approved immutable digest when recording a hosted release.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node index.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
ENV NODE_ENV=production
ENV PORT=4000
USER node
EXPOSE 4000
STOPSIGNAL SIGTERM
CMD ["node", "index.js"]
