# Flaghoist as a portable container. Build once, run on any host: a VPS, Fly.io, Railway,
# DigitalOcean, Cloud Run, ECS, or Kubernetes. Configure it entirely with environment variables.
FROM node:22-alpine

WORKDIR /app

# Install the published Flaghoist packages. Copying only package.json first keeps this layer cached
# across code changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV PORT=8080
ENV FLAGS_STORAGE=memory
EXPOSE 8080

# The /health route is unauthenticated, so it makes a good container healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
