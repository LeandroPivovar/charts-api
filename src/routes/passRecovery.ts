import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export default async function passwordRecoveryRoutes(fastify: FastifyInstance) {
    
    fastify.get('/', {preHandler: [fastify.authenticate]}, async (request, reply) => {
        await request.jwtVerify();

        const token = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedToken = await bcrypt.hash(token, 10);

        const users = request.user.userInfos as Array<{ id: number}>;
        const user = users[0]; 

        await db('password_resets').insert({
            user_id: user.id,
            token: hashedToken,
            expires_at: new Date(Date.now() + 3600000)
        });

        reply.code(200).send(token)
        

    })

fastify.post('/', async (request, reply) => {
    try {
        const resetPasswordSchema = z.object({
            token: z.string().length(4, 'O token deve ter exatamente 4 dígitos.'),
            newPassword: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
        });

        const { token, newPassword } = resetPasswordSchema.parse(request.body);

        // Buscar possíveis tokens pendentes e não expirados
        const candidates = await db('password_resets')
            .where({ status: 'pending' })
            .andWhere('expires_at', '>', new Date());

        let validRecord = null;

        for (const candidate of candidates) {
            const isMatch = await bcrypt.compare(token, candidate.token);
            if (isMatch) {
                validRecord = candidate;
                break;
            }
        }

        if (!validRecord) {
            return reply.code(400).send({ error: 'Token inválido, expirado ou já utilizado.' });
        }

        // Pegar o user_id do registro encontrado
        const { user_id, id: resetId } = validRecord;

        // Atualizar a senha do usuário
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db('users')
            .where({ id: user_id })
            .update({ password: hashedPassword });

        // Marcar o token como usado
        await db('password_resets')
            .where({ id: resetId })
            .update({ status: 'used' });

        return reply.code(200).send({ message: 'Senha atualizada com sucesso!' });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return reply.code(400).send({ error: error.errors });
        }

        console.error(error);
        return reply.code(500).send({ error: 'Erro interno no servidor.' });
    }
});
}

      

