FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY config ./config
COPY packages ./packages
COPY apps/api ./apps/api
# Full install (not workspace-scoped): typescript lives in the ROOT
# devDependencies and both workspace builds (tsc -b) need it on PATH.
# A workspace-scoped install skips the root devDeps and the builds
# fail with "tsc: not found" (CI run 44880625355).
RUN npm ci
RUN npm run build --workspace=@lighnib/shared
RUN npm run build --workspace=@lighnib/api
ENV API_PORT=3001 API_HOST=0.0.0.0
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
