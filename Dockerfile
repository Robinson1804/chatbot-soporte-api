FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    node_modules/.bin/playwright install chromium --with-deps

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
