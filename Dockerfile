FROM node:20-alpine

# Build React frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Install backend dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy backend + legacy frontend
COPY . .

EXPOSE 3100
CMD ["sh", "-c", "node migrate.js && node server.js"]
