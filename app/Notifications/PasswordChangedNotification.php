<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordChangedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $resetUrl = route('password.request');

        // Formats time explicitly in Indian Standard Time (IST)
        $formattedTime = now()->setTimezone('Asia/Kolkata')->format('M j, Y \a\t g:i A \I\S\T');

        return (new MailMessage)
            ->subject('Security Alert: Your password was changed — Mobile Bazar')
            ->view('emails.auth.password-changed', [
                'name'     => $notifiable->name,
                'email'    => $notifiable->email,
                'time'     => $formattedTime,
                'resetUrl' => $resetUrl,
            ]);
    }
}
