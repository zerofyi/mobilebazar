<x-email-layout preheader="Your Mobile Bazar invoice is ready">
    <td class="px" style="padding:70px 48px 0 48px; text-align: left;">
        <p class="eyebrow" style="margin:0 0 12px 0;color:#8a8a8e;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;">Order Confirmation</p>
        <h1 class="h1" style="margin:0 0 18px 0;font-size:26px;line-height:34px;color:#0a0a0a;font-weight:700;">Your Mobile Bazar Invoice</h1>
        <p class="body-p" style="margin:0 0 22px 0;font-size:15px;line-height:25px;color:#4b4b4d;">
            Thank you for your purchase, {{ $name ?? 'Customer' }}! Your order has been confirmed and processed successfully. You can view your detailed invoice online or download the attached PDF for your records.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
            <tr>
                <td class="btn-cell" style="background-color:#0a0a0a;border-radius:8px;">
                    <a href="{{ $url }}" target="_blank" class="btn-a" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#ffffff;border-radius:8px;letter-spacing:.15px;">
                        View Invoice Online
                    </a>
                </td>
            </tr>
        </table>
        <p class="muted" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#8a8a8e;">
            Please find your official tax invoice PDF attached to this email.
        </p>
    </td>
</x-email-layout>
