# 市场研究驾驶舱 — 全栈一体化镜像
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
# 运行期需写 server/data/(现货/OpenRouter 历史积累), 降权前建好并授权
RUN mkdir -p /app/server/data && chown -R node:node /app/server
USER node
EXPOSE 3000
CMD ["node", "server/index.cjs"]
