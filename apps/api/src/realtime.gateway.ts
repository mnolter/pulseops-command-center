import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  }
})
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage("joinOrg")
  joinOrganization(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { organizationId?: string }
  ) {
    if (body.organizationId) {
      client.join(`org:${body.organizationId}`);
      client.emit("dashboard.updated", {
        type: "presence",
        organizationId: body.organizationId,
        connectedAt: new Date().toISOString()
      });
    }
  }

  emitToOrganization(organizationId: string, event: string, payload: unknown) {
    this.server?.to(`org:${organizationId}`).emit(event, payload);
  }
}
