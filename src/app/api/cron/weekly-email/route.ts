import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWeeklyEmail } from "@/lib/email-template";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  // Verify request comes from Vercel cron OR has the right secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Skip auth check in dev (no CRON_SECRET set)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  const recipient = process.env.EMAIL_RECIPIENT || "razbee3@gmail.com";
  const dashboardUrl =
    process.env.DASHBOARD_URL || "https://financial-pain-dashboard.vercel.app";

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
      return NextResponse.json(
        { error: result.error.message, details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent_to: recipient,
      message_id: result.data?.id,
      subject,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to send email", details: message },
      { status: 500 }
    );
  }
}
