type ShareRecipient = {
  email: string;
  name?: string;
  username?: string;
};

type ShareNotificationInput = {
  ownerName: string;
  ownerEmail: string;
  goalTitle: string;
  recipients: ShareRecipient[];
};

function resolveAppUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";

  if (!value) {
    return "http://localhost:3000";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value.replace(/\/+$/, "")}`;
}

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.SHARE_NOTIFICATION_FROM?.trim() ?? "";

  if (!apiKey || !from) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
    cache: "no-store",
  }).catch(() => null);

  return !!response?.ok;
}

export async function sendGoalSharedNotifications({
  ownerName,
  ownerEmail,
  goalTitle,
  recipients,
}: ShareNotificationInput): Promise<void> {
  if (recipients.length === 0) {
    return;
  }

  const appUrl = resolveAppUrl();
  const senderLabel = ownerName.trim() || ownerEmail.trim();
  const subject = `${senderLabel} shared a goal with you`;

  const jobs = recipients.map(async (recipient) => {
    const displayName = recipient.name?.trim() || recipient.username?.trim() || recipient.email;
    const text = `${senderLabel} shared "${goalTitle}" with you. Open ${appUrl}/dashboard to review and approve.`;
    const html = [
      `<p>Hi ${displayName},</p>`,
      `<p><strong>${senderLabel}</strong> shared the goal <strong>${goalTitle}</strong> with you.</p>`,
      `<p><a href="${appUrl}/dashboard">Open dashboard to review</a></p>`,
    ].join("");
    const sent = await sendViaResend(recipient.email, subject, text, html);

    if (!sent) {
      console.info("[notifications] Share email not sent. Configure RESEND_API_KEY and SHARE_NOTIFICATION_FROM.");
    }
  });

  await Promise.allSettled(jobs);
}

export type { ShareRecipient };
