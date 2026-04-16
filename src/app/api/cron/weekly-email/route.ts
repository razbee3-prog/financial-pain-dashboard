import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWeeklyEmail } from "@/lib/email-template";
import { buildSlackMessage } from "@/lib/slack-message";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipient = process.env.EMAIL_RECIPIENT || "razbee3@gmail.com";
  const dashboardUrl =
    process.env.DASHBOARD_URL || "https://financial-pain-dashboard.vercel.app";

  const emailResult = await sendEmail(recipient, dashboardUrl);
  const slackResult = await sendSlack(dashboardUrl);

  return NextResponse.json({
    email: emailResult,
    slack: slackResult,
  });
}

async function sendEmail(recipient: string, dashboardUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: "RESEND_API_KEY not set" };

  try {
    const { subject, html, text } = buildWeeklyEmail(dashboardUrl);
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: "Pain Pulse <onboarding@resend.dev>",
      to: [recipient],
      subject,
      html,
      text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, sent_to: recipient, message_id: result.data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendSlack(dashboardUrl: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { skipped: "SLACK_WEBHOOK_URL not set" };

  try {
    const { blocks, text } = buildSlackMessage(dashboardUrl);
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, status: resp.status, body: body.slice(0, 200) };
    }
    return { ok: true, status: resp.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
