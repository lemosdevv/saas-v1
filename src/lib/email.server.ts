import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Default para onboarding@resend.dev caso o domínio próprio não esteja verificado no Resend
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// Helper para encapsular o template HTML padrão com cabeçalho e rodapé elegantes do Agenday
function getEmailLayout(title: string, bodyContent: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .container { max-width: 580px; margin: 0 auto; bg-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background-color: #581c3f; padding: 32px 24px; text-align: center; }
        .logo { font-size: 28px; font-weight: bold; color: #ffffff; letter-spacing: -1px; text-decoration: none; }
        .content { padding: 32px 24px; background-color: #ffffff; line-height: 1.6; }
        .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        .button { display: inline-block; background-color: #9f3b65; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .highlight { color: #9f3b65; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="logo">agenday</span>
        </div>
        <div class="content">
          ${bodyContent}
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Agenday. Todos os direitos reservados.</p>
          <p>Você recebeu este e-mail porque se cadastrou na nossa plataforma.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendWelcomeEmail(opts: { email: string; name: string; businessName: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY não configurada. Ignorando envio.");
    return;
  }

  const title = "Bem-vindo ao Agenday!";
  const body = `
    <h2>Olá, ${opts.name}! 👋</h2>
    <p>Estamos muito felizes em ter você conosco! O cadastro do seu negócio, <strong class="highlight">${opts.businessName}</strong>, foi concluído com sucesso.</p>
    <p>O Agenday foi feito para simplificar sua rotina de agendamentos. A partir de agora, seus clientes podem marcar horários de forma online 24h por dia.</p>
    <p>Aqui estão as suas primeiras etapas sugeridas:</p>
    <ul>
      <li>Cadastre seus <strong>serviços</strong> e defina a duração e preço.</li>
      <li>Adicione os membros da sua <strong>equipe</strong> se possuir profissionais adicionais.</li>
      <li>Divulgue o seu <strong>link público de agendamento</strong> no seu perfil do Instagram e no WhatsApp.</li>
    </ul>
    <center>
      <a href="${process.env.VITE_APP_URL || "http://localhost:8080"}/app" class="button">Acessar Meu Painel</a>
    </center>
    <p>Se tiver qualquer dúvida ou precisar de ajuda para configurar sua agenda, basta responder a este e-mail.</p>
    <p>Boas vendas!<br><strong>Equipe Agenday</strong></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.email,
      subject: title,
      html: getEmailLayout(title, body),
    });
  } catch (err) {
    console.error("[email] Erro ao enviar e-mail de boas-vindas:", err);
  }
}

export async function sendTrialEndingEmail(opts: { email: string; name: string; daysLeft: number }) {
  if (!process.env.RESEND_API_KEY) return;

  const title = "Seu período de teste está chegando ao fim!";
  const body = `
    <h2>Olá, ${opts.name}!</h2>
    <p>Passando para lembrar que restam apenas <strong class="highlight">${opts.daysLeft} dias</strong> do seu período de teste grátis no Agenday.</p>
    <p>Esperamos que você esteja aproveitando a facilidade dos agendamentos online automáticos e economizando tempo no seu dia a dia.</p>
    <p>Para não perder o acesso ao seu painel e garantir que seus clientes possam continuar agendando com você, escolha um plano de assinatura.</p>
    <center>
      <a href="${process.env.VITE_APP_URL || "http://localhost:8080"}/app/pagamentos" class="button">Assinar Agora</a>
    </center>
    <p>Qualquer dúvida sobre os planos ou a assinatura, conte com a nossa equipe.</p>
    <p>Atenciosamente,<br><strong>Equipe Agenday</strong></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.email,
      subject: title,
      html: getEmailLayout(title, body),
    });
  } catch (err) {
    console.error("[email] Erro ao enviar e-mail de aviso de fim de teste:", err);
  }
}

export async function sendTrialExpiredEmail(opts: { email: string; name: string }) {
  if (!process.env.RESEND_API_KEY) return;

  const title = "Seu período de teste expirou!";
  const body = `
    <h2>Olá, ${opts.name}!</h2>
    <p>O período de teste gratuito de 15 dias do seu negócio no Agenday terminou.</p>
    <p>Seus clientes temporariamente não conseguem marcar agendamentos online e o seu acesso ao painel de gestão foi pausado.</p>
    <p>Não se preocupe: todos os seus dados de clientes, serviços e histórico estão salvos com total segurança. Para restabelecer o acesso imediatamente e continuar crescendo, basta assinar um dos nossos planos.</p>
    <center>
      <a href="${process.env.VITE_APP_URL || "http://localhost:8080"}/app/pagamentos" class="button">Escolher Meu Plano</a>
    </center>
    <p>Se precisar de ajuda ou de mais tempo para testar, responda a este e-mail para batermos um papo.</p>
    <p>Um abraço,<br><strong>Equipe Agenday</strong></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.email,
      subject: title,
      html: getEmailLayout(title, body),
    });
  } catch (err) {
    console.error("[email] Erro ao enviar e-mail de teste expirado:", err);
  }
}

export async function sendPaymentOverdueEmail(opts: {
  email: string;
  name: string;
  planName: string;
  amount: number;
  checkoutUrl: string;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const title = "Pagamento da assinatura pendente!";
  const body = `
    <h2>Olá, ${opts.name}!</h2>
    <p>Identificamos que o pagamento da mensalidade do seu <strong class="highlight">${opts.planName}</strong> (R$ ${opts.amount.toFixed(2).replace(".", ",")}) ainda não foi concluído.</p>
    <p>O link de pagamento via Pix gerado está prestes a expirar. Para manter a sua agenda ativa e evitar qualquer interrupção no serviço dos seus clientes, você pode realizar o pagamento agora mesmo.</p>
    <center>
      <a href="${opts.checkoutUrl}" class="button">Pagar Agora</a>
    </center>
    <p>Caso já tenha efetuado o pagamento, por favor desconsidere este e-mail. A confirmação bancária costuma levar poucos minutos.</p>
    <p>Se tiver algum problema ou precisar de suporte, estamos à disposição.</p>
    <p>Abraço,<br><strong>Equipe Agenday</strong></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.email,
      subject: title,
      html: getEmailLayout(title, body),
    });
  } catch (err) {
    console.error("[email] Erro ao enviar e-mail de faturamento atrasado:", err);
  }
}
