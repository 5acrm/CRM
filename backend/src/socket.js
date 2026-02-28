// 用户socket连接映射: userId -> socketId
const userSockets = new Map();

function initSocket(io) {
  io.on('connection', (socket) => {
    // 用户登录后注册自己的 userId
    socket.on('register', (userId) => {
      userSockets.set(String(userId), socket.id);
    });

    socket.on('disconnect', () => {
      for (const [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(userId);
          break;
        }
      }
    });
  });
}

// 向指定用户推送通知
function sendNotification(io, userId, notification) {
  const socketId = userSockets.get(String(userId));
  if (socketId) {
    io.to(socketId).emit('notification', notification);
  }
}

module.exports = { initSocket, sendNotification };
