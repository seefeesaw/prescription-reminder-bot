FROM node:18-alpine

WORKDIR /app

# Install dependencies for Sharp
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads logs

EXPOSE 3000

CMD ["npm", "start"]