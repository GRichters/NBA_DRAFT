# Servidor do Draft 100 para rodar 24 h numa máquina Linux (Oracle Cloud grátis, VPS, Fly.io...).
#   docker build -t draft100 .
#   docker run -d --restart unless-stopped -p 3000:3000 -v draft100-dados:/dados --name draft100 draft100
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/dados
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY src ./src
COPY public ./public
VOLUME /dados
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
USER node
CMD ["node", "server.js"]
