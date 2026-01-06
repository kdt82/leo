# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ARG VITE_LEONARDOAI_API_KEY
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_MODEL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_LEONARDOAI_API_KEY=${VITE_LEONARDOAI_API_KEY}
ENV VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}
ENV VITE_OPENAI_MODEL=${VITE_OPENAI_MODEL}

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
