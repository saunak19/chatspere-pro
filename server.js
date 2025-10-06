#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

// Use environment variable for port (important for deployment)
const PORT = process.env.PORT || 8080;

// HTTP server to serve HTML pages and static files
const server = http.createServer((req, res) => {
  let filePath;

  // Serve different pages based on URL
  if (req.url === "/" || req.url === "/login.html") {
    filePath = path.join(__dirname, "login.html");
  } else if (req.url === "/chat.html") {
    filePath = path.join(__dirname, "chat.html");
  } else if (req.url === "/favicon.ico") {
    // Handle favicon request
    res.writeHead(204);
    res.end();
    return;
  } else {
    // Serve other static files (CSS, JS, etc.)
    filePath = path.join(__dirname, req.url);
  }

  // Get file extension for proper Content-Type
  const extname = path.extname(filePath);
  let contentType = "text/html";

  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".json":
      contentType = "application/json";
      break;
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
      contentType = "image/jpg";
      break;
    case ".ico":
      contentType = "image/x-icon";
      break;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not found");
      } else {
        res.writeHead(500);
        res.end("Error loading file");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Map to track clients and usernames
const clients = new Map();

// Broadcast to all clients INCLUDING sender
function broadcastToAll(data) {
  clients.forEach((_, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Broadcast to all clients EXCEPT sender
function broadcast(data, excludeWs = null) {
  clients.forEach((_, client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Broadcast user list to all clients
function broadcastUserList() {
  const userList = Array.from(clients.values());
  const userCount = clients.size;

  clients.forEach((_, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "userList",
          users: userList.map((username) => ({ username })),
          count: userCount,
        })
      );
    }
  });
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "login") {
        // Store username
        clients.set(ws, data.username);

        // Send welcome message to the new user
        ws.send(
          JSON.stringify({
            type: "system",
            message: `Welcome, ${data.username}!`,
            userCount: clients.size,
          })
        );

        // Broadcast join message to all other clients
        broadcast(
          {
            type: "system",
            message: `${data.username} joined the chat`,
            userCount: clients.size,
          },
          ws
        );

        // Send updated user list to all clients
        broadcastUserList();
      }

      if (data.type === "message") {
        const username = clients.get(ws) || "Anonymous";

        // Broadcast message to ALL clients INCLUDING sender
        broadcastToAll({
          type: "chat",
          username,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
      }

      if (data.type === "getUsers") {
        // Send current user list to requesting client
        const userList = Array.from(clients.values()).map((username) => ({
          username,
        }));
        ws.send(
          JSON.stringify({
            type: "userList",
            users: userList,
            count: clients.size,
          })
        );
      }

      if (data.type === "activity") {
        // Update user activity
        console.log(`User activity: ${data.username}`);
      }

      if (data.type === "videoCall") {
        // Broadcast video call events to all other users
        const username = clients.get(ws) || "Anonymous";
        broadcast(
          {
            type: "videoCall",
            action: data.action,
            username: username,
          },
          ws
        );
      }

      if (data.type === "screenShare") {
        // Broadcast screen share events to all other users
        const username = clients.get(ws) || "Anonymous";
        broadcast(
          {
            type: "screenShare",
            action: data.action,
            username: username,
          },
          ws
        );
      }
    } catch (e) {
      console.error("Error parsing message", e);
    }
  });

  ws.on("close", () => {
    const username = clients.get(ws);
    if (username) {
      // Broadcast leave message to all other clients
      broadcast({
        type: "system",
        message: `${username} left the chat`,
        userCount: clients.size - 1,
      });

      clients.delete(ws);

      // Send updated user list to all clients
      broadcastUserList();
    }
    console.log("Client disconnected");
  });

  ws.on("error", (err) => console.error("Socket error:", err));
});

server.listen(PORT, "192.168.1.72", () => {
  console.log(`ChatSphere Pro server running at http://192.168.1.72:${PORT}`);
});
