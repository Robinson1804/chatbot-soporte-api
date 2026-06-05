FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    node node_modules/playwright/cli.js install chromium --with-deps

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
