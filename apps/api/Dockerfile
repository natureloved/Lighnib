FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY config ./config
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install --workspace=@lighnib/api --workspace=@lighnib/shared
RUN npm run build --workspace=@lighnib/shared
RUN npm run build --workspace=@lighnib/api
ENV API_PORT=3001 API_HOST=0.0.0.0
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
