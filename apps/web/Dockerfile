FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY config ./config
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm install --workspace=@lighnib/web --workspace=@lighnib/shared
RUN npm run build --workspace=@lighnib/shared
RUN npm run build --workspace=@lighnib/web
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@lighnib/web"]
