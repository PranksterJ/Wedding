# 基础 Node 镜像
FROM node:20-alpine

WORKDIR /app

# 拷贝核心文件
COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY web-preview ./web-preview
COPY database ./database

# 暴露端口
ENV PORT=3200
EXPOSE 3200

# 启动服务
CMD ["node", "server.js"]
