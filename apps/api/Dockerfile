FROM node:24.19.0-bookworm-slim AS foundation
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.25.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @servicegrid/contracts build && pnpm db:generate && pnpm --filter @servicegrid/api build
ENV NODE_ENV=production
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
