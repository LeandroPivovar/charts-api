import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';

import dotenv from 'dotenv';
dotenv.config();

export default async function loginRoutes(fastify: FastifyInstance) {
    
    fastify.post('/', async (request, reply) => {

        const loginUserSchema = z.object({
            mail: z.string().email(),
            password: z.string().min(6)
        })

        const {mail, password} = loginUserSchema.parse(request.body)
        const userInfos = await db("users").select(['id', 'name', 'username', 'status', 'role']).where({
            mail: mail,
            password: password,
        })

        const user = userInfos[0];
        
        if(user.status == 'pending'){
            reply.code(401).send({'error': 'Seu perfil esta sendo analisado pelos administradores'})
        }

        const token = fastify.jwt.sign({userInfos}, {expiresIn: process.env.JWT_EXPIRATION_TIME})

        reply.code(200).send(token)
    })
}
