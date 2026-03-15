FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
EXPOSE 3100
CMD ["sh", "-c", "node migrate.js && node server.js"]
