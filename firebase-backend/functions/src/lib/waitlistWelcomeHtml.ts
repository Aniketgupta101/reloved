function escapeHtml(value: string): string {
  if (value.includes("{{")) return value
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function waitlistIntentLine(intent: "donate" | "claim"): string {
  return intent === "donate"
    ? "You're on the list as a donor. When we open in Mumbai, we'll reach out so you can give clothes a second life."
    : "You're on the list to claim. When we open in Mumbai, we'll reach out so you can find something you need — free."
}

export function waitlistWelcomeHtml(params: { firstName: string; intentLine: string }): string {
  const name = escapeHtml(params.firstName)
  const intentLine = escapeHtml(params.intentLine)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to the Waitlist</title>
</head>
<body style="margin:0; padding:0; background-color:#EBE7DF; font-family:Manrope, Arial, Helvetica, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:100%; max-width:540px;">
  <tr>
    <td align="center" style="padding-bottom:26px;">
      <img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=16" width="260" height="71" alt="RELOVED" style="display:block; border:0; width:260px; height:71px; max-width:100%;">
    </td>
  </tr>
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111; border-radius:8px;">
        <tr>
          <td style="padding:0 4px 4px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border:1.5px solid #111111; border-radius:8px;">
              <tr>
                <td style="padding:40px 44px 36px 44px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background-color:#C6F136; border-radius:20px; padding:6px 16px;">
                        <span style="font-size:11px; font-weight:900; letter-spacing:2px; text-transform:uppercase; color:#111111;">Waitlist</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:20px 0 8px; font-size:28px; line-height:1.15; font-weight:900; text-transform:uppercase; color:#111111;">
                    Welcome to the Waitlist, ${name}
                  </p>
                  <p style="margin:0 0 18px; font-size:14px; line-height:1.6; color:#595959;">
                    Thanks for saving your spot on Reloved &mdash; Mumbai&rsquo;s Digital Wall of Kindness. ${intentLine}
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E1D8; border-radius:6px;">
                    <tr>
                      <td style="padding:14px 16px; border-bottom:1px solid #E5E1D8;">
                        <span style="font-size:13px; color:#111111; font-weight:700;">No OTP. You&rsquo;re already on the list.</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px;">
                        <span style="font-size:13px; color:#111111; font-weight:700;">We&rsquo;ll email you when Reloved opens in Mumbai.</span>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                    <tr>
                      <td align="center">
                        <a href="https://reloved.digital/" target="_blank" style="display:inline-block; padding:14px 32px; background-color:#111111; border-radius:6px; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#F4F1EA;">
                          Reloved.digital
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding-top:20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111; border-radius:6px;">
        <tr>
          <td align="center" style="padding:18px 20px;">
            <span style="font-style:italic; font-size:14px; font-weight:800; color:#C6F136;">&ldquo;Because preloved only costs kindness.&rdquo;</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:26px 16px 0 16px;">
      <span style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#595959;">RE-LOVED &middot; Preloved for Free</span>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:6px 16px 0 16px;">
      <span style="font-size:11px; color:#8a8a8a;">This is an automated message, please don&rsquo;t reply to this email.</span>
    </td>
  </tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
}
