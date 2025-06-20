import { FastifyInstance } from 'fastify';
import z from 'zod';
import db from '../db/database';
import fetch from 'node-fetch';

export default async function extensionRoutes(fastify: FastifyInstance) {
  // Endpoint de teste para validação de imagens
  fastify.post('/test-image', async (request, reply) => {
    const { image } = request.body as { image: string };
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    
    return {
      length: base64Data.length,
      isValid: /^[A-Za-z0-9+/=]+$/.test(base64Data),
      firstChars: base64Data.substring(0, 20) + '...'
    };
  });

  // Endpoint principal de análise
  fastify.post('/', async (request, reply) => {
    // 1. Schema de validação com mensagens claras
    const schema = z.object({
      email: z.string().email({ message: 'E-mail inválido' }),
      password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
      image: z.string()
        .min(100, { message: 'Imagem muito pequena' })
        .refine((val) => {
          const base64Data = val.includes(',') ? val.split(',')[1] : val;
          return /^[A-Za-z0-9+/=]+$/.test(base64Data);
        }, { message: 'Formato Base64 inválido' })
        .refine((val) => {
          const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
          if (!val.startsWith('data:image')) return true; // Aceita Base64 puro
          const mimeType = val.split(';')[0].replace('data:', '');
          return validTypes.includes(mimeType);
        }, { message: 'Tipo de imagem não suportado (use PNG, JPEG ou WebP)' })
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

      // 4. Configuração do prompt de análise
      const prompt = `
Você é um especialista em análise técnica de mercados financeiros. Analise o gráfico fornecido e retorne um JSON estrito com:

{
  "description": "Análise resumida",
  "action": "COMPRA|VENDA|NEUTRO",
  "confidence": 0-100, // Nível de confiança
  "keyLevels": {
    "support": [valores],
    "resistance": [valores]
  },
  "timeframe": "TEMPO_RECOMMENDADO",
  "riskReward": "X:Y",
  "observations": ["lista", "de", "padrões"]
}

Retorne APENAS o JSON válido, sem comentários ou markdown.
`.trim();

      // 5. Processamento com o provedor de IA
      const AI_PROVIDER = process.env.AI_PROVIDER?.toUpperCase() || 'GEMINI';
      const cleanedImage = image.includes(',') ? image.split(',')[1] : image;

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
                      mimeType: image.startsWith('data:') 
                        ? image.split(';')[0].replace('data:', '') 
                        : 'image/png',
                      data: cleanedImage
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
        if (!response.ok) throw new Error(`Gemini: ${result.error?.message || 'Erro desconhecido'}`);
        return parseAIResponse(result.candidates?.[0]?.content?.parts?.[0]?.text, reply);

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
                      url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`
                    }
                  }
                ]
              }],
              max_tokens: 1000,
              temperature: 0.2,
              response_format: { type: 'json_object' }
            })
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(`ChatGPT: ${result.error?.message || 'Erro desconhecido'}`);
        return parseAIResponse(result.choices?.[0]?.message?.content, reply);

      } else {
        throw new Error(`Provedor não suportado: ${AI_PROVIDER}`);
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
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Função auxiliar para parsear respostas da IA
  async function parseAIResponse(text: string | undefined, reply: any) {
    if (!text) throw new Error('Resposta vazia da IA');
    
    try {
      // Extrai JSON de markdown ou parse direto
      const jsonMatch = text.match(/(?:```json\s*)?({[\s\S]+?})(?:\s*```)?/i);
      const jsonString = jsonMatch ? jsonMatch[1] : text;
      const result = JSON.parse(jsonString);
      
      // Validação básica da estrutura
      if (!result.action || !result.keyLevels) {
        throw new Error('Resposta da IA não contém estrutura esperada');
      }
      
      return reply.send(result);
      
    } catch (parseError) {
      console.error('Falha ao parsear:', text);
      throw new Error(`Falha ao processar resposta da IA: ${parseError instanceof Error ? parseError.message : 'Formato inválido'}`);
    }
  }
}