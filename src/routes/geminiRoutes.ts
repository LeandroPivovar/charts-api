import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import fetch from 'node-fetch';

export default async function geminiRoute(fastify: FastifyInstance) {
  fastify.register(multipart);

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();

    if (!file?.mimetype?.startsWith('image/')) {
      return reply.code(400).send({ error: 'Envie um arquivo de imagem válido.' });
    }

    const buffer = await file.toBuffer();
    const ext = path.extname(file.filename) || '.jpg';
    const tmpPath = path.join(tmpdir(), `${Date.now()}${ext}`);
    await fs.writeFile(tmpPath, buffer);

    const imageBase64 = buffer.toString('base64');

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
                      mimeType: file.mimetype,
                      data: imageBase64,
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
      // Corpo da requisição para ChatGPT
      const chatGPTBody = {
        model: 'gpt-4o', // ou outro modelo que usar
        messages: [
          { role: 'system', content: 'Você é o melhor day trader brasileiro.' },
          { role: 'user', content: prompt },
          // Pode tentar incluir a imagem como base64 na mensagem, se API permitir,
          // ou enviar o texto e esperar análise sem imagem.
          // Se o ChatGPT não suporta imagem, você pode omitir ou adaptar.
        ],
        max_tokens: 1000,
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

      try {
        // Supondo que a resposta venha em result.choices[0].message.content
        const text = result.choices?.[0]?.message?.content ?? '';
        // Tentativa de extrair JSON do texto (em caso de resposta formatada)
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
      return reply.code(400).send({ error: 'Provedor AI inválido configurado no .env' });
    }
  });
}
