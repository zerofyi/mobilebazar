<x-email-layout preheader="Your verification code is {{ $code }}">
    <td class="px" style="padding:70px 48px 0 48px; text-align: left;">
        <p class="eyebrow" style="...">Authentication</p>
        <h1 class="h1" style="...">Your verification code</h1>
        <p class="body-p" style="...">Please use the verification code below to sign in.</p>

        <table role="presentation" width="100%" style="margin:8px 0 28px 0;">
            <tr>
                <td class="code-box" style="...">
                    <span class="code-text" style="...">{{ $code }}</span>
                </td>
            </tr>
        </table>
    </td>
</x-email-layout>
