<x-email-layout preheader="Unlock your exclusive discount">
    <td class="px" style="padding:70px 48px 0 48px; text-align: left;">
        <p class="eyebrow" style="margin:0 0 12px 0;color:#8a8a8e;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;">Exclusive Reward</p>
        <h1 class="h1" style="margin:0 0 18px 0;font-size:26px;line-height:34px;color:#0a0a0a;font-weight:700;">A special gift for you</h1>
        <p class="body-p" style="margin:0 0 22px 0;font-size:15px;line-height:25px;color:#4b4b4d;">
            As a valued customer, we&rsquo;re giving you an exclusive discount on your next purchase at Mobile Bazar. Apply the code below at checkout or show it in-store.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
            <tr>
                <td class="code-box" style="border: 2px dashed #e5e5e7; border-radius: 8px; text-align: center; padding: 20px;">
                    <span class="code-text" style="color: #0a0a0a; font-size: 24px; font-weight: 700; letter-spacing: 3px;">{{ $couponCode }}</span>
                </td>
            </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
            <tr>
                <td class="btn-cell" style="background-color:#0a0a0a;border-radius:8px;">
                    <a href="{{ $url ?? 'https://mobilebazar.in/shop' }}" target="_blank" class="btn-a" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#ffffff;border-radius:8px;letter-spacing:.15px;">
                        Shop Now
                    </a>
                </td>
            </tr>
        </table>
        <p class="muted" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#8a8a8e;">
            Coupon is valid for 30 days. Standard terms and conditions apply.
        </p>
    </td>
</x-email-layout>
