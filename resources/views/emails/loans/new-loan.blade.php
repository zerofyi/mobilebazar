<x-email-layout preheader="Your smartphone financing is activated">
    <td class="px" style="padding:70px 48px 0 48px; text-align: left;">
        <p class="eyebrow" style="margin:0 0 12px 0;color:#8a8a8e;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;">Financing</p>
        <h1 class="h1" style="margin:0 0 18px 0;font-size:26px;line-height:34px;color:#0a0a0a;font-weight:700;">Your Loan Agreement</h1>
        <p class="body-p" style="margin:0 0 22px 0;font-size:15px;line-height:25px;color:#4b4b4d;">
            Congratulations on your new purchase, {{ $name ?? 'Customer' }}! Your smartphone financing plan has been successfully activated. You can review your EMI schedule and track payments via your dashboard.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
            <tr>
                <td class="btn-cell" style="background-color:#0a0a0a;border-radius:8px;">
                    <a href="{{ $url }}" target="_blank" class="btn-a" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#ffffff;border-radius:8px;letter-spacing:.15px;">
                        View Loan Dashboard
                    </a>
                </td>
            </tr>
        </table>
        <p class="muted" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#8a8a8e;">
            Your formal loan agreement and complete EMI schedule PDF are attached to this email.
        </p>
    </td>
</x-email-layout>
