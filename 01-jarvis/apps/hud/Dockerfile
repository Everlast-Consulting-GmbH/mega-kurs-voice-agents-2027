# HUD production image. Build from the repo root:
#   docker build -f apps/hud/Dockerfile --build-arg PUBLIC_BASE=https://<DEINE_DOMAIN> -t jarvis-hud .
# PUBLIC_BASE expects a reverse proxy that routes /orch to the orchestrator and /world to mock-world.
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/hud/package.json apps/hud/
COPY tools/mock-events/package.json tools/mock-events/
RUN pnpm install --frozen-lockfile --filter hud... --filter @jarvis/mock-events... --ignore-scripts
COPY packages/contracts packages/contracts
COPY apps/hud apps/hud
# The offer regression replays the real demo scenario during TypeScript checking.
COPY tools/mock-events/src/scenarios.ts tools/mock-events/src/scenarios.ts
# Public service URLs are baked in at build time (Next.js NEXT_PUBLIC_*).
ARG PUBLIC_BASE=http://localhost:3000
ENV NEXT_PUBLIC_ORCHESTRATOR_URL=${PUBLIC_BASE}/orch \
    NEXT_PUBLIC_MOCK_WORLD_URL=${PUBLIC_BASE}/world \
    NEXT_PUBLIC_VOICE_PROVIDER=elevenlabs \
    NEXT_TELEMETRY_DISABLED=1
RUN WS_BASE=$(echo "$PUBLIC_BASE" | sed -e 's#^https://#wss://#' -e 's#^http://#ws://#') \
 && NEXT_PUBLIC_EVENTS_URL="$WS_BASE/orch/events?sessionId=demo" pnpm --filter hud build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/hud/.next/standalone ./
COPY --from=build /repo/apps/hud/.next/static ./apps/hud/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/hud/server.js"]
