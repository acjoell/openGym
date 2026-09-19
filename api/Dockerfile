FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY server.js ./
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
