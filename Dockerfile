FROM node:20-alpine

WORKDIR /app

# 构建前端
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 安装后端依赖
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend/ ./backend/
RUN cd backend && npx prisma generate

WORKDIR /app/backend

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "src/index.js"]
