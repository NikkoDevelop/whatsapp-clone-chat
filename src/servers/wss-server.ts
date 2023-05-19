/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable sonarjs/cognitive-complexity */
import { PrismaClient } from '@prisma/client';
import { Server, IncomingMessage, ServerResponse } from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import { logger } from '../logs';

export class WSServer {
  private readonly wss: WebSocket.Server<WebSocket.WebSocket>;

  public onlineUsers: {
    userId: number;
    wsData: WebSocket.WebSocket
  }[] = [];

  constructor(args: WSServerConstructorArgs) {
    this.wss = new WebSocketServer({
      server: args.server,
      path: '/chat',
    });

    this.wss.on('connection', (ws) => {
      // Ошибка WSS Севрера

      ws.on('error', (error: any) => {
        logger.error(`WS Server error: ${JSON.stringify(error)}`);
        ws.close();
      });

      // Прослушивание сообщений в чате

      ws.on('listenMessages', async (data) => {
        data = JSON.parse(data);

        const members = await args.prisma.chat.findUnique({
          where: {
            id: data.chat.id
          },
          select: {
            members: true
          }
        });

        console.log(members);
        console.log(this.onlineUsers);

        this.onlineUsers.forEach(user => {
          if (members.members.find(x => x.id === user.userId)) {
            user.wsData.send(data);
          }
        });
      });

      // Прослушивание чатов

      ws.on('listenChats', (data) => {
        this.wss.clients.forEach((client) => {
          if (client.readyState === ws.OPEN) {
            client.send(data);
          }
        });
      });

      // Отправка сообщений

      ws.on('message', async (msg: { toString: () => string; }, info: any) => {
        const request = JSON.parse(msg.toString());

        console.log(request);

        switch (request.action) {

          /*
            Create chat function

            @params 
            {
              action: 'createChat',
              title: '<Chat Name>',
              userId: <ID>
            }
          */

          case 'createChat': {
            const chat = await args.prisma.chat.create({
              data: {
                title: request.title,
                admins: {
                  connect: {
                    id: request.userId
                  }
                },
                members: {
                  connect: {
                    id: request.userId
                  }
                }
              }
            });

            const result = { action: 'createChat', status: true, message: chat };

            const sendMSG = JSON.stringify(result);

            ws.emit('listenChats', sendMSG);

            break;
          }

          /*
            Add User to Chat function

            @params
            {
              action: 'addUserToChat',
              userId: <ID>,
              chatId: <ID>
            }
          */

          case 'addUserToChat': {
            const admin = this.onlineUsers.find(x => x.wsData === ws);

            const chat = await args.prisma.chat.findUnique({
              where: {
                id: request.chatId
              },
              include: {
                admins: true,
              }
            });

            const isAdmin = chat.admins.find(x => x.id === admin.userId);

            if (isAdmin) {
              const updatedChat = await args.prisma.chat.update({
                where: {
                  id: chat.id
                },
                data: {
                  members: {
                    connect: {
                      id: request.userId
                    }
                  }
                }
              });

              const result = { action: 'addUserToChat', status: true, message: 'User added', chat: updatedChat };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            } else {
              const result = { action: 'addUserToChat', status: false, message: 'User not added' };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            }

            break;
          }

          /*
            Connect User to chat

            @params
            {
              action: 'connectToChat',
              userId: <ID>,
              chatId: <ID>
            }
          */

          case 'connectToChat': {

            const user = await args.prisma.user.findUnique({
              where: {
                id: request.userId
              }
            })

            if (user) {
              this.onlineUsers.push({ userId: request.userId, wsData: ws });
            } else {
              const result = { action: 'connectToChat', status: false, message: 'User not finded' };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            }

            const chat = await args.prisma.chat.findUnique({
              where: {
                id: request.chatId
              },
              include: {
                admins: true,
                members: true,
                messages: {
                  include: {
                    files: true
                  }
                }
              }
            });

            if (chat) {
              const result = { action: 'connectToChat', status: true, message: 'User Connected', user, chat };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            } else {
              const result = { action: 'connectToChat', status: false, message: 'Chat not finded' };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            }

            break;
          }

          /*
            Send Message function

            @params
            {
              chatId: <ID>,
              text: <ID>,
              files: ['<URL>']
            }
          */

          case 'sendMessage': {
            const user = this.onlineUsers.find(x => x.wsData === ws);

            if (!user) {
              const result = { action: 'sendMessage', status: false, message: 'User not finded' };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            }

            const chat = await args.prisma.chat.findUnique({
              where: {
                id: request.chatId
              },
              include: {
                members: true,
              }
            });

            if (!chat.members.find(x => x.id === user.userId)) {
              const result = { action: 'sendMessage', status: false, message: 'User do not have access' };

              const sendMSG = JSON.stringify(result);

              ws.emit('listenMessages', sendMSG);
            }

            const messageData = await args.prisma.message.create({
              data: {
                chat: {
                  connect: {
                    id: chat.id
                  }
                },
                sender: {
                  connect: {
                    id: user.userId
                  }
                },
                text: request.text,
                files: {
                  createMany: request.files
                }
              }
            });

            const result = { action: 'sendMessage', status: true, message: 'Message is sended', messageData };

            const sendMSG = JSON.stringify(result);

            ws.emit('listenMessages', sendMSG);

            break;
          }

          default:
            ws.send('Wrong action');
            break;
        }
      });

      ws.on('close', (reasonCode, description) => {
        this.onlineUsers = this.onlineUsers.filter((data) => data.wsData !== ws);
        ws.close();
      });

    });

    this.wss.on('listening', () => {
      args.cb();
    });
  }
}

interface WSServerConstructorArgs {
  server: Server<typeof IncomingMessage, typeof ServerResponse>;
  prisma: PrismaClient;
  cb: () => void;
}