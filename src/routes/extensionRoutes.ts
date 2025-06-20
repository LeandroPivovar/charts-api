import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import fetch from 'node-fetch';

export default async function extensionRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const schema = z.object({
      email: z.string(),
      password: z.string(),
      image: z.string(), // base64 sem cabeçalho
    });

    const { email, password, image } = schema.parse(request.body);

    const user = await db('users')
      .where({ mail: email, password, status: 'active' })
      .first();

    if (!user) {
      return reply.code(401).send({ error: 'Usuário ou senha inválidos' });
    }

    const prompt = `
Você é o melhor day trader brasileiro. Analise o gráfico na imagem e retorne um JSON estrito com os seguintes campos:

{
  "description": "descrição breve da análise",
  "action": "COMPRA" ou "VENDA",
  "percentage": número,  // confiança na recomendação em %
  "stopLoss": número,    // preço para stop loss
  "takeProfit": número,  // preço para take profit
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
`;

    const AI_PROVIDER = process.env.AI_PROVIDER?.toUpperCase() || 'GEMINI';
    let response, result;

    try {
      if (AI_PROVIDER === 'GEMINI') {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: 'image/png',
                        data: image, // apenas base64 sem cabeçalho
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );

        result = await response.json();

        if (!response.ok) {
          return reply.code(500).send({ error: 'Erro ao consultar Gemini', details: result });
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const match = text.match(/```json\s*([\s\S]*?)```/i);
        const cleaned = match ? match[1] : text;
        const parsed = JSON.parse(cleaned);
        return reply.send({ resultado: parsed });

      } else if (AI_PROVIDER === 'CHATGPT') {
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
                    url: `data:image/png;base64,${image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 800,
          temperature: 0.5,
        };

        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(chatGPTBody),
        });

        result = await response.json();

        if (!response.ok) {
          return reply.code(500).send({ error: 'Erro ao consultar ChatGPT', details: result });
        }

        const text = result.choices?.[0]?.message?.content ?? '';
        const match = text.match(/```json\s*([\s\S]*?)```/i);
        const cleaned = match ? match[1] : text;
        const parsed = JSON.parse(cleaned);
        return reply.send({ resultado: parsed });

      } else {
        return reply.code(400).send({ error: 'Provedor AI inválido configurado no .env' });
      }

    } catch (error) {
      console.error('Erro ao processar imagem com IA:', error);
      return reply.code(500).send({ error: 'Erro ao processar imagem com IA', details: error });
    }
  });
}
