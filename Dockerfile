# Debian slim, not Alpine: better-sqlite3 and argon2 ship glibc prebuilds.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm COREPACK_HOME=/corepack CI=true
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
# Pin pnpm at image build time so `pnpm admin` inside the container needs no network.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable && corepack prepare --activate

FROM base AS build
# Toolchain covers a native module that has no prebuild for this Node version.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
RUN pnpm install --frozen-lockfile
COPY . .
# Build-time analysis imports the server config and opens the database, so both need a value.
# Neither ends up in the bundle: the runtime reads its own environment.
RUN SESSION_SECRET=build-only-placeholder-secret-0123456789 DATABASE_PATH=/tmp/build.db \
	FILES_DIR=/tmp/files pnpm build

FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/app.db FILES_DIR=/app/data/files
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Migrations, seed and the admin CLI run through tsx against the sources, and resolve $lib
# through the tsconfig that `svelte-kit sync` generated in the build stage.
COPY --from=build /app/.svelte-kit/tsconfig.json ./.svelte-kit/tsconfig.json
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/tsconfig.json ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN mkdir -p /app/data && chown -R node:node /app/data /corepack
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["entrypoint"]
CMD ["serve"]
