import { FastifyInstance } from 'fastify';
import userRoutes from './routes/userRoutes';
import loginRoutes from './routes/loginRoutes';
import adminRoutes from './routes/adminRoutes';
import paymentRoutes from './routes/paymentRoutes';
import passwordRecoveryRoutes from './routes/passRecovery';
import geminiRoute from './routes/geminiRoutes';
import extensionRoutes from './routes/extensionRoutes';

export default async function routes(fastify: FastifyInstance) {
  fastify.register(userRoutes, { prefix: '/user' });
  fastify.register(loginRoutes, { prefix: '/login'});
  fastify.register(adminRoutes, { prefix: '/admin'});
  fastify.register(paymentRoutes, {prefix: '/payment'})
  fastify.register(geminiRoute, {prefix: '/analyze-image'})
  fastify.register(passwordRecoveryRoutes, {prefix : 'password-recovery'})
  fastify.register(extensionRoutes, {prefix : '/extension'})

}
