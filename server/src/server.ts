
import { WebSocketServer } from "ws";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import express from "express";
import cors from "cors";
import { Repo } from "@automerge/automerge-repo";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5174",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

const wss = new WebSocketServer({ noServer: true });

const repo = new Repo({
  // ??
  // @ts-ignore
  network: [new NodeWSServerAdapter(wss)],
});
const handle = repo.create();

app.get("/document-id", (_req, res) => {
  res.json({ documentId: handle.documentId });
});

const server = app.listen(8080, () =>
  console.log("HTTP server listening on port 8080")
);

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
