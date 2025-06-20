import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import fetch from 'node-fetch';

export default async function extensionRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    // 1. Schema de validação com mensagens claras
    const schema = z.object({
      email: z.string().email({ message: 'E-mail inválido' }),
      password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
      image: z.string()
        .min(100, { message: 'Imagem muito pequena (mínimo 100 caracteres)' })
        .refine((val) => {
          const base64Data = val.includes(',') ? val.split(',')[1] : val;
          return /^[A-Za-z0-9+/=]+$/.test(base64Data);
        }, { message: 'Formato Base64 inválido' })
    });

    try {
      // 2. Validação dos dados de entrada
      const { email, password, image } = schema.parse(request.body);

      // 3. Autenticação do usuário
      const user = await db('users')
        .where({ mail: email, password, status: 'active' })
        .first();

      if (!user) {
        return reply.code(401).send({ 
          error: 'Falha na autenticação',
          details: 'Verifique seu e-mail e senha' 
        });
      }

      // 4. Pré-processamento da imagem
      const [header, base64Data] = image.includes(',') 
        ? image.split(',') 
        : ['data:image/png;base64', image];
      
      const mimeType = header.split(';')[0].replace('data:', '');

      // 5. Verificação adicional da imagem
      if (base64Data.length < 1024) { // 1KB mínimo recomendado
        console.warn('Imagem muito pequena pode causar erros no Gemini');
      }

      // 6. Configuração do prompt de análise
      const prompt = `Analise este gráfico e retorne um JSON com: {
        "action": "COMPRA|VENDA|NEUTRO", 
        "confidence": 0-100,
        "levels": {"support": [], "resistance": []}
      }`.trim();

      // 7. Processamento com Gemini
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { 
                  inlineData: {
                    mimeType: mimeType || 'image/png', // Usa o tipo detectado ou padrão PNG
                    data: base64Data
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1000
            }
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        // Tratamento específico para erros do Gemini
        if (result.error?.message.includes('Provided image is not valid')) {
          return reply.code(400).send({
            error: 'Imagem inválida para análise',
            details: 'O Gemini não conseguiu processar esta imagem. Por favor, envie uma imagem mais clara do gráfico.',
            solution: 'Tire um novo print ou aumente a qualidade da imagem'
          });
        }
        throw new Error(`Gemini API error: ${result.error?.message || 'Unknown error'}`);
      }

      // 8. Processamento da resposta
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Resposta vazia do Gemini');
      }

      try {
        const jsonMatch = text.match(/(?:```json\s*)?({[\s\S]+?})(?:\s*```)?/i);
        const jsonString = jsonMatch ? jsonMatch[1] : text;
        const analysisResult = JSON.parse(jsonString);
        
        return reply.send(analysisResult);
        
      } catch (parseError) {
        console.error('Falha ao parsear resposta:', text);
        throw new Error(`Resposta da IA em formato inválido: ${text.substring(0, 100)}...`);
      }

    } catch (error) {
      console.error('Erro no processamento:', error);
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Dados inválidos',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      return reply.code(500).send({
        error: 'Erro no processamento',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
        ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {})
      });
    }
  });
}