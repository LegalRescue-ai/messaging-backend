import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinChannel')
  handleJoinChannel(client: any, channelUrl: string) {
    client.join(channelUrl);
    return { event: 'joinedChannel', data: channelUrl };
  }

  @SubscribeMessage('leaveChannel')
  handleLeaveChannel(client: any, channelUrl: string) {
    client.leave(channelUrl);
    return { event: 'leftChannel', data: channelUrl };
  }
}
