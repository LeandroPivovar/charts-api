import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import db from './db/database';

dotenv.config();

const fastify = Fastify();
await fastify.register(cors);



