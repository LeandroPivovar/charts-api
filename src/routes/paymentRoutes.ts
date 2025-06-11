import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';

import dotenv from 'dotenv';
dotenv.config();

export default async function paymentRoutes(fastify: FastifyInstance) {
    
    fastify.post('/', {preHandler: [fastify.authenticate]}, async (request, reply) => {
        //IMPLEMENTAR LÓGICA DE PAGAMENTO REAL
        await request.jwtVerify();

        const users = request.user.userInfos as Array<{ id: number}>;
        const user = users[0]; 

        const paymentCreateSchema = z.object({
            value: z.string(),
            description: z.string()
        })

        const {value, description} = paymentCreateSchema.parse(request.body) 

        const paymentCreate = await db('payments').insert({
            'user_id': user['id'],
            'status': 'pending',
            value,
            description
        })



        reply.code(200).send()
        

    })

      
    fastify.get('/:id', {preHandler: [fastify.authenticate]}, async (request, reply) => {
        const { id } = request.params as { id: string };

        const payment = await db('payments').select(['user_id', 'description', 'value', 'status', 'qrcode', 'external_reference', 'copy_paste']).where({id})
        const paymentById = payment[0]
        reply.code(200).send({paymentById})
    })
}
