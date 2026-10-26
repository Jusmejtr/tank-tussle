FROM node:22-alpine
LABEL org.opencontainers.image.source=https://github.com/matej-podzemny/tank-tussle
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
ENV PORT=8090
EXPOSE 8090
USER node
CMD ["node", "server.js"]
