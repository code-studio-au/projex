FROM node:24-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm run build

FROM base AS prod-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/scripts/start-server.mjs ./scripts/start-server.mjs
COPY --from=build /app/scripts/env-file.mjs ./scripts/env-file.mjs
COPY --from=build /app/scripts/node-runtime.mjs ./scripts/node-runtime.mjs

EXPOSE 3000

USER node

CMD ["node", "--import", "tsx", "scripts/start-server.mjs"]
