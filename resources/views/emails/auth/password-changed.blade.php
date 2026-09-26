<x-email-layout
    title="Your password was changed — Mobile Bazar"
    preheader="Security Alert: The password for your Mobile Bazar account was successfully updated.">

    <td class="px" style="background-color:#0d0d0f;padding:0 48px 0 48px;text-align:left;">

        <p class="m-eyebrow" style="margin:0 0 12px 0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;line-height:18px;mso-line-height-rule:exactly;">
            Security Notification
        </p>

        <h1 class="m-h1" style="margin:0 0 18px 0;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;line-height:34px;font-weight:700;mso-line-height-rule:exactly;">
            Password Changed,<br>{{ $name ?? 'Customer' }}
        </h1>

        <p class="m-body" style="margin:0 0 22px 0;color:#c9c9cc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;">
            The password for your account (<strong>{{ $email }}</strong>) was successfully changed on <strong>{{ $time }}</strong>.
        </p>

        {{-- Security Alert Card --}}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;background-color:#1c1917;border:1px solid #7c2d12;border-radius:10px;">
            <tr>
                <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px 0;color:#f97316;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:20px;">
                        Didn't make this change?
                    </p>
                    <p style="margin:0;color:#d6d3d1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;">
                        If you did not request this password change, your account may be compromised. Please reset your password immediately or contact our support team.
                    </p>
                </td>
            </tr>
        </table>

        {{-- CTA Button --}}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px 0;">
            <tr>
                <td align="center" style="background-color:#ffffff;border-radius:8px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="{!! $resetUrl !!}"
                        style="height:52px;v-text-anchor:middle;width:240px;" arcsize="14%" fillcolor="#ffffff" stroke="f">
                        <w:anchorlock/>
                        <center style="color:#0a0a0a;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Secure Your Account</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a class="m-btn" href="{!! $resetUrl !!}" target="_blank"
                       style="display:inline-block;padding:16px 36px;color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;border-radius:8px;letter-spacing:.15px;mso-line-height-rule:exactly;">
                        Secure Your Account
                    </a>
                    <!--<![endif]-->
                </td>
            </tr>
        </table>

        <p class="m-muted" style="margin:0 0 6px 0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;">
            If you changed your password yourself, no further action is required.
        </p>

    </td>
</x-email-layout>
