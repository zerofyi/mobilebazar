@props([
    'preheader' => 'Notification from Mobile Bazar',
    'title' => 'Mobile Bazar',
])
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{{ $title }}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style type="text/css">
  /* Client resets */
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  a { text-decoration:none; }

  /* Stop iOS auto-linking addresses/dates and recolouring them blue */
  a[x-apple-data-detectors], .unstyle-auto-detected-links a, .aBn {
    color:inherit !important; text-decoration:none !important; font-size:inherit !important;
    font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important;
    border-bottom:0 !important;
  }

  /* ══ MOBILE SCALE ══ */
  @media screen and (max-width:620px) {
    .wrap      { width:100% !important; max-width:100% !important; }
    .outer-pad { padding:12px 8px !important; }

    /* horizontal padding */
    .px        { padding-left:16px !important; padding-right:24px !important; }
    .px-foot   { padding-left:16px !important; padding-right:24px !important; }

    /* type scale */
    .m-eyebrow { font-size:11px !important; line-height:16px !important; letter-spacing:1.4px !important; }
    .m-h1      { font-size:14px !important; line-height:20px !important; }
    .m-body    { font-size:10px !important; line-height:16px !important; }
    .m-muted   { font-size:10px !important; line-height:16px !important; }
    .m-tiny    { font-size:8px !important; line-height:10px !important; }
    .m-btn     { font-size:12px !important; padding:10px 14px !important; }
    .m-tag-main{ font-size:8px !important; line-height:15px !important; }
    .m-tag-sub { font-size:12px !important; line-height:19px !important; }
    .m-ft-name { font-size:12px !important; line-height:15px !important; }
    .m-ft      { font-size:8px !important; line-height:11px !important; }
    .m-ft-xs   { font-size:8px !important; line-height:10px !important; }
    .m-chip    { font-size:11px !important; }

    /* vertical rhythm */
    .m-divider-pad { padding-top:16px !important; }
    .m-tag-pad     { padding-top:16px !important; padding-bottom:32px !important; }
    .m-tag-inner   { padding:16px !important; }
    .m-foot-top    { padding:16px !important; }
    .m-foot-chips  { padding:0px 16px 16px 16px !important; }
    .m-foot-legal  { padding:16px 24px 26px 24px !important; }
    .m-chip-cell   { padding:6px 14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

{{-- Preheader --}}
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#000000;">
  {{ $preheader }}
  &#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;margin:0;padding:0;">
<tr>
<td class="outer-pad" align="center" style="background-color:#000000;padding:20px 10px;">

<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td width="600" style="width:600px;"><![endif]-->
<table role="presentation" class="wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

  {{-- ══ HERO + CARD ══ --}}
  <tr>
    <td align="center" style="background-color:#0d0d0f;border-radius:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">

        {{-- HERO: rounded top corners + frosted logo badge baked into the PNG --}}
        <tr>
          <td align="center" style="background-color:#000000;font-size:0;line-height:0;padding:0;">
            <img src="https://mobilebazarapp.in/email/email-header.png"
                 width="600" alt="Mobile Bazar"
                 style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>

        {{-- ══ SLOT: page-specific content (must be a <td>) ══ --}}
        <tr>
          {{ $slot }}
        </tr>

        {{-- Divider --}}
        <tr>
          <td class="px m-divider-pad" style="background-color:#0d0d0f;padding:32px 48px 0 48px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="height:1px;line-height:1px;font-size:0;background-color:#232325;">&nbsp;</td>
            </tr></table>
          </td>
        </tr>

        {{-- Tagline block --}}
        <tr>
          <td class="px m-tag-pad" style="background-color:#0d0d0f;padding:26px 48px 44px 48px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1a1c;border:1px solid #2c2c2e;border-radius:10px;">
              <tr>
                <td class="m-tag-inner" align="center" style="padding:24px 28px;">
                  <p class="m-tag-main" style="margin:0 0 7px 0;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;font-weight:600;mso-line-height-rule:exactly;">
                    Visit your nearby store and get your dream phone<br>at an unthinkably low price.
                  </p>
                  <p class="m-tag-sub" style="margin:0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;font-style:italic;letter-spacing:.3px;mso-line-height-rule:exactly;">
                    Mobile means Mobile Bazar.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>

  <tr><td style="background-color:#000000;height:16px;font-size:0;line-height:16px;">&nbsp;</td></tr>

  {{-- ══ FOOTER ══ --}}
  <tr>
    <td style="background-color:#0a0a0a;border-radius:12px;padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="m-foot-top" align="center" style="padding:32px 40px 12px 40px;">
            <p class="m-ft-name" style="margin:0 0 4px 0;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;font-weight:600;letter-spacing:.5px;mso-line-height-rule:exactly;">
              MOBILE BAZAR
            </p>
            <p class="m-ft" style="margin:0 0 20px 0;color:#8a8a8e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;mso-line-height-rule:exactly;">
              New &amp; Pre-Owned Smartphones &middot; Multiple Stores<br>
              Murshidabad, West Bengal, India
            </p>
          </td>
        </tr>
        <tr>
          <td class="m-foot-chips" align="center" style="padding:0 40px 24px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td class="m-chip-cell" style="border:1px solid #2c2c2e;border-radius:20px;padding:8px 18px;">
                  <a class="m-chip" href="{{ $storesUrl ?? 'https://mobilebazarapp.in/stores' }}" style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;line-height:16px;text-decoration:none;">Find a Store</a>
                </td>
                <td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                <td class="m-chip-cell" style="border:1px solid #2c2c2e;border-radius:20px;padding:8px 18px;">
                  <a class="m-chip" href="{{ $shopUrl ?? 'https://mobilebazarapp.in/shop' }}" style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;line-height:16px;text-decoration:none;">Shop Online</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="px-foot" style="padding:0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="height:1px;line-height:1px;font-size:0;background-color:#1f1f21;">&nbsp;</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="m-foot-legal" align="center" style="padding:18px 40px 32px 40px;">
            <p class="m-ft-xs" style="margin:0 0 5px 0;color:#6f6f72;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;mso-line-height-rule:exactly;">
              &copy; {{ date('Y') }} Mobile Bazar. All rights reserved.
            </p>
            <p class="m-ft-xs" style="margin:0;color:#6f6f72;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;mso-line-height-rule:exactly;">
              You received this because you signed up at Mobile Bazar. &nbsp;
              <a href="{{ $unsubscribeUrl ?? 'https://mobilebazarapp.in/unsubscribe' }}" style="color:#8a8a8e;text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="background-color:#000000;height:24px;font-size:0;line-height:24px;">&nbsp;</td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td>
</tr>
</table>
</body>
</html>
