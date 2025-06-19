import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/userController';

export default async function userRoutes(fastify: FastifyInstance) {
    const userController = new UserController();
    fastify.get('/', {preHandler: [fastify.authenticate]}, userController.getAllUsers)

    fastify.get('/:id', {preHandler: [fastify.authenticate]}, userController.getUserById)

    fastify.post('/', userController.createUser)

    fastify.put('/',{preHandler: [fastify.authenticate]}, userController.editUser)
}
