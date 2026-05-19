import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://uugezxinzckuivrwwknc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔥 Webhook chamado:', req.method);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY não configurada!');
    return res.status(500).json({ success: false, error: 'Configuração incompleta' });
  }

  const { name, email, phone, course, source = 'site', page } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Nome e email obrigatórios' });
  }

  try {
    console.log('📤 Enviando lead para Supabase:', { name, email });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        name,
        email,
        phone: phone || '',
        course_interest: course || '',
        source,
        status: 'novo',
        notes: page ? `Lead capturado: ${page}` : 'Lead via webhook',
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro Supabase:', response.status, errorText);
      throw new Error(`Supabase error: ${response.status}`);
    }

    const data = await response.json();
    const leadId = data?.[0]?.id || 'unknown';
    
    console.log('✅ Lead inserido! ID:', leadId);

    return res.status(200).json({ 
      success: true, 
      message: 'Lead cadastrado com sucesso!',
      lead_id: leadId
    });

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro ao processar lead',
      details: error.message
    });
  }
}
