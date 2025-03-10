# Use Node.js LTS as the base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma client
RUN if [ -f prisma/schema.prisma ]; then \
      npx prisma generate; \
    else \
      echo "No Prisma schema found, skipping generation"; \
    fi

# Build TypeScript code
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]