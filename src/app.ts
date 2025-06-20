import fastify from 'fastify'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv';
import routes from './router'
import cors from '@fastify/cors';
dotenv.config();

const server = fastify()

server.register(jwt, {
  secret: 'supersecretkey'
})

server.register(cors, {
  origin: '*'
});

server.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    console.log(err)
    reply.code(401).send({ error: 'Token inválido ou ausente' })
  }
})

server.register(routes);

server.listen({ port: Number(process.env.SERVER_PORT || 8080), host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server listening at ${address}`)
})