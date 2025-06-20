import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import { FastifyReply, FastifyRequest } from '../../node_modules/fastify/fastify';

export default async function adminRoutes(fastify: FastifyInstance) {
  
  // Schema para login
  const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
  });
  fastify.get('/admin', (request: FastifyRequest, reply: FastifyReply) => {
  return reply.sendFile('admin.html') // serve public/admin.html
});

  fastify.post('/login', async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Dados inválidos' });
    }
    const { username, password } = parseResult.data;

    if (
      username === process.env.ADMIN_USER &&
      password === process.env.ADMIN_PASS
    ) {
      return { token: 'admin-token-supersecreto' };
    }

    return reply.code(401).send({ error: 'Credenciais inválidas' });
  });

  fastify.get('/users', async (req, reply) => {
    const token = req.headers.authorization;
    if (token !== 'admin-token-supersecreto') {
      return reply.code(403).send({ error: 'Acesso não autorizado' });
    }

    const users = await db('users').select('id', 'name', 'mail', 'status', 'created_at');
    return { users };
  });

  // Schema para atualização de status
  const statusSchema = z.object({
    status: z.enum(['active', 'inactive', 'pending']),
  });

  fastify.post('/users/:id/status', async (req, reply) => {
    const token = req.headers.authorization;
    if (token !== 'admin-token-supersecreto') {
      return reply.code(403).send({ error: 'Acesso não autorizado' });
    }

    const { id } = req.params as { id: string };
    const parseResult = statusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Status inválido' });
    }
    const { status } = parseResult.data;

    const affectedRows = await db('users').where({ id }).update({ status });
    if (affectedRows === 0) {
      return reply.code(404).send({ error: 'Usuário não encontrado' });
    }

    return { success: true };
  });
}
