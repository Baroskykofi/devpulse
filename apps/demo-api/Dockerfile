FROM node:20-alpine

WORKDIR /app

# Install curl and bash for Dynatrace OneAgent
RUN apk add --no-cache curl bash

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "index.js"]
