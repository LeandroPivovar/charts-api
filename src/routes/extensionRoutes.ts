import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import fetch from 'node-fetch';

export default async function extensionRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    // 1. Validação dos dados de entrada
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      image: z.string().refine((val) => {
        const base64Data = val.includes(',') ? val.split(',')[1] : val;
        return base64Data.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(base64Data);
      }, {
        message: 'Imagem deve ser um Base64 válido com pelo menos 1KB de dados'
      }),
    });

    try {
      const { email, password, image } = schema.parse(request.body);

      // 2. Autenticação do usuário
      const user = await db('users')
        .where({ mail: email, password, status: 'active' })
        .first();

      if (!user) {
        return reply.code(401).send({ error: 'Usuário ou senha inválidos' });
      }

      // 3. Preparação do prompt e dados da imagem
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
`.trim();

      const AI_PROVIDER = process.env.AI_PROVIDER?.toUpperCase() || 'GEMINI';
      const cleanedImage = image.includes(',') ? image.split(',')[1] : image;

      // 4. Processamento com o provedor de IA selecionado
      if (AI_PROVIDER === 'GEMINI') {
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
                      mimeType: 'image/png',
                      data: cleanedImage
                    }
                  }
                ]
              }]
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error('Erro Gemini:', result);
          return reply.code(500).send({ 
            error: 'Erro ao consultar Gemini',
            details: result.error?.message || 'Erro desconhecido'
          });
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        return parseAndSendResponse(text, reply);

      } else if (AI_PROVIDER === 'CHATGPT') {
        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${image}`
                    }
                  }
                ]
              }],
              max_tokens: 800,
              temperature: 0.5,
              response_format: { type: 'json_object' }
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error('Erro ChatGPT:', result);
          return reply.code(500).send({
            error: 'Erro ao consultar ChatGPT',
            details: result.error?.message || 'Erro desconhecido'
          });
        }

        const text = result.choices?.[0]?.message?.content ?? '';
        return parseAndSendResponse(text, reply);

      } else {
        return reply.code(400).send({
          error: 'Provedor AI inválido',
          details: `Configure AI_PROVIDER como GEMINI ou CHATGPT no .env (atual: ${AI_PROVIDER})`
        });
      }

    } catch (error) {
      console.error('Erro no servidor:', error);
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Dados inválidos',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }

      return reply.code(500).send({
        error: 'Erro interno no servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });
}

// Função auxiliar para processar a resposta da IA
async function parseAndSendResponse(text: string, reply: any) {
  try {
    // Tenta extrair JSON de markdown ou parse direto
    const match = text.match(/(?:```json\s*)?({[\s\S]*?})(?:\s*```)?/i);
    const jsonString = match ? match[1] : text;
    const parsed = JSON.parse(jsonString);
    
    return reply.send({ resultado: parsed });
    
  } catch (parseError) {
    console.error('Erro ao parsear resposta:', parseError, 'Texto:', text);
    return reply.code(500).send({
      error: 'Erro ao processar resposta da IA',
      details: 'A resposta não continha um JSON válido',
      rawResponse: text
    });
  }
}