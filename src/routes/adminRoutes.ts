import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import z from 'zod';
import db from '../db/database';
import { request } from 'http';

export default async function adminRoutes(fastify: FastifyInstance) {

    fastify.get('/approve-users', async (request: FastifyRequest, reply: FastifyReply)=>{

        const usersNeedApprove = await db("users").where({status: 'pending'})

        reply.code(200).send(usersNeedApprove)
    })

    fastify.put('/approve-users', async (request: FastifyRequest, reply: FastifyReply) => {

        const approveUserSchema = z.object({
            id: z.number()
        })

        const { id } = approveUserSchema.parse(request.body)

        try{
            await db('users').where('id', '=', id).update({status: 'active'})

            reply.code(200)
        }catch(err){
            reply.code(500)
        }
    }) 
}
