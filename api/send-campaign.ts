import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required' });
    }

    console.log('📧 Iniciando envio da campanha:', campaignId);

    // 1. Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      console.error('Erro ao buscar campanha:', campaignError);
      throw new Error('Campanha não encontrada');
    }

    console.log('📋 Campanha encontrada:', campaign.name);

    // 2. Buscar leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, email, name')
      .in('id', campaign.target_leads);

    if (leadsError) {
      console.error('Erro ao buscar leads:', leadsError);
      throw new Error('Erro ao buscar destinatários');
    }

    console.log(`👥 ${leads.length} destinatários encontrados`);

    // 3. Enviar emails em lote
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as any[],
      total: leads.length,
    };

    for (const lead of leads) {
      try {
        // Substituir {nome} no corpo do email
        const emailBody = campaign.body.replace(/{nome}/g, lead.name || 'Cliente');

        console.log(`📤 Enviando para: ${lead.email}`);

        // Enviar email via Resend
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'Unisafer <contato@unisafereducacional.com.br>',
          to: lead.email,
          subject: campaign.subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              ${emailBody.replace(/\n/g, '<br>')}
              <hr style="margin-top: 40px; border: none; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px; text-align: center;">
                Você recebeu este email porque está cadastrado em nossa base de leads.
              </p>
            </div>
          `,
        });

        if (emailError) {
          throw emailError;
        }

        console.log(`✅ Email enviado para ${lead.email}`);

        // Registrar envio
        await supabase.from('campaign_sends').upsert({
          campaign_id: campaignId,
          lead_id: lead.id,
          email: lead.email,
          sent_at: new Date().toISOString(),
        });

        results.sent++;
      } catch (error: any) {
        console.error(`❌ Erro ao enviar para ${lead.email}:`, error);
        results.failed++;
        results.errors.push({ 
          email: lead.email, 
          error: error.message || 'Erro desconhecido' 
        });

        // Registrar falha
        await supabase.from('campaign_sends').upsert({
          campaign_id: campaignId,
          lead_id: lead.id,
          email: lead.email,
          bounced_at: new Date().toISOString(),
          bounce_reason: error.message,
        });
      }

      // Delay de 200ms entre emails para evitar rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 4. Atualizar campanha
    await supabase
      .from('campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        emails_sent: results.sent,
      })
      .eq('id', campaignId);

    console.log('✅ Campanha finalizada:', results);

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('❌ Erro no envio:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao enviar campanha'
    });
  }
}
