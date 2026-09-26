<x-email-layout
    title="Reset your password — Mobile Bazar"
    preheader="Reset your Mobile Bazar account password securely.">

    <td class="px" style="background-color:#0d0d0f;padding:0 48px 0 48px;text-align:left;">

        <p class="m-eyebrow" style="margin:0 0 12px 0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;line-height:18px;mso-line-height-rule:exactly;">
            Account Security
        </p>

        <h1 class="m-h1" style="margin:0 0 18px 0;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;line-height:34px;font-weight:700;mso-line-height-rule:exactly;">
            Reset your password,<br>{{ $name ?? 'Customer' }}
        </h1>

        <p class="m-body" style="margin:0 0 22px 0;color:#c9c9cc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;">
            We received a request to reset the password for your Mobile Bazar account. Tap the button below to choose a new password.
        </p>

        {{-- CTA Button --}}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px 0;">
            <tr>
                <td align="center" style="background-color:#ffffff;border-radius:8px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="{!! $url !!}"
                        style="height:52px;v-text-anchor:middle;width:220px;" arcsize="14%" fillcolor="#ffffff" stroke="f">
                        <w:anchorlock/>
                        <center style="color:#0a0a0a;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Reset Password</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a class="m-btn" href="{!! $url !!}" target="_blank"
                       style="display:inline-block;padding:16px 36px;color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;border-radius:8px;letter-spacing:.15px;mso-line-height-rule:exactly;">
                        Reset Password
                    </a>
                    <!--<![endif]-->
                </td>
            </tr>
        </table>

        <p class="m-muted" style="margin:0 0 6px 0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;">
            This link expires in 60 minutes.
            If you didn&rsquo;t request a password reset, please ignore this email.
        </p>

        <p class="m-tiny unstyle-auto-detected-links" style="margin:0;color:#6f6f72;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;word-break:break-all;mso-line-height-rule:exactly;">
            Button not working? Copy and paste this link:<br>
            <a href="{!! $url !!}" style="color:#8a8a8e;text-decoration:none;">{!! $url !!}</a>
        </p>

    </td>
</x-email-layout>
