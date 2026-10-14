FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY run.js ./
CMD ["npm", "start"]
