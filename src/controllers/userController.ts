import { FastifyRequest, FastifyReply } from 'fastify';
import db from '../db/database';
import { z } from 'zod';
import { createUser } from '../useCases/users/createUser';
import { editUser } from '../useCases/users/editUser';

export class UserController {
    async getAllUsers(request: FastifyRequest, reply: FastifyReply) {
        await request.jwtVerify();

        const users = request.user.userInfos as Array<{ id: number; role: string }>;
        const user = users[0]; 

        if (user.role != '1') {
            return reply.code(403).send({ error: "Acesso negado: apenas administradores podem acessar esta rota." });
        }

        try {
            const result = await db("users").select("*");
            reply.code(200).send(result);
        } catch (error) {
            reply.code(500).send({ error: "Erro ao buscar usuários." });
        }
    }

    async getUserById(request: FastifyRequest, reply: FastifyReply){
        const { id } = request.params as { id: string };

        const userId = parseInt(id, 10);

        if (isNaN(userId)) {
            return reply.code(400).send({ error: 'ID inválido' });
        }

        try {
            const user = await db("users").select(['id', 'mail', 'username', 'status', 'balance']).where({ id: userId }).first();

            if (!user) {
                return reply.code(404).send({ error: 'Usuário não encontrado' });
            }

            reply.code(200).send(user);
        } catch (error) {
            reply.code(500).send({ error: 'Erro ao buscar usuário' });
        }
    }

    async createUser(request: FastifyRequest, reply: FastifyReply){
        const createUserSchema = z.object({
            name: z.string().min(3),
            mail: z.string().email(),
            password: z.string().min(6),
            username: z.string()
        })

        const {name, mail, password, username} = createUserSchema.parse(request.body)

        const createUserResult = await createUser({name, mail, password, username})
        
        const {code, error} = createUserResult

        reply.code(code).send({error})
    }

    async editUser(request: FastifyRequest, reply: FastifyReply){
        const createUserSchema = z.object({
            id: z.string(),
            name: z.string().min(3),
            mail: z.string().email(),
            password: z.string().min(6),
            username: z.string()
        })

        const {id, name, mail, password, username} = createUserSchema.parse(request.body)

        const editUserResult = await editUser({id, name, mail, password, username})
        
        const {code, error} = editUserResult

        reply.code(code).send({error})
    }

}