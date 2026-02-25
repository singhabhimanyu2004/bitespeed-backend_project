import { PrismaClient } from './generated/prisma';
import 'dotenv/config';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'], 
});

export default prisma;