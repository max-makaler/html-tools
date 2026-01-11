# --- ЭТАП 1: Сборка (Build) ---
FROM node:20-alpine AS builder

# Устанавливаем инструменты сборки
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# Собираем все зависимости, включая native-модули (better-sqlite3)
RUN npm install --production

# --- ЭТАП 2: Финальный образ (Production) ---
FROM node:20-alpine

WORKDIR /app

# Копируем только папку node_modules из первого образа
COPY --from=builder /app/node_modules ./node_modules
# Копируем остальные исходники
COPY . .

# Создаем папку для базы
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]