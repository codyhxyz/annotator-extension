interface SessionInfo {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

export class PageRoom implements DurableObject {
  private sessions: Map<WebSocket, SessionInfo> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const displayName = url.searchParams.get('displayName') || 'Anonymous';
    const avatarUrl = url.searchParams.get('avatarUrl') || '';

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.sessions.set(server, { userId, displayName, avatarUrl });

    // Send current presence to the joiner
    server.send(JSON.stringify({
      type: 'presence:state',
      users: this.getActiveUsers(),
    }));

    // Notify others
    this.broadcast({
      type: 'presence:join',
      user: { userId, displayName, avatarUrl },
      users: this.getActiveUsers(),
    }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    const session = this.sessions.get(ws);
    if (!session) return;

    try {
      const msg = JSON.parse(message);

      switch (msg.type) {
        case 'annotation:create':
        case 'annotation:update':
        case 'annotation:delete':
          // Fan out to all other clients on this page
          this.broadcast({
            ...msg,
            userId: session.userId,
            displayName: session.displayName,
          }, ws);
          break;

        case 'cursor:move':
          this.broadcast({
            type: 'cursor:move',
            userId: session.userId,
            position: msg.position,
          }, ws);
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket) {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);

    if (session) {
      this.broadcast({
        type: 'presence:leave',
        userId: session.userId,
        users: this.getActiveUsers(),
      });
    }
  }

  async webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  private broadcast(msg: object, exclude?: WebSocket) {
    const payload = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
      if (ws !== exclude) {
        try {
          ws.send(payload);
        } catch {
          this.sessions.delete(ws);
        }
      }
    }
  }

  private getActiveUsers() {
    const seen = new Set<string>();
    const users: SessionInfo[] = [];
    for (const session of this.sessions.values()) {
      if (!seen.has(session.userId)) {
        seen.add(session.userId);
        users.push(session);
      }
    }
    return users;
  }
}
