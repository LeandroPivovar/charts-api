import { FastifyInstance } from 'fastify';
import { request } from 'http';

export default async function userRoutes(fastify: FastifyInstance) {
    fastify.get('/', {preHandler: [fastify.authenticate]}, async (request, reply) =>{
        
    })
}
