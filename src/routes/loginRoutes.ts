import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import z from 'zod';
import db from '../db/database';

import dotenv from 'dotenv';
dotenv.config();

export default async function loginRoutes(fastify: FastifyInstance) {
    
    fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {

        const loginUserSchema = z.object({
            mail: z.string().email(),
            password: z.string().min(6)
        });

        const { mail, password } = loginUserSchema.parse(request.body);

        const userInfos = await db("users").select(['id', 'name', 'username', 'status', 'role', 'password']).where({ mail });

        if (userInfos.length === 0) {
            return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
        }

        const user = userInfos[0];

        if (user.password !== password) {
            return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
        }

        if (user.status === 'pending') {
            return reply.code(401).send({ error: 'Seu perfil está sendo analisado pelos administradores' });
        }

        const { password: _, ...userWithoutPassword } = user;

        const token = fastify.jwt.sign({ user: userWithoutPassword }, { expiresIn: process.env.JWT_EXPIRATION_TIME });

        return reply.code(200).send({ token });
    });
}
