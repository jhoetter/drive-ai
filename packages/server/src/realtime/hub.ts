import { randomUUID } from "node:crypto";

type AnyWs = { send: (d: string) => void; on: (ev: string, fn: () => void) => void; readyState: number };

export class EventHub {
  private clients = new Map<string, { ws: AnyWs; tenantId: string; userId: string }>();

  add(ws: AnyWs, tenantId: string, userId: string) {
    const id = randomUUID();
    this.clients.set(id, { ws, tenantId, userId });
    ws.on("close", () => this.clients.delete(id));
    return id;
  }

  broadcast(tenantId: string, event: { type: string; payload: unknown }) {
    const data = JSON.stringify({ ...event, ts: new Date().toISOString() });
    for (const c of this.clients.values()) {
      if (c.tenantId === tenantId && c.ws.readyState === 1) {
        c.ws.send(data);
      }
    }
  }
}
