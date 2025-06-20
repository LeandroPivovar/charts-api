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

      // 5. Configuração do prompt de análise (mantido igual ao geminiRoute)
      const prompt = `
Você é o melhor day trader brasileiro. Analise o gráfico na imagem e retorne um JSON estrito com os seguintes campos:

{
  "description": "descrição breve da análise",
  "action": "COMPRA" ou "VENDA",
  "percentage": número,  // confiança na recomendação em %
  "stopLoss": número,    // porcentagem 
  "takeProfit": número,  // porcentagem
  "riskReward": número,  // relação risco/retorno
  "analysis": {
    "pattern": "descrição do padrão gráfico",
    "trend": "descrição da tendência",
    "volume": "descrição do volume",
    "support": "valor do suporte",
    "resistance": "valor da resistência"
  }
}

Retorne apenas o JSON, sem explicações, comentários ou formatação extra.
`.trim();

      const AI_PROVIDER = process.env.AI_PROVIDER?.toUpperCase() || 'GEMINI';

      if (AI_PROVIDER === 'GEMINI') {
        // 6. Processamento com Gemini (atualizado conforme geminiRoute)
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { 
                    inlineData: {
                      mimeType: mimeType || 'image/png',
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
          return reply.code(500).send({ 
            error: 'Erro ao consultar Gemini', 
            details: result 
          });
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        try {
          const match = text.match(/```json\s*([\s\S]*?)```/i);
          const cleaned = match ? match[1] : text;
          const parsed = JSON.parse(cleaned);
          return reply.send(parsed);
        } catch (e) {
          return reply.send({
            description: 'Formato inesperado do Gemini',
            raw: text,
          });
        }

      } else if (AI_PROVIDER === 'CHATGPT') {
        // 7. Processamento com ChatGPT (atualizado conforme geminiRoute)
        const chatGPTBody = {
          model: 'gpt-4o',
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType || 'image/png'};base64,${base64Data}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.5,
          response_format: { type: 'json_object' }
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify(chatGPTBody)
        });

        const result = await response.json();

        if (!response.ok) {
          return reply.code(500).send({ 
            error: 'Erro ao consultar ChatGPT', 
            details: result 
          });
        }

        try {
          const text = result.choices?.[0]?.message?.content ?? '';
          const match = text.match(/```json\s*([\s\S]*?)```/i);
          const cleaned = match ? match[1] : text;
          const parsed = JSON.parse(cleaned);
          return reply.send(parsed);
        } catch (e) {
          return reply.send({
            description: 'Formato inesperado do ChatGPT',
            raw: result,
          });
        }

      } else {
        return reply.code(400).send({ 
          error: 'Provedor AI inválido configurado no .env' 
        });
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