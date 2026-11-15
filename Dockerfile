# Multi-Stage Production Dockerfile for RCPET's IMRD Chatbot
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV UV_THREADPOOL_SIZE=64

EXPOSE 3000

# Run high-performance clustered server
CMD ["node", "server.js"]

