import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import Express from 'express';

import { logger } from './logs';
import { SERVER_HOST, SERVER_PORT } from './configs';
import { WSServer } from './servers/wss-server';

const app = Express();

const server = createServer(app);

const start = async () => {
  try {
    const prisma = new PrismaClient();

    const wsServer = new WSServer({
      server,
      prisma,
      cb: () => {
        logger.info('WSServer started...');
      },
    });

    server.listen(Number(SERVER_PORT), SERVER_HOST, () => {
      logger.info(`Server started at http://${SERVER_HOST}:${SERVER_PORT}`);
    });
  } catch (error) {
    logger.error(`Unable to connect the server: ${error}`);

    throw new Error(error as string);
  }
};

start();